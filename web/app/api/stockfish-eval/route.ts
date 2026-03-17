import { NextRequest, NextResponse } from "next/server";
import { WasmChessBot } from "@engine-wasm/wrapper";
import { stockfishEval } from "@engine/stockfish";

export async function POST(req: NextRequest) {
    const { fen, depth = 16 } = await req.json();
    const bot = new WasmChessBot(fen);
    await bot.ready;
    const botEval = bot.getBoardValue();

    try {
        const sf = await stockfishEval(fen, depth);
        return NextResponse.json({ ...sf, botEval });
    } catch {
        return NextResponse.json({ eval: 0, mate: null, bestMove: "?", botEval, error: "Stockfish unavailable" });
    }
}
