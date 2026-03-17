import { NextRequest, NextResponse } from "next/server";
import { WasmChessBot } from "@engine-wasm/wrapper";

export async function POST(req: NextRequest) {
    try {
        const { fen, depth } = await req.json();
        const bot = new WasmChessBot(fen);
        await bot.ready;

        const safeDepth = Math.min(Math.max(depth || 3, 1), 15);

        const t = performance.now();
        const ranked = bot.getRankedMoves(safeDepth, 1);
        const elapsed = Math.round(performance.now() - t);

        if (ranked.length === 0) {
            return NextResponse.json({ error: "no legal moves" }, { status: 400 });
        }

        const best = ranked[0];
        bot.makeMove(best.notation);

        const newFen = bot.toFEN();
        const legalMoves = bot.getLegalMoveCount();
        const isCheck = bot.isInCheck();

        return NextResponse.json({
            notation: best.notation,
            fen: newFen,
            board: bot.getBoard(),
            thinkingTimeMs: elapsed,
            isCheck,
            isCheckmate: legalMoves === 0 && isCheck,
            isStalemate: legalMoves === 0 && !isCheck,
        });
    } catch (e: any) {
        console.error("bot-move error:", e);
        return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
    }
}
