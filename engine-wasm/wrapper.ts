// @ts-nocheck — Emscripten module typing is dynamic
import { existsSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

function resolveWasmDir(): string {
    const here = path.dirname(fileURLToPath(import.meta.url));
    if (existsSync(path.join(here, "chess-engine.js"))) return here;
    const repoRoot = path.join(process.cwd(), "engine-wasm");
    if (existsSync(path.join(repoRoot, "chess-engine.js"))) return repoRoot;
    const fromWeb = path.join(process.cwd(), "..", "engine-wasm");
    if (existsSync(path.join(fromWeb, "chess-engine.js"))) return fromWeb;
    return here;
}

const wasmDir = resolveWasmDir();

/* Load the Emscripten glue at runtime (not bundled by Turbopack).
 * createRequire gives us a real Node.js require that the bundler won't trace. */
import { createRequire } from "module";
const dynamicRequire = createRequire(import.meta.url || __filename);

function loadFactory(): (opts?: any) => Promise<any> {
    const glue = path.join(wasmDir, "chess-engine.js");
    return dynamicRequire(glue);
}

/* Piece code mapping: C engine uses signed int8 (positive=white, negative=black)
 * 0=empty, 1=pawn, 2=knight, 3=bishop, 4=rook, 5=queen, 6=king
 */
const PIECE_NAMES = ["pawn", "pawn", "knight", "bishop", "rook", "queen", "king"] as const;
const COLOR_MAP = (v: number) => v > 0 ? "white" : v < 0 ? "black" : "empty";

export interface EvalBreakdown {
    material: number;
    pst: number;
    bishopPair: number;
    castling: number;
    rookSeventh: number;
    doubledPawns: number;
    isolatedPawns: number;
    passedPawns: number;
    rookOpenFile: number;
    rookSemiOpenFile: number;
    kingSafety: number;
    checkPenalty: number;
    total: number;
}

export interface SerializedBoard {
    cells: Array<Array<{ piece: string; color: string }>>;
    turn: "white" | "black";
    canCastle: {
        white: { kingside: boolean; queenside: boolean };
        black: { kingside: boolean; queenside: boolean };
    };
    didCastle: { white: boolean; black: boolean };
    enpassant: { x: number; y: number } | null;
}

export interface RankedMoveResult {
    notation: string;
    score: number;
    board: SerializedBoard;
    breakdown: EvalBreakdown;
}

let modulePromise: Promise<any> | null = null;
let moduleInstance: any = null;

async function getModule() {
    if (moduleInstance) return moduleInstance;
    if (!modulePromise) {
        const factory = loadFactory();
        modulePromise = factory({
            locateFile(filename: string) {
                return path.join(wasmDir, filename);
            },
        });
    }
    moduleInstance = await modulePromise;
    moduleInstance._engine_init();
    return moduleInstance;
}

function writeString(mod: any, str: string) {
    const bufPtr = mod._engine_get_string_buf();
    const bufSize = mod._engine_get_string_buf_size();
    mod.stringToUTF8(str, bufPtr, bufSize);
}

function readString(mod: any): string {
    const bufPtr = mod._engine_get_string_buf();
    return mod.UTF8ToString(bufPtr);
}

function readBreakdown(mod: any, ptr: number): EvalBreakdown {
    /* EvalBreakdown is 13 x int16_t = 26 bytes */
    const view = mod.HEAP16;
    const offset = ptr >> 1; /* int16 index */
    return {
        material:        view[offset + 0],
        pst:             view[offset + 1],
        bishopPair:      view[offset + 2],
        castling:        view[offset + 3],
        rookSeventh:     view[offset + 4],
        doubledPawns:    view[offset + 5],
        isolatedPawns:   view[offset + 6],
        passedPawns:     view[offset + 7],
        rookOpenFile:    view[offset + 8],
        rookSemiOpenFile:view[offset + 9],
        kingSafety:      view[offset + 10],
        checkPenalty:    view[offset + 11],
        total:           view[offset + 12],
    };
}

function boardFromSquares(mod: any, squaresPtr: number): SerializedBoard {
    const squares = mod.HEAP8;
    const cells: Array<Array<{ piece: string; color: string }>> = [];

    for (let rank = 0; rank < 8; rank++) {
        const row: Array<{ piece: string; color: string }> = [];
        for (let file = 0; file < 8; file++) {
            const idx = rank * 8 + file;
            const val = squares[squaresPtr + idx];
            const abs = val > 0 ? val : -val;
            row.push({
                piece: abs >= 1 && abs <= 6 ? PIECE_NAMES[abs] : "pawn",
                color: COLOR_MAP(val),
            });
        }
        cells.push(row);
    }

    return {
        cells,
        turn: mod._engine_get_side() === 0 ? "white" : "black",
        canCastle: {
            white: { kingside: false, queenside: false },
            black: { kingside: false, queenside: false },
        },
        didCastle: { white: false, black: false },
        enpassant: null,
    };
}

export class WasmChessBot {
    private mod: any = null;
    public ready: Promise<void>;

    constructor(fen?: string) {
        this.ready = getModule().then(mod => {
            this.mod = mod;
            if (fen) {
                writeString(mod, fen);
                mod._engine_set_fen();
            } else {
                writeString(mod, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
                mod._engine_set_fen();
            }
        });
    }

    private ensureReady() {
        if (!this.mod) throw new Error("WasmChessBot not initialized — await .ready first");
    }

    search(depth: number): { notation: string; score: number } {
        this.ensureReady();
        const score = this.mod._engine_search(depth);
        const notation = readString(this.mod);
        return { notation, score };
    }

    getRankedMoves(depth: number, maxMoves = 10): RankedMoveResult[] {
        this.ensureReady();
        const count = this.mod._engine_get_ranked_moves(depth, maxMoves);
        const results: RankedMoveResult[] = [];

        for (let i = 0; i < count; i++) {
            const score = this.mod._engine_get_ranked_move_score(i);
            const notation = readString(this.mod);

            const bdPtr = this.mod._engine_get_ranked_breakdown(i);
            const breakdown = readBreakdown(this.mod, bdPtr);

            const boardPtr = this.mod._engine_get_ranked_board(i);
            const board = boardFromSquares(this.mod, boardPtr);

            results.push({ notation, score, board, breakdown });
        }

        return results;
    }

    getBoardValue(): number {
        this.ensureReady();
        return this.mod._engine_evaluate();
    }

    getBoardValueBreakdown(): EvalBreakdown {
        this.ensureReady();
        const ptr = this.mod._engine_get_breakdown();
        return readBreakdown(this.mod, ptr);
    }

    makeMove(notation: string): boolean {
        this.ensureReady();
        writeString(this.mod, notation);
        return this.mod._engine_make_move() === 1;
    }

    toFEN(): string {
        this.ensureReady();
        this.mod._engine_get_fen();
        return readString(this.mod);
    }

    isInCheck(): boolean {
        this.ensureReady();
        return this.mod._engine_is_check() === 1;
    }

    isCheckmate(): boolean {
        this.ensureReady();
        return this.mod._engine_is_checkmate() === 1;
    }

    isStalemate(): boolean {
        this.ensureReady();
        return this.mod._engine_is_stalemate() === 1;
    }

    getLegalMoveCount(): number {
        this.ensureReady();
        return this.mod._engine_legal_move_count();
    }

    getBoard(): SerializedBoard {
        this.ensureReady();
        const ptr = this.mod._engine_get_board();
        return boardFromSquares(this.mod, ptr);
    }

    getSide(): "white" | "black" {
        this.ensureReady();
        return this.mod._engine_get_side() === 0 ? "white" : "black";
    }
}

export default WasmChessBot;
