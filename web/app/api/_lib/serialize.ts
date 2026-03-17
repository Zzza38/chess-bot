import type { ChessBoard } from "@engine/types";

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

export function serializeBoard(board: ChessBoard): SerializedBoard {
    return {
        cells: board.cells.map(row =>
            row.map(cell => ({ piece: cell.type.piece, color: cell.type.color }))
        ),
        turn: board.turn,
        canCastle: board.canCastle,
        didCastle: board.didCastle,
        enpassant: board.enpassant,
    };
}

export interface MoveInfo {
    from: { x: number; y: number };
    to: { x: number; y: number };
    notation: string;
    isCapture: boolean;
    isPromotion: boolean;
    promotionPiece: string | null;
}

export function diffBoards(
    fromBoard: ChessBoard,
    toBoard: ChessBoard,
    turn: "white" | "black",
    notation: string,
): MoveInfo {
    let from = { x: 0, y: 0 };
    let to = { x: 0, y: 0 };
    let isCapture = false;

    // Detect castling from notation
    if (notation === "O-O" || notation === "O-O-O") {
        // For castling, report king movement
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                if (fromBoard.cells[y][x].type.piece === "king" && fromBoard.cells[y][x].type.color === turn) {
                    from = { x, y };
                }
                if (toBoard.cells[y][x].type.piece === "king" && toBoard.cells[y][x].type.color === turn
                    && fromBoard.cells[y][x].type.piece !== "king") {
                    to = { x, y };
                }
            }
        }
        return { from, to, notation, isCapture: false, isPromotion: false, promotionPiece: null };
    }

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const fc = fromBoard.cells[y][x].type;
            const tc = toBoard.cells[y][x].type;

            // Piece of the moving color disappeared from this square
            if (fc.color === turn && tc.color !== turn) {
                if (fc.piece !== "rook" || from.x === 0 && from.y === 0) {
                    // Prefer non-rook for from (to handle castling edge cases)
                    from = { x, y };
                }
            }

            // Piece of the moving color appeared on this square (wasn't there before)
            if (tc.color === turn && fc.color !== turn) {
                to = { x, y };
            }

            // Capture: enemy piece disappeared
            if (fc.color !== "empty" && fc.color !== turn && tc.color !== fc.color) {
                isCapture = true;
            }
        }
    }

    // En passant capture detection
    if (notation.includes("x") && !isCapture) {
        isCapture = true;
    }

    // Promotion detection
    const isPromotion = notation.includes("=");
    let promotionPiece: string | null = null;
    if (isPromotion) {
        const promoMap: Record<string, string> = { Q: "queen", R: "rook", B: "bishop", N: "knight" };
        const match = notation.match(/=([QRBN])/);
        if (match) promotionPiece = promoMap[match[1]] || null;
    }

    return { from, to, notation, isCapture, isPromotion, promotionPiece };
}
