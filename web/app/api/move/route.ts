import { NextRequest, NextResponse } from "next/server";
import { ChessBot } from "@engine/chess-bot";
import { serializeBoard } from "../_lib/serialize";

export async function POST(req: NextRequest) {
    const { fen, notation } = await req.json();
    const bot = new ChessBot(fen);
    const success = bot.makeMove(notation);

    if (!success) {
        return NextResponse.json({
            success: false,
            fen: null,
            board: null,
            isCheck: false,
            isCheckmate: false,
            isStalemate: false,
        });
    }

    const newFen = bot.toFEN();
    const legalMoves = bot.getLegalMoves();
    const isCheck = bot.isInCheck(bot.board.turn);
    const isCheckmate = legalMoves.length === 0 && isCheck;
    const isStalemate = legalMoves.length === 0 && !isCheck;

    return NextResponse.json({
        success: true,
        fen: newFen,
        board: serializeBoard(bot.board),
        isCheck,
        isCheckmate,
        isStalemate,
    });
}
