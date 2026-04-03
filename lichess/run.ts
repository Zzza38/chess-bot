/**
 * Lichess Bot API — standard chess, multiple games in parallel (one NDJSON stream per game).
 * Move choice: WASM engine search (fast at high depth); position replay + UCI for Lichess via JS ChessBot.
 * When under LICHESS_MAX_CONCURRENT_GAMES, accepts pending incoming challenges (humans),
 * then may challenge LICHESS_OPPONENT, LICHESS_CHALLENGE_POOL (humans),
 * LICHESS_BOT_POOL (other engine bots), or Lichess AI only if LICHESS_IDLE_AI=1/true.
 * (Lobby /board/seek is for human accounts with board:play, not typical bot tokens.)
 *
 * @see https://lichess.org/api#tag/Bot
 * @see https://raw.githubusercontent.com/lichess-org/api/master/doc/specs/tags/challenges/api-challenge-ai.yaml
 */
import "dotenv/config";
import { ChessBot } from "../engine/chess-bot.js";
import wasmModule from "../engine-wasm/wrapper.js";
import type { WasmChessBot as WasmChessBotClass } from "../engine-wasm/wrapper.js";

/** tsx/CJS can expose the class as default, as `default.WasmChessBot`, or as `WasmChessBot`. */
function resolveWasmChessBotCtor(mod: unknown): typeof WasmChessBotClass {
    if (typeof mod === "function") return mod as typeof WasmChessBotClass;
    if (mod && typeof mod === "object") {
        const o = mod as Record<string, unknown>;
        const w = o.WasmChessBot;
        if (typeof w === "function") return w as typeof WasmChessBotClass;
        const d = o.default;
        if (typeof d === "function") return d as typeof WasmChessBotClass;
        if (d && typeof d === "object" && typeof (d as Record<string, unknown>).WasmChessBot === "function") {
            return (d as { WasmChessBot: typeof WasmChessBotClass }).WasmChessBot;
        }
    }
    throw new Error("Could not resolve WasmChessBot from engine-wasm/wrapper (tsx/CJS interop shape changed)");
}

const WasmChessBot = resolveWasmChessBotCtor(wasmModule);

const LICHESS_ORIGIN = "https://lichess.org";
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const PLAYABLE_STATUS = new Set(["created", "started"]);

/** Games we're already streaming (avoid duplicate handlers if `gameStart` repeats). */
const activeGameStreams = new Set<string>();

/** Set in main() from LICHESS_MAX_CONCURRENT_GAMES (default 1). */
let maxConcurrentGames = 1;

/** WASM `engine_search` allows depth 1–20 (see engine-wasm/src/api.c). */
const DEFAULT_DEPTH = 8;
const MAX_DEPTH = 20;

const IDLE_DEBOUNCE_MS = 2500;
const IDLE_COOLDOWN_MS = 12000;
/** Between outbound challenges while already running at least one game but under max concurrency. */
const IDLE_COOLDOWN_FILL_MS = 2000;
const STARTUP_ENSURE_MS = 8000;
/** Reconcile with Lichess in case `gameStart` is missed or a bot stream dies without cleanup. */
const PLAYING_POLL_MS = 10_000;

/** Stockfish-on-Lichess (`/api/challenge/ai`) — opt-in via LICHESS_IDLE_AI; default off. */
function wantIdleLichessAi(): boolean {
    const s = process.env.LICHESS_IDLE_AI?.trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes";
}

let idleDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastIdleActionAt = 0;

/** One WASM search / position at a time — the C engine uses a single global board. */
let searchMutex: Promise<void> = Promise.resolve();

function acquireSearchLock<T>(fn: () => T | Promise<T>): Promise<T> {
    const done = searchMutex.then(async () => {
        await new Promise<void>((r) => setImmediate(r));
        return await fn();
    });
    searchMutex = done.then(
        () => {},
        () => {},
    );
    return done;
}

function normalizeGameStatus(state: Record<string, unknown>): string | undefined {
    const raw = state.status;
    if (typeof raw === "string") return raw;
    if (raw && typeof raw === "object" && "name" in raw) {
        const n = (raw as { name?: unknown }).name;
        if (typeof n === "string") return n;
    }
    return undefined;
}

function parseInitialFen(initialFen: string): string {
    return initialFen === "startpos" ? START_FEN : initialFen;
}

