import { NextRequest, NextResponse } from "next/server";
import { ChessBot } from "@engine/chess-bot";
import { diffBoards } from "../_lib/serialize";

export async function POST(req: NextRequest) {
    const { fen, square } = await req.json();
    const bot = new ChessBot(fen);
    const currentBoard = bot.board;
    const legalBoards = bot.getLegalMoves();

    const moves = legalBoards.map(toBoard => {
        const notation = bot.toChessNotation(currentBoard, toBoard);
        const info = diffBoards(currentBoard, toBoard, currentBoard.turn, notation);
        return info;
    });

    const filtered = square
        ? moves.filter(m => m.from.x === square.x && m.from.y === square.y)
        : moves;

    return NextResponse.json({ moves: filtered });
}
