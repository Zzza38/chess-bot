import { NextRequest, NextResponse } from "next/server";
import { WasmChessBot } from "@engine-wasm/wrapper";

export async function POST(req: NextRequest) {
    const { fen, depth } = await req.json();
    const bot = new WasmChessBot(fen);
    await bot.ready;

    const safeDepth = Math.min(Math.max(depth || 3, 1), 15);

    const t = performance.now();
    const rankedMoves = bot.getRankedMoves(safeDepth, 10);
    const elapsed = Math.round(performance.now() - t);

    return NextResponse.json({ rankedMoves, thinkingTimeMs: elapsed });
}