/**
 * Replay UCI on the JS board, feed FEN to WASM for search, map best SAN to UCI for the HTTP API.
 * (Shipped `chess-engine.wasm` exposes SAN-only search; SAN→UCI uses one ply on ChessBot.)
 */
async function searchBestUciWithWasm(
    initialFen: string,
    movesUci: string,
    depth: number,
): Promise<{ uci: string; score: number }> {
    const d = Math.min(20, Math.max(1, depth));
    const replay = new ChessBot(parseInitialFen(initialFen));
    for (const m of movesUci.trim().split(/\s+/).filter(Boolean)) {
        if (!replay.makeUciMove(m)) throw new Error(`Illegal UCI in replay: ${m}`);
    }
    const fen = replay.toFEN();

    const wasm = new WasmChessBot(fen);
    await wasm.ready;
    const { notation, score } = wasm.search(d);
    if (!notation.trim()) return { uci: "", score };

    const root = new ChessBot(fen);
    const line = new ChessBot(fen);
    if (!line.makeMove(notation)) {
        throw new Error(`WASM best move not legal in JS: ${notation}`);
    }
    const uci = root.toUci(root.board, line.board).toLowerCase();
    return { uci, score };
}

function isOurTurn(ourColor: "white" | "black", plyCount: number): boolean {
    const whiteToMove = plyCount % 2 === 0;
    return (ourColor === "white") === whiteToMove;
}

async function* ndjsonStream(response: Response): AsyncGenerator<Record<string, unknown>> {
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
            const t = line.trim();
            if (!t) continue;
            yield JSON.parse(t) as Record<string, unknown>;
        }
        if (done) break;
    }
}

interface GameStartPayload {
    gameId?: string;
    id?: string;
    variant?: { key?: string };
    compat?: { bot?: boolean; board?: boolean };
    color?: string;
}

interface ChallengePayload {
    id?: string;
    variant?: { key?: string };
    destUser?: { id?: string };
    status?: string;
    compat?: { bot?: boolean };
}

function compatAllowsBot(game: GameStartPayload | ChallengePayload | undefined, event: Record<string, unknown>): boolean {
    const compat =
        game?.compat ?? (event.compat as { bot?: boolean } | undefined);
    return compat?.bot !== false;
}

function authorizeHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

function formHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" };
}

function scheduleEnsurePlaying(token: string, me: string): void {
    if (activeGameStreams.size >= maxConcurrentGames) return;
    if (idleDebounceTimer) clearTimeout(idleDebounceTimer);
    idleDebounceTimer = setTimeout(() => {
        idleDebounceTimer = null;
        void ensurePlayingIfIdle(token, me);
    }, IDLE_DEBOUNCE_MS);
}

/**
 * @see https://lichess.org/openapi.yaml — GET /api/account/playing → { nowPlaying: [{ gameId, variant, color, ... }] }
 */
async function attachMissingPlayingGames(token: string, me: string, depth: number): Promise<void> {
    let r: Response;
    try {
        r = await fetch(`${LICHESS_ORIGIN}/api/account/playing?nb=50`, { headers: authorizeHeaders(token) });
    } catch (e) {
        console.error("[playing] poll:", e);
        return;
    }
    if (!r.ok) {
        console.error(`[playing] poll ${r.status} ${await r.text()}`);
        return;
    }
    const data = (await r.json()) as {
        nowPlaying?: Array<{ gameId?: string; variant?: { key?: string }; color?: string }>;
    };
    for (const g of data.nowPlaying ?? []) {
        const gameId = g.gameId;
        if (!gameId) continue;
        if (g.variant?.key && g.variant.key !== "standard") continue;
        if (activeGameStreams.has(gameId)) continue;

        const c = g.color;
        const knownColor: "white" | "black" | null = c === "white" || c === "black" ? c : null;
        console.log(`[playing] attach missed game ${gameId} (color=${knownColor ?? "from stream"})`);

        activeGameStreams.add(gameId);
        scheduleEnsurePlaying(token, me);
        void playBotGame(token, gameId, knownColor, depth, me).finally(() => {
            activeGameStreams.delete(gameId);
            scheduleEnsurePlaying(token, me);
        });
    }
}

