import * as readline from "node:readline";
import { ChessBot, prettyBoard, stockfishEval } from "./engine/index.js";
import type { MoveNode } from "./engine/index.js";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function prompt(query: string): Promise<string> {
    return new Promise((resolve) => rl.question(query, resolve));
}

function getLegalMoves(bot: ChessBot): MoveNode[] {
    const possibleMoves = bot.getAvailableMoves();
    return possibleMoves.filter(
        (m) => !bot.isInCheck(bot.board.turn, m.board)
    );
}

function checkGameOver(bot: ChessBot): string | null {
    const legal = getLegalMoves(bot);
    if (legal.length > 0) return null;

    const inCheck = bot.isInCheck(bot.board.turn, bot.board);
    if (inCheck) {
        const winner = bot.board.turn === "white" ? "Black" : "White";
        return `Checkmate! ${winner} wins! 🏆`;
    }
    return "Stalemate — it's a draw! 🤝";
}

function printStatus(bot: ChessBot) {
    console.log(prettyBoard(bot.board));

    const gameOver = checkGameOver(bot);
    if (gameOver) {
        console.log(`\n${gameOver}\n`);
    } else {
        const inCheck = bot.isInCheck(bot.board.turn, bot.board);
        const checkStr = inCheck ? " ⚠ CHECK!" : "";
        console.log(`\nTurn: ${bot.board.turn}${checkStr}\n`);
    }
}

let searchDepth = 3;

async function main() {
    console.log("♟  Chess REPL  ♟");
    console.log("Commands:");
    console.log("  fen <FEN>     — load a position from FEN");
    console.log("  export        — export current position as FEN");
    console.log("  <move>        — make a move (e.g. e4, Nf3, O-O)");
    console.log("  bot           — let the bot play the current side");
    console.log("  moves         — list all legal moves");
    console.log("  eval          — show bot + Stockfish evaluation");
    console.log("  depth <n>     — set search depth (currently " + searchDepth + ")");
    console.log("  quit          — exit\n");

    let bot = new ChessBot();
    printStatus(bot);

    while (true) {
        const input = (await prompt("> ")).trim();
        if (!input) continue;

        if (input === "quit" || input === "exit") {
            console.log("Bye! ♔");
            rl.close();
            break;
        }

        if (input.startsWith("fen ")) {
            const fen = input.slice(4).trim();
            try {
                bot = new ChessBot(fen);
                printStatus(bot);
            } catch (e: any) {
                console.log(`Invalid FEN: ${e.message}\n`);
            }
            continue;
        }

        if (input === "export") {
            console.log(`FEN: ${bot.toFEN()}\n`);
            continue;
        }

        if (input.startsWith("depth")) {
            const parts = input.split(/\s+/);
            const n = parseInt(parts[1]);
            if (isNaN(n) || n < 1 || n > 10) {
                console.log(`Usage: depth <1-10>  (current: ${searchDepth})\n`);
            } else {
                searchDepth = n;
                console.log(`Search depth set to ${searchDepth}\n`);
            }
            continue;
        }

        if (input === "moves") {
            const legal = getLegalMoves(bot);
            const notations = legal.map((m) => bot.toChessNotation(bot.board, m.board));
            const unique = [...new Set(notations)].sort();
            console.log(`Legal moves (${unique.length}): ${unique.join(", ")}\n`);
            continue;
        }

        if (input === "eval") {
            const val = bot.getBoardValue();
            const sign = val >= 0 ? "+" : "";
            console.log(`Bot eval:       ${sign}${val} (positive = white advantage)`);

            const fen = bot.toFEN();
            try {
                const sf = await stockfishEval(fen);
                if (sf.mate !== null) {
                    console.log(`Stockfish eval: mate in ${sf.mate}`);
                } else {
                    const sfSign = sf.eval >= 0 ? "+" : "";
                    console.log(`Stockfish eval: ${sfSign}${sf.eval} cp  (depth 16)`);
                }
                console.log(`Stockfish best: ${sf.bestMove}`);
            } catch {
                console.log("Stockfish:      (could not run stockfish)");
            }
            console.log();
            continue;
        }

        if (input === "bot") {
            if (checkGameOver(bot)) {
                console.log("Game is already over. Use `fen` to load a new position.\n");
                continue;
            }

            console.log(`Bot is thinking (depth ${searchDepth})...`);
            const t = performance.now();
            const rankedMoves = bot.getRankedMoves(searchDepth);
            const elapsed = (performance.now() - t).toFixed(0);

            if (rankedMoves.length === 0) {
                console.log("No legal moves — game over!\n");
                continue;
            }

            let played = false;
            for (const {notation, board: moveBoard} of rankedMoves) {
                if (bot.makeMove(notation)) {
                    console.log(`Bot plays: ${notation}  (${elapsed}ms)`);
                    played = true;
                    break;
                }
            }

            // Fallback: if no notation matched, apply the best board directly
            if (!played) {
                const best = rankedMoves[0];
                bot.board = best.board;
                console.log(`Bot plays: ${best.notation}  (${elapsed}ms)  [notation fallback]`);
            }

            printStatus(bot);
            continue;
        }

        // Otherwise treat it as a move
        if (checkGameOver(bot)) {
            console.log("Game is already over. Use `fen` to load a new position.\n");
            continue;
        }

        const ok = bot.makeMove(input);
        if (!ok) {
            console.log(`Illegal or unrecognised move: "${input}". Try "moves" to see legal moves.\n`);
            continue;
        }

        printStatus(bot);
    }
}

main();
