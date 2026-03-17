"use client";

const PIECE_FILE: Record<string, Record<string, string>> = {
    white: {
        king: "/pieces/wK.svg", queen: "/pieces/wQ.svg", rook: "/pieces/wR.svg",
        bishop: "/pieces/wB.svg", knight: "/pieces/wN.svg", pawn: "/pieces/wP.svg",
    },
    black: {
        king: "/pieces/bK.svg", queen: "/pieces/bQ.svg", rook: "/pieces/bR.svg",
        bishop: "/pieces/bB.svg", knight: "/pieces/bN.svg", pawn: "/pieces/bP.svg",
    },
};

interface PieceProps {
    piece: string;
    color: string;
}

export default function Piece({ piece, color }: PieceProps) {
    const src = PIECE_FILE[color]?.[piece];
    if (!src) return null;
    return (
        <img
            src={src}
            alt={`${color} ${piece}`}
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
        />
    );
}