function pickRandomFromUsernameEnvList(list: string | undefined, me: string): string | null {
    const raw = list?.trim();
    if (!raw) return null;
    const names = raw
        .split(/[,\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0 && s !== me);
    if (!names.length) return null;
    return names[Math.floor(Math.random() * names.length)] ?? null;
}

function pickPoolOpponent(me: string): string | null {
    return pickRandomFromUsernameEnvList(process.env.LICHESS_CHALLENGE_POOL, me);
}

function pickBotPoolOpponent(me: string): string | null {
    return pickRandomFromUsernameEnvList(process.env.LICHESS_BOT_POOL, me);
}

async function acceptChallenge(token: string, challengeId: string): Promise<boolean> {
    const r = await fetch(`${LICHESS_ORIGIN}/api/challenge/${challengeId}/accept`, {
        method: "POST",
        headers: authorizeHeaders(token),
    });
    if (r.ok) {
        console.log(`[challenge] accepted ${challengeId}`);
        lastIdleActionAt = Date.now();
        return true;
    }
    console.error(`[challenge] accept ${challengeId}: ${r.status} ${await r.text()}`);
    return false;
}

async function tryAcceptIncomingFromApi(token: string): Promise<boolean> {
    if (activeGameStreams.size >= maxConcurrentGames) return false;
    const r = await fetch(`${LICHESS_ORIGIN}/api/challenge`, { headers: authorizeHeaders(token) });
    if (!r.ok) {
        console.error(`[challenge] list: ${r.status} ${await r.text()}`);
        return false;
    }
    const data = (await r.json()) as { in?: Array<{ id?: string; variant?: { key?: string } }> };
    let accepted = false;
    for (const c of data.in ?? []) {
        if (activeGameStreams.size >= maxConcurrentGames) break;
        if (!c.id) continue;
        if (c.variant?.key && c.variant.key !== "standard") continue;
        if (await acceptChallenge(token, c.id)) {
            accepted = true;
            await new Promise<void>((r) => setTimeout(r, 400));
        }
    }
    return accepted;
}

async function challengeUser(token: string, username: string): Promise<boolean> {
    const limit = process.env.LICHESS_CLOCK_LIMIT_SEC ?? "300";
    const inc = process.env.LICHESS_CLOCK_INC_SEC ?? "0";
    const rated = process.env.LICHESS_RATED === "1" ? "true" : "false";
    const body = new URLSearchParams({
        "clock.limit": limit,
        "clock.increment": inc,
        rated,
        variant: "standard",
        color: process.env.LICHESS_CHALLENGE_COLOR ?? "random",
    });
    const r = await fetch(`${LICHESS_ORIGIN}/api/challenge/${encodeURIComponent(username)}`, {
        method: "POST",
        headers: formHeaders(token),
        body,
    });
    if (r.ok) {
        console.log(`[challenge] sent to ${username} (${limit}+${inc})`);
        return true;
    }
    console.error(`[challenge] user ${username}: ${r.status} ${await r.text()}`);
    return false;
}

async function challengeAi(token: string): Promise<boolean> {
    const level = Math.min(8, Math.max(1, parseInt(process.env.LICHESS_AI_LEVEL ?? "1", 10) || 1));
    const body = new URLSearchParams({
        level: String(level),
        "clock.limit": process.env.LICHESS_CLOCK_LIMIT_SEC ?? "300",
        "clock.increment": process.env.LICHESS_CLOCK_INC_SEC ?? "0",
        variant: "standard",
        color: "random",
    });
    const r = await fetch(`${LICHESS_ORIGIN}/api/challenge/ai`, {
        method: "POST",
        headers: formHeaders(token),
        body,
    });
    if (r.ok || r.status === 201) {
        console.log(`[challenge] started vs Lichess AI (level ${level})`);
        return true;
    }
    console.error(`[challenge] AI: ${r.status} ${await r.text()}`);
    return false;
}

async function ensurePlayingIfIdle(token: string, me: string): Promise<void> {
    while (activeGameStreams.size < maxConcurrentGames) {
        if (await tryAcceptIncomingFromApi(token)) {
            await new Promise<void>((r) => setTimeout(r, 350));
            continue;
        }
        break;
    }

    if (activeGameStreams.size >= maxConcurrentGames) return;

    const filling =
        activeGameStreams.size > 0 && activeGameStreams.size < maxConcurrentGames;
    const outboundCooldown = filling ? IDLE_COOLDOWN_FILL_MS : IDLE_COOLDOWN_MS;
    if (Date.now() - lastIdleActionAt < outboundCooldown) return;

    const opponent = process.env.LICHESS_OPPONENT?.trim();
    const wantAi = wantIdleLichessAi();
    const poolUser = pickPoolOpponent(me);
    const botPoolUser = pickBotPoolOpponent(me);

    if (opponent) {
        lastIdleActionAt = Date.now();
        await challengeUser(token, opponent);
        return;
    }

    if (poolUser) {
        lastIdleActionAt = Date.now();
        console.log(`[challenge] pool → ${poolUser}`);
        await challengeUser(token, poolUser);
        return;
    }

    if (botPoolUser) {
        lastIdleActionAt = Date.now();
        console.log(`[challenge] bot pool → ${botPoolUser}`);
        await challengeUser(token, botPoolUser);
        return;
    }

    if (wantAi) {
        lastIdleActionAt = Date.now();
        await challengeAi(token);
    }
}

async function main(): Promise<void> {
    const token = process.env.LICHESS_API_KEY?.trim();
    if (!token) {
        console.error("Set LICHESS_API_KEY (bot API token) in .env or the environment.");
        process.exit(1);
    }

    maxConcurrentGames = Math.min(
        50,
        Math.max(1, parseInt(process.env.LICHESS_MAX_CONCURRENT_GAMES ?? "1", 10) || 1),
    );

    const depthRaw = process.env.LICHESS_SEARCH_DEPTH;
    const depth = Math.min(MAX_DEPTH, Math.max(1, parseInt(depthRaw ?? String(DEFAULT_DEPTH), 10) || DEFAULT_DEPTH));

    const accRes = await fetch(`${LICHESS_ORIGIN}/api/account`, { headers: authorizeHeaders(token) });
    if (!accRes.ok) {
        console.error(`account: ${accRes.status} ${await accRes.text()}`);
        process.exit(1);
    }
    const account = (await accRes.json()) as { username?: string; id?: string };
    const me = (account.username ?? account.id ?? "").toLowerCase();
    if (!me) {
        console.error("Could not read username from /api/account");
        process.exit(1);
    }

    const opponent = process.env.LICHESS_OPPONENT?.trim();
    const wantAi = wantIdleLichessAi();
    const poolConfigured = !!process.env.LICHESS_CHALLENGE_POOL?.trim();
    const botPoolConfigured = !!process.env.LICHESS_BOT_POOL?.trim();

    console.log(
        `Bot ${me}: standard, depth ${depth}, up to ${maxConcurrentGames} concurrent games (streams + moves).`,
    );
    console.log(
        `  When below cap: accept incoming → LICHESS_OPPONENT → LICHESS_CHALLENGE_POOL → LICHESS_BOT_POOL → idle AI.`,
    );
    if (!wantAi && !opponent && !poolConfigured && !botPoolConfigured) {
        console.warn(
            "No proactive games: set LICHESS_OPPONENT, LICHESS_CHALLENGE_POOL, LICHESS_BOT_POOL, or LICHESS_IDLE_AI=1 for Lichess AI — otherwise only incoming standard challenges start games.",
        );
    }

    setTimeout(() => scheduleEnsurePlaying(token, me), STARTUP_ENSURE_MS);

    void attachMissingPlayingGames(token, me, depth);
    setInterval(() => {
        void attachMissingPlayingGames(token, me, depth);
    }, PLAYING_POLL_MS);

    const eventRes = await fetch(`${LICHESS_ORIGIN}/api/stream/event`, { headers: authorizeHeaders(token) });
    if (!eventRes.ok) {
        console.error(`stream/event: ${eventRes.status} ${await eventRes.text()}`);
        process.exit(1);
    }

    for await (const ev of ndjsonStream(eventRes)) {
        const t = ev.type;

        if (t === "challenge") {
            const ch = ev.challenge as ChallengePayload | undefined;
            if (!ch?.id || ch.status !== "created") continue;
            if (ch.variant?.key && ch.variant.key !== "standard") continue;
            const dest = ch.destUser?.id?.toLowerCase();
            if (dest && dest !== me) continue;
            if (!compatAllowsBot(ch, ev)) continue;
            if (activeGameStreams.size >= maxConcurrentGames) continue;
            void acceptChallenge(token, ch.id);
            continue;
        }

        if (t !== "gameStart") continue;
        const game = ev.game as GameStartPayload | undefined;
        if (!game) continue;
        if (game.variant?.key && game.variant.key !== "standard") {
            console.log(`[skip] variant ${game.variant.key} (only standard is supported)`);
            continue;
        }
        if (!compatAllowsBot(game, ev)) {
            console.log("[skip] game not usable with the Bot API (compat.bot is false)");
            continue;
        }
        const gameId = game.gameId ?? game.id;
        const colorRaw = game.color;
        if (!gameId) continue;

        const knownColor: "white" | "black" | null =
            colorRaw === "white" || colorRaw === "black" ? colorRaw : null;

        if (knownColor === null && colorRaw && colorRaw !== "random") {
            console.log(`[skip] ${gameId} unknown color field: ${String(colorRaw)}`);
            continue;
        }

        if (activeGameStreams.has(gameId)) continue;

        activeGameStreams.add(gameId);
        scheduleEnsurePlaying(token, me);
        void playBotGame(token, gameId, knownColor, depth, me).finally(() => {
            activeGameStreams.delete(gameId);
            scheduleEnsurePlaying(token, me);
        });
    }
}

async function playBotGame(
    token: string,
    gameId: string,
    knownColor: "white" | "black" | null,
    depth: number,
    me: string,
): Promise<void> {
    let ourColor: "white" | "black" | null = knownColor;
    console.log(`[${gameId}] stream open · color=${ourColor ?? "from gameFull"}`);

    let initialFen = "startpos";
    let lastSentUci: string | null = null;

    const streamRes = await fetch(`${LICHESS_ORIGIN}/api/bot/game/stream/${gameId}`, {
        headers: authorizeHeaders(token),
    });
    if (!streamRes.ok) {
        console.error(`[${gameId}] bot stream: ${streamRes.status} ${await streamRes.text()}`);
        return;
    }

    const resolveColorFromGameFull = (row: Record<string, unknown>): boolean => {
        if (ourColor !== null) return true;
        const w = row.white as { id?: string } | undefined;
        const b = row.black as { id?: string } | undefined;
        const wid = w?.id?.toLowerCase() ?? "";
        const bid = b?.id?.toLowerCase() ?? "";
        if (wid === me) {
            ourColor = "white";
            return true;
        }
        if (bid === me) {
            ourColor = "black";
            return true;
        }
        console.error(`[${gameId}] gameFull: no player id matches ${me} (white=${wid || "?"} black=${bid || "?"})`);
        return false;
    };

    const applyState = async (state: Record<string, unknown>): Promise<void> => {
        if (!ourColor) return;

        const status = normalizeGameStatus(state);
        if (!status || !PLAYABLE_STATUS.has(status)) {
            console.log(`[${gameId}] done (status=${status ?? "?"})`);
            lastSentUci = null;
            return;
        }

        const moves = (state.moves as string) ?? "";
        const plies = moves.trim().split(/\s+/).filter(Boolean);

        if (!isOurTurn(ourColor, plies.length)) {
            lastSentUci = null;
            return;
        }

        let uci: string;
        let score: number;
        try {
            const out = await acquireSearchLock(async () => searchBestUciWithWasm(initialFen, moves, depth));
            uci = out.uci;
            score = out.score;
        } catch (e) {
            console.error(`[${gameId}] replay / search failed:`, e);
            return;
        }

        if (!uci || uci === lastSentUci) return;

        lastSentUci = uci;
        console.log(`[${gameId}] ${uci} (eval ${score})`);

        const moveUrl = `${LICHESS_ORIGIN}/api/bot/game/${gameId}/move/${encodeURIComponent(uci)}`;
        const post = await fetch(moveUrl, { method: "POST", headers: authorizeHeaders(token) });
        if (!post.ok) {
            console.error(`[${gameId}] move POST ${post.status}: ${await post.text()}`);
            lastSentUci = null;
        }
    };

    try {
        for await (const row of ndjsonStream(streamRes)) {
            const rt = row.type;
            if (rt === "gameFull") {
                if (typeof row.initialFen === "string") initialFen = row.initialFen;
                if (!resolveColorFromGameFull(row)) return;
                const st = row.state as Record<string, unknown> | undefined;
                if (st) await applyState(st);
            } else if (rt === "gameState") {
                if (!ourColor) {
                    console.warn(`[${gameId}] gameState before gameFull — ignored`);
                    continue;
                }
                await applyState(row);
            }
        }
    } catch (e) {
        console.error(`[${gameId}] stream error:`, e);
    }
    console.log(`[${gameId}] stream closed`);
}

main();
