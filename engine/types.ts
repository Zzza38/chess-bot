export interface ChessPieceType {
    piece: "pawn" | "rook" | "knight" | "bishop" | "queen" | "king";
    color: "white" | "black" | "empty";
}

export interface ChessCell {
    type: ChessPieceType;
}

export interface Vector2 {
    x: number;
    y: number;
}

export interface ChessBoard {
    cells: ChessCell[][];
    turn: "white" | "black";
    canCastle: {
        white: { kingside: boolean; queenside: boolean };
        black: { kingside: boolean; queenside: boolean };
    };
    didCastle: {
        white: boolean;
        black: boolean;
    }
    enpassant: Vector2 | null;
}

export interface MoveNode {
    board: ChessBoard;
    children: MoveNode[];
}

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
