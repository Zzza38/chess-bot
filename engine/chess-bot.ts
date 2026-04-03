import type { ChessBoard, ChessCell, ChessPieceType, Vector2, MoveNode, EvalBreakdown } from "./types.js";

export const UNICODE_PIECES: Record<string, Record<string, string>> = {
    white: { king: "♔", queen: "♕", rook: "♖", bishop: "♗", knight: "♘", pawn: "♙" },
    black: { king: "♚", queen: "♛", rook: "♜", bishop: "♝", knight: "♞", pawn: "♟" },
};

// Piece-Square Tables (from white's perspective, index 0 = rank 1 / a-file)
// Flipped vertically for black.
export const PST: Record<string, number[]> = {
    pawn: [
         0,  0,  0,  0,  0,  0,  0,  0,
        50, 50, 50, 50, 50, 50, 50, 50,
        10, 10, 20, 30, 30, 20, 10, 10,
         5,  5, 10, 25, 25, 10,  5,  5,
         0,  0,  0, 20, 20,  0,  0,  0,
         5, -5,-10,  0,  0,-10, -5,  5,
         5, 10, 10,-20,-20, 10, 10,  5,
         0,  0,  0,  0,  0,  0,  0,  0,
    ],
    knight: [
       -50,-40,-30,-30,-30,-30,-40,-50,
       -40,-20,  0,  0,  0,  0,-20,-40,
       -30,  0, 10, 15, 15, 10,  0,-30,
       -30,  5, 15, 20, 20, 15,  5,-30,
       -30,  0, 15, 20, 20, 15,  0,-30,
       -30,  5, 10, 15, 15, 10,  5,-30,
       -40,-20,  0,  5,  5,  0,-20,-40,
       -50,-40,-30,-30,-30,-30,-40,-50,
    ],
    bishop: [
       -20,-10,-10,-10,-10,-10,-10,-20,
       -10,  0,  0,  0,  0,  0,  0,-10,
       -10,  0, 10, 10, 10, 10,  0,-10,
       -10,  5,  5, 10, 10,  5,  5,-10,
       -10,  0,  5, 10, 10,  5,  0,-10,
       -10, 10, 10, 10, 10, 10, 10,-10,
       -10,  5,  0,  0,  0,  0,  5,-10,
       -20,-10,-10,-10,-10,-10,-10,-20,
    ],
    rook: [
         0,  0,  0,  0,  0,  0,  0,  0,
         5, 10, 10, 10, 10, 10, 10,  5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
        -5,  0,  0,  0,  0,  0,  0, -5,
         0,  0,  0,  5,  5,  0,  0,  0,
    ],
    queen: [
       -20,-10,-10, -5, -5,-10,-10,-20,
       -10,  0,  0,  0,  0,  0,  0,-10,
       -10,  0,  5,  5,  5,  5,  0,-10,
        -5,  0,  5,  5,  5,  5,  0, -5,
         0,  0,  5,  5,  5,  5,  0, -5,
       -10,  5,  5,  5,  5,  5,  0,-10,
       -10,  0,  5,  0,  0,  0,  0,-10,
       -20,-10,-10, -5, -5,-10,-10,-20,
    ],
    king: [
       -30,-40,-40,-50,-50,-40,-40,-30,
       -30,-40,-40,-50,-50,-40,-40,-30,
       -30,-40,-40,-50,-50,-40,-40,-30,
       -30,-40,-40,-50,-50,-40,-40,-30,
       -20,-30,-30,-40,-40,-30,-30,-20,
       -10,-20,-20,-20,-20,-20,-20,-10,
        20, 20,  0,  0,  0,  0, 20, 20,
        20, 30, 10,  0,  0, 10, 30, 20,
    ],
};

export function getPstValue(piece: string, color: "white" | "black", x: number, y: number): number {
    const table = PST[piece];
    if (!table) return 0;
    // White reads from rank 8 down (index 0 = rank 8), black mirrors vertically
    const index = color === "white" ? (7 - y) * 8 + x : y * 8 + x;
    return table[index];
}

export class ChessBot {
    board: ChessBoard;

    constructor(fen: string = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") {
        this.board = {
            cells: [],
            turn: "white",
            canCastle: {
                white: {kingside: true, queenside: true},
                black: {kingside: true, queenside: true},
            },
            didCastle: {white: false, black: false},
            enpassant: null,
        };
        for (let i = 0; i < 8; i++) {
            this.board.cells[i] = [];
            for (let j = 0; j < 8; j++) {
                this.board.cells[i][j] = {type: {piece: "pawn", color: "empty"}};
            }
        }
        this._parse_fen(fen);
    }

    getAvailableMoves(board: ChessBoard = this.board): MoveNode[] {
        const roots: MoveNode[] = [];
        for (let x = 0; x < 8; x++) {
            for (let y = 0; y < 8; y++) {
                const cell = board.cells[y][x];
                if (cell.type.color !== board.turn) continue;
                const childBoards = this._getAvailableMovesForCell(cell, {x, y}, board);
                for (const childBoard of childBoards) {
                    roots.push({board: childBoard, children: []});
                }
            }
        }
        return roots;
    }

    printBoard(board: ChessBoard = this.board) {
        console.log(
            board.cells
                .map((row) =>
                    row
                        .map((cell) => {
                            if (cell.type.color === "empty") return "-";
                            const pieceMap: Record<string, string> = {
                                pawn: "p",
                                knight: "n",
                                bishop: "b",
                                rook: "r",
                                queen: "q",
                                king: "k",
                            };
                            const piece = pieceMap[cell.type.piece];
                            return cell.type.color === "white" ? piece.toUpperCase() : piece;
                        })
                        .join(" ")
                )
                .join("\n")
        );
    }

    getBoardValue(board: ChessBoard = this.board): number {
        let reward = 0;

        const materialValues: Record<string, number> = {
            pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 20000,
        };

        // --- Single pass: material + PST + bishop pair + king positions + rook on 7th ---
        let whiteBishops = 0, blackBishops = 0;
        let whiteKingPos: Vector2 | null = null;
        let blackKingPos: Vector2 | null = null;

        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const cell = board.cells[y][x];
                if (cell.type.color === "empty") continue;

                const sign = cell.type.color === "white" ? 1 : -1;
                const piece = cell.type.piece;
                const color = cell.type.color as "white" | "black";

                // Material
                reward += sign * materialValues[piece];

                // Piece-Square Table positional bonus
                reward += sign * getPstValue(piece, color, x, y);

                // Track bishops for bishop pair
                if (piece === "bishop") {
                    color === "white" ? whiteBishops++ : blackBishops++;
                }

                // Track king positions
                if (piece === "king") {
                    if (color === "white") whiteKingPos = {x, y};
                    else blackKingPos = {x, y};
                }

                // Rook on 7th rank bonus
                if (piece === "rook") {
                    if (color === "white" && y === 6) reward += 40;
                    if (color === "black" && y === 1) reward -= 40;
                }
            }
        }

        // Bishop pair
        if (whiteBishops >= 2) reward += 50;
        if (blackBishops >= 2) reward -= 50;

        // Castling bonus
        if (board.didCastle.white) reward += 60;
        if (board.didCastle.black) reward -= 60;

        // --- File-based evaluation: doubled pawns, passed pawns, isolated pawns, rook on open file ---
        const whitePawnsPerFile: number[] = new Array(8).fill(0);
        const blackPawnsPerFile: number[] = new Array(8).fill(0);
        const whiteRooksPerFile: number[] = new Array(8).fill(0);
        const blackRooksPerFile: number[] = new Array(8).fill(0);

        for (let x = 0; x < 8; x++) {
            for (let y = 0; y < 8; y++) {
                const cell = board.cells[y][x];
                if (cell.type.color === "empty") continue;
                if (cell.type.piece === "pawn") {
                    cell.type.color === "white" ? whitePawnsPerFile[x]++ : blackPawnsPerFile[x]++;
                }
                if (cell.type.piece === "rook") {
                    cell.type.color === "white" ? whiteRooksPerFile[x]++ : blackRooksPerFile[x]++;
                }
            }
        }

        for (let x = 0; x < 8; x++) {
            // Doubled pawns penalty
            if (whitePawnsPerFile[x] > 1) reward -= 20 * (whitePawnsPerFile[x] - 1);
            if (blackPawnsPerFile[x] > 1) reward += 20 * (blackPawnsPerFile[x] - 1);

            // Isolated pawn penalty — no friendly pawns on adjacent files
            if (whitePawnsPerFile[x] > 0) {
                const hasNeighbor = (x > 0 && whitePawnsPerFile[x - 1] > 0) || (x < 7 && whitePawnsPerFile[x + 1] > 0);
                if (!hasNeighbor) reward -= 15 * whitePawnsPerFile[x];
            }
            if (blackPawnsPerFile[x] > 0) {
                const hasNeighbor = (x > 0 && blackPawnsPerFile[x - 1] > 0) || (x < 7 && blackPawnsPerFile[x + 1] > 0);
                if (!hasNeighbor) reward += 15 * blackPawnsPerFile[x];
            }

            // Passed pawn bonus — scales with advancement
            if (whitePawnsPerFile[x] > 0 && blackPawnsPerFile[x] === 0) {
                // Find most advanced white pawn on this file
                for (let y = 7; y >= 0; y--) {
                    const c = board.cells[y][x];
                    if (c.type.piece === "pawn" && c.type.color === "white") {
                        // Also check adjacent files have no enemy pawns ahead
                        let passed = true;
                        for (let fy = y + 1; fy < 8; fy++) {
                            if (x > 0 && board.cells[fy][x - 1].type.piece === "pawn" && board.cells[fy][x - 1].type.color === "black") { passed = false; break; }
                            if (x < 7 && board.cells[fy][x + 1].type.piece === "pawn" && board.cells[fy][x + 1].type.color === "black") { passed = false; break; }
                        }
                        if (passed) {
                            reward += 30 + (y > 3 ? (y - 3) * 15 : 0);
                        }
                        break;
                    }
                }
            }
            if (blackPawnsPerFile[x] > 0 && whitePawnsPerFile[x] === 0) {
                for (let y = 0; y < 8; y++) {
                    const c = board.cells[y][x];
                    if (c.type.piece === "pawn" && c.type.color === "black") {
                        let passed = true;
                        for (let fy = y - 1; fy >= 0; fy--) {
                            if (x > 0 && board.cells[fy][x - 1].type.piece === "pawn" && board.cells[fy][x - 1].type.color === "white") { passed = false; break; }
                            if (x < 7 && board.cells[fy][x + 1].type.piece === "pawn" && board.cells[fy][x + 1].type.color === "white") { passed = false; break; }
                        }
                        if (passed) {
                            reward -= 30 + (y < 4 ? (4 - y) * 15 : 0);
                        }
                        break;
                    }
                }
            }

            // Rook on open file (no pawns of either color)
            if (whiteRooksPerFile[x] > 0 && whitePawnsPerFile[x] === 0 && blackPawnsPerFile[x] === 0) reward += 25;
            if (blackRooksPerFile[x] > 0 && whitePawnsPerFile[x] === 0 && blackPawnsPerFile[x] === 0) reward -= 25;
            // Rook on semi-open file (no friendly pawns)
            if (whiteRooksPerFile[x] > 0 && whitePawnsPerFile[x] === 0 && blackPawnsPerFile[x] > 0) reward += 15;
            if (blackRooksPerFile[x] > 0 && blackPawnsPerFile[x] === 0 && whitePawnsPerFile[x] > 0) reward -= 15;
        }

        // --- King safety: pawn shield ---
        const countPawnShield = (kingPos: Vector2, color: "white" | "black"): number => {
            let count = 0;
            const dir = color === "white" ? 1 : -1;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = 1; dy <= 2; dy++) {
                    const nx = kingPos.x + dx;
                    const ny = kingPos.y + dir * dy;
                    if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) {
                        const cell = board.cells[ny][nx];
                        if (cell.type.piece === "pawn" && cell.type.color === color) {
                            count++;
                        }
                    }
                }
            }
            return count;
        };

        if (whiteKingPos) {
            const shield = countPawnShield(whiteKingPos, "white");
            reward += shield * 10;
        }
        if (blackKingPos) {
            const shield = countPawnShield(blackKingPos, "black");
            reward -= shield * 10;
        }

        // Check penalty
        if (this._isInCheck(board.turn, board)) {
            reward += board.turn === "white" ? -100 : 100;
        }

        return reward;
    }

    getBoardValueBreakdown(board: ChessBoard = this.board): EvalBreakdown {
        const b: EvalBreakdown = {
            material: 0, pst: 0, bishopPair: 0, castling: 0, rookSeventh: 0,
            doubledPawns: 0, isolatedPawns: 0, passedPawns: 0,
            rookOpenFile: 0, rookSemiOpenFile: 0, kingSafety: 0, checkPenalty: 0, total: 0,
        };

        const materialValues: Record<string, number> = {
            pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 20000,
        };

        let whiteBishops = 0, blackBishops = 0;
        let whiteKingPos: Vector2 | null = null;
        let blackKingPos: Vector2 | null = null;

        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const cell = board.cells[y][x];
                if (cell.type.color === "empty") continue;
                const sign = cell.type.color === "white" ? 1 : -1;
                const piece = cell.type.piece;
                const color = cell.type.color as "white" | "black";

                b.material += sign * materialValues[piece];
                b.pst += sign * getPstValue(piece, color, x, y);

                if (piece === "bishop") color === "white" ? whiteBishops++ : blackBishops++;
                if (piece === "king") {
                    if (color === "white") whiteKingPos = { x, y };
                    else blackKingPos = { x, y };
                }
                if (piece === "rook") {
                    if (color === "white" && y === 6) b.rookSeventh += 40;
                    if (color === "black" && y === 1) b.rookSeventh -= 40;
                }
            }
        }

        if (whiteBishops >= 2) b.bishopPair += 50;
        if (blackBishops >= 2) b.bishopPair -= 50;

        if (board.didCastle.white) b.castling += 60;
        if (board.didCastle.black) b.castling -= 60;

        const whitePawnsPerFile: number[] = new Array(8).fill(0);
        const blackPawnsPerFile: number[] = new Array(8).fill(0);
        const whiteRooksPerFile: number[] = new Array(8).fill(0);
        const blackRooksPerFile: number[] = new Array(8).fill(0);

        for (let x = 0; x < 8; x++) {
            for (let y = 0; y < 8; y++) {
                const cell = board.cells[y][x];
                if (cell.type.color === "empty") continue;
                if (cell.type.piece === "pawn") {
                    cell.type.color === "white" ? whitePawnsPerFile[x]++ : blackPawnsPerFile[x]++;
                }
                if (cell.type.piece === "rook") {
                    cell.type.color === "white" ? whiteRooksPerFile[x]++ : blackRooksPerFile[x]++;
                }
            }
        }

        for (let x = 0; x < 8; x++) {
            if (whitePawnsPerFile[x] > 1) b.doubledPawns -= 20 * (whitePawnsPerFile[x] - 1);
            if (blackPawnsPerFile[x] > 1) b.doubledPawns += 20 * (blackPawnsPerFile[x] - 1);

            if (whitePawnsPerFile[x] > 0) {
                const hasNeighbor = (x > 0 && whitePawnsPerFile[x - 1] > 0) || (x < 7 && whitePawnsPerFile[x + 1] > 0);
                if (!hasNeighbor) b.isolatedPawns -= 15 * whitePawnsPerFile[x];
            }
            if (blackPawnsPerFile[x] > 0) {
                const hasNeighbor = (x > 0 && blackPawnsPerFile[x - 1] > 0) || (x < 7 && blackPawnsPerFile[x + 1] > 0);
                if (!hasNeighbor) b.isolatedPawns += 15 * blackPawnsPerFile[x];
            }

            if (whitePawnsPerFile[x] > 0 && blackPawnsPerFile[x] === 0) {
                for (let y = 7; y >= 0; y--) {
                    const c = board.cells[y][x];
                    if (c.type.piece === "pawn" && c.type.color === "white") {
                        let passed = true;
                        for (let fy = y + 1; fy < 8; fy++) {
                            if (x > 0 && board.cells[fy][x - 1].type.piece === "pawn" && board.cells[fy][x - 1].type.color === "black") { passed = false; break; }
                            if (x < 7 && board.cells[fy][x + 1].type.piece === "pawn" && board.cells[fy][x + 1].type.color === "black") { passed = false; break; }
                        }
                        if (passed) b.passedPawns += 30 + (y > 3 ? (y - 3) * 15 : 0);
                        break;
                    }
                }
            }
            if (blackPawnsPerFile[x] > 0 && whitePawnsPerFile[x] === 0) {
                for (let y = 0; y < 8; y++) {
                    const c = board.cells[y][x];
                    if (c.type.piece === "pawn" && c.type.color === "black") {
                        let passed = true;
                        for (let fy = y - 1; fy >= 0; fy--) {
                            if (x > 0 && board.cells[fy][x - 1].type.piece === "pawn" && board.cells[fy][x - 1].type.color === "white") { passed = false; break; }
                            if (x < 7 && board.cells[fy][x + 1].type.piece === "pawn" && board.cells[fy][x + 1].type.color === "white") { passed = false; break; }
                        }
                        if (passed) b.passedPawns -= 30 + (y < 4 ? (4 - y) * 15 : 0);
                        break;
                    }
                }
            }

            if (whiteRooksPerFile[x] > 0 && whitePawnsPerFile[x] === 0 && blackPawnsPerFile[x] === 0) b.rookOpenFile += 25;
            if (blackRooksPerFile[x] > 0 && whitePawnsPerFile[x] === 0 && blackPawnsPerFile[x] === 0) b.rookOpenFile -= 25;
            if (whiteRooksPerFile[x] > 0 && whitePawnsPerFile[x] === 0 && blackPawnsPerFile[x] > 0) b.rookSemiOpenFile += 15;
            if (blackRooksPerFile[x] > 0 && blackPawnsPerFile[x] === 0 && whitePawnsPerFile[x] > 0) b.rookSemiOpenFile -= 15;
        }

        const countPawnShield = (kingPos: Vector2, color: "white" | "black"): number => {
            let count = 0;
            const dir = color === "white" ? 1 : -1;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = 1; dy <= 2; dy++) {
                    const nx = kingPos.x + dx;
                    const ny = kingPos.y + dir * dy;
                    if (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) {
                        if (board.cells[ny][nx].type.piece === "pawn" && board.cells[ny][nx].type.color === color) count++;
                    }
                }
            }
            return count;
        };

        if (whiteKingPos) b.kingSafety += countPawnShield(whiteKingPos, "white") * 10;
        if (blackKingPos) b.kingSafety -= countPawnShield(blackKingPos, "black") * 10;

        if (this._isInCheck(board.turn, board)) {
            b.checkPenalty += board.turn === "white" ? -100 : 100;
        }

        b.total = b.material + b.pst + b.bishopPair + b.castling + b.rookSeventh
            + b.doubledPawns + b.isolatedPawns + b.passedPawns
            + b.rookOpenFile + b.rookSemiOpenFile + b.kingSafety + b.checkPenalty;

        return b;
    }

    getRankedMoves(depth = 1, board: ChessBoard = this.board): { notation: string; board: ChessBoard; score: number }[] {
        this._ttable.clear();

        const legalMoves = this._generateLegalMoves(board);
        if (legalMoves.length === 0) return [];

        const maximizing = board.turn === "white";

        // Move ordering for root moves
        legalMoves.sort((a, b) => {
            const aVal = this._quickMaterialCount(a);
            const bVal = this._quickMaterialCount(b);
            return maximizing ? bVal - aVal : aVal - bVal;
        });

        // Score every root move
        const scored: { score: number; board: ChessBoard }[] = [];
        let alpha = -Infinity;
        let beta = Infinity;

        for (const move of legalMoves) {
            const score = this._alphaBeta(move, depth - 1, alpha, beta, !maximizing);
            scored.push({score, board: move});
            if (maximizing) {
                alpha = Math.max(alpha, score);
            } else {
                beta = Math.min(beta, score);
            }
        }

        // Sort by score: best first for current side
        scored.sort((a, b) => maximizing ? b.score - a.score : a.score - b.score);

        return scored.map(s => ({
            notation: this._toChessNotation(board, s.board),
            board: s.board,
            score: s.score,
        }));
    }

    makeMove(notation: string): boolean {
        const possibleMoves = this.getAvailableMoves(this.board);

        // Filter out moves that leave the player in check
        const legalMoves = possibleMoves.filter(
            (m) => !this._isInCheck(this.board.turn, m.board)
        );

        for (const move of legalMoves) {
            const moveNotation = this._toChessNotation(this.board, move.board);
            if (moveNotation === notation) {
                this.board = move.board;
                return true;
            }
        }

        // Also try matching with check (+) or checkmate (#) suffixes stripped,
        // in case the caller includes or omits them
        const stripped = notation.replace(/[+#]$/, "");
        for (const move of legalMoves) {
            const moveNotation = this._toChessNotation(this.board, move.board).replace(/[+#]$/, "");
            if (moveNotation === stripped) {
                this.board = move.board;
                return true;
            }
        }

        return false;
    }

    /** UCI move (e.g. e2e4, e1g1, e7e8q) for a legal transition from {@code fromBoard} to {@code toBoard}. */
    toUci(fromBoard: ChessBoard, toBoard: ChessBoard): string {
        return this._boardPairToUci(fromBoard, toBoard);
    }

    /** Apply a move in UCI notation if it is legal. */
    makeUciMove(uci: string): boolean {
        const want = uci.trim().toLowerCase();
        if (!want) return false;
        for (const b of this._generateLegalMoves(this.board)) {
            if (this._boardPairToUci(this.board, b) === want) {
                this.board = b;
                return true;
            }
        }
        return false;
    }

    private _boardPairToUci(fromBoard: ChessBoard, toBoard: ChessBoard): string {
        const turn = fromBoard.turn;
        const files = "abcdefgh";

        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                if (fromBoard.cells[y][x].type.piece === "king" && fromBoard.cells[y][x].type.color === turn) {
                    for (let x2 = 0; x2 < 8; x2++) {
                        if (toBoard.cells[y][x2].type.piece === "king" && toBoard.cells[y][x2].type.color === turn) {
                            if (Math.abs(x2 - x) === 2) {
                                return `${files[x]}${y + 1}${files[x2]}${y + 1}`;
                            }
                            break;
                        }
                    }
                    break;
                }
            }
        }

        let fromPos: Vector2 | null = null;
        let toPos: Vector2 | null = null;
        let movedPiece: ChessPieceType | null = null;

        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const fromCell = fromBoard.cells[y][x];
                const toCell = toBoard.cells[y][x];

                if (fromCell.type.color === turn && toCell.type.color !== turn) {
                    if (!fromPos) {
                        fromPos = {x, y};
                        movedPiece = fromCell.type;
                    }
                }

                if (toCell.type.color === turn && fromCell.type.color !== turn) {
                    if (!toPos) {
                        toPos = {x, y};
                    }
                }
            }
        }

        if (!fromPos || !toPos || !movedPiece) return "";

        let uci = `${files[fromPos.x]}${fromPos.y + 1}${files[toPos.x]}${toPos.y + 1}`;
        if (movedPiece.piece === "pawn") {
            const destPiece = toBoard.cells[toPos.y][toPos.x].type.piece;
            if (destPiece !== "pawn") {
                const promo: Record<string, string> = {
                    queen: "q", rook: "r", bishop: "b", knight: "n",
                };
                uci += promo[destPiece] ?? "q";
            }
        }
        return uci;
    }

    private _toChessNotation(fromBoard: ChessBoard, toBoard: ChessBoard): string {
        const turn = fromBoard.turn;

        // Detect castling first: find king in both boards and check if it moved 2 squares
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                if (fromBoard.cells[y][x].type.piece === "king" && fromBoard.cells[y][x].type.color === turn) {
                    // Found king's old position — find its new position
                    for (let x2 = 0; x2 < 8; x2++) {
                        if (toBoard.cells[y][x2].type.piece === "king" && toBoard.cells[y][x2].type.color === turn) {
                            if (Math.abs(x2 - x) === 2) {
                                return x2 > x ? "O-O" : "O-O-O";
                            }
                            break;
                        }
                    }
                    break;
                }
            }
        }

        // Find the moved piece by comparing boards
        let fromPos: Vector2 | null = null;
        let toPos: Vector2 | null = null;
        let movedPiece: ChessPieceType | null = null;
        let capturedPiece: ChessPieceType | null = null;

        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const fromCell = fromBoard.cells[y][x];
                const toCell = toBoard.cells[y][x];

                // Find where a piece disappeared (from position)
                if (fromCell.type.color === turn && toCell.type.color !== turn) {
                    if (!fromPos) {
                        fromPos = {x, y};
                        movedPiece = fromCell.type;
                    }
                }

                // Find where the same piece appeared (to position)
                if (toCell.type.color === turn && fromCell.type.color !== turn) {
                    if (!toPos) {
                        toPos = {x, y};
                    }
                }

                // Check if piece was captured
                if (fromCell.type.color !== "empty" && fromCell.type.color !== turn &&
                    toCell.type.color !== fromCell.type.color) {
                    capturedPiece = fromCell.type;
                }
            }
        }

        if (!fromPos || !toPos || !movedPiece) return "invalid";

        const files = "abcdefgh";
        const fromFile = files[fromPos.x];
        const fromRank = (fromPos.y + 1).toString();
        const toFile = files[toPos.x];
        const toRank = (toPos.y + 1).toString();

        // Build notation
        let notation = "";

        const pieceMap: Record<string, string> = {
            knight: "N",
            bishop: "B",
            rook: "R",
            queen: "Q",
            king: "K",
        };

        // Add piece letter (except for pawns)
        if (movedPiece.piece !== "pawn") {
            notation += pieceMap[movedPiece.piece] || "";

            // Disambiguation: check if another piece of the same type can reach toPos
            let sameFile = false;
            let sameRank = false;
            let ambiguous = false;
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {
                    if (x === fromPos!.x && y === fromPos!.y) continue;
                    const c = fromBoard.cells[y][x];
                    if (c.type.piece === movedPiece!.piece && c.type.color === turn) {
                        // Check if this piece can reach toPos (pseudo-legal)
                        const canReach = this._canPieceReach(c.type.piece, x, y, toPos!.x, toPos!.y, fromBoard);
                        if (canReach) {
                            ambiguous = true;
                            if (x === fromPos!.x) sameFile = true;
                            if (y === fromPos!.y) sameRank = true;
                        }
                    }
                }
            }
            if (ambiguous) {
                if (sameFile && sameRank) {
                    notation += fromFile + fromRank;
                } else if (sameFile) {
                    notation += fromRank;
                } else {
                    notation += fromFile;
                }
            }
        }

        // For pawns, add file if capturing
        if (movedPiece.piece === "pawn" && capturedPiece) {
            notation += fromFile;
        }

        // Add capture symbol
        if (capturedPiece) {
            notation += "x";
        }

        // Add destination
        notation += toFile + toRank;

        // Promotion: if a pawn moved and the destination has a non-pawn piece
        if (movedPiece.piece === "pawn") {
            const destPiece = toBoard.cells[toPos.y][toPos.x].type.piece;
            if (destPiece !== "pawn") {
                notation += "=" + (pieceMap[destPiece] || "Q");
            }
        }

        return notation;
    }

    private _canPieceReach(piece: string, fromX: number, fromY: number, toX: number, toY: number, board: ChessBoard): boolean {
        const dx = toX - fromX;
        const dy = toY - fromY;
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);

        switch (piece) {
            case "knight":
                return (adx === 2 && ady === 1) || (adx === 1 && ady === 2);
            case "king":
                return adx <= 1 && ady <= 1;
            case "bishop":
                if (adx !== ady || adx === 0) return false;
                return this._isSlideClear(fromX, fromY, toX, toY, board);
            case "rook":
                if (dx !== 0 && dy !== 0) return false;
                return this._isSlideClear(fromX, fromY, toX, toY, board);
            case "queen":
                if (dx !== 0 && dy !== 0 && adx !== ady) return false;
                return this._isSlideClear(fromX, fromY, toX, toY, board);
            default:
                return false;
        }
    }

    private _isSlideClear(fromX: number, fromY: number, toX: number, toY: number, board: ChessBoard): boolean {
        const sx = Math.sign(toX - fromX);
        const sy = Math.sign(toY - fromY);
        let cx = fromX + sx, cy = fromY + sy;
        while (cx !== toX || cy !== toY) {
            if (board.cells[cy][cx].type.color !== "empty") return false;
            cx += sx;
            cy += sy;
        }
        return true;
    }

    private _copyBoard(board: ChessBoard): ChessBoard {
        const cells: ChessCell[][] = new Array(8);
        for (let y = 0; y < 8; y++) {
            const row = board.cells[y];
            const newRow: ChessCell[] = new Array(8);
            for (let x = 0; x < 8; x++) {
                newRow[x] = {type: {piece: row[x].type.piece, color: row[x].type.color}};
            }
            cells[y] = newRow;
        }
        return {
            cells,
            turn: board.turn,
            canCastle: {
                white: {kingside: board.canCastle.white.kingside, queenside: board.canCastle.white.queenside},
                black: {kingside: board.canCastle.black.kingside, queenside: board.canCastle.black.queenside},
            },
            didCastle: {white: board.didCastle.white, black: board.didCastle.black},
            enpassant: board.enpassant ? {x: board.enpassant.x, y: board.enpassant.y} : null,
        };
    }

    private _isInCheck(color: "white" | "black", board: ChessBoard): boolean {
        // Find the king position
        let kingPos: Vector2 | null = null;
        for (let x = 0; x < 8; x++) {
            for (let y = 0; y < 8; y++) {
                const cell = board.cells[y][x];
                if (cell.type.piece === "king" && cell.type.color === color) {
                    kingPos = {x, y};
                    break;
                }
            }
            if (kingPos) break;
        }

        if (!kingPos) return false;

        const enemy = color === "white" ? "black" : "white";
        return this._isAttackedBy(kingPos.x, kingPos.y, enemy, board);
    }

    private _isAttackedBy(tx: number, ty: number, attacker: "white" | "black", board: ChessBoard): boolean {
        const inBounds = (x: number, y: number) => x >= 0 && x < 8 && y >= 0 && y < 8;
        const aDir = attacker === "white" ? 1 : -1;
        // Pawn attacks
        if (inBounds(tx - 1, ty - aDir) && board.cells[ty - aDir][tx - 1].type.color === attacker && board.cells[ty - aDir][tx - 1].type.piece === "pawn") return true;
        if (inBounds(tx + 1, ty - aDir) && board.cells[ty - aDir][tx + 1].type.color === attacker && board.cells[ty - aDir][tx + 1].type.piece === "pawn") return true;
        // Knight attacks
        for (const [dx, dy] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
            const nx = tx + dx, ny = ty + dy;
            if (inBounds(nx, ny) && board.cells[ny][nx].type.color === attacker && board.cells[ny][nx].type.piece === "knight") return true;
        }
        // King attacks
        for (const [dx, dy] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
            const nx = tx + dx, ny = ty + dy;
            if (inBounds(nx, ny) && board.cells[ny][nx].type.color === attacker && board.cells[ny][nx].type.piece === "king") return true;
        }
        // Sliding attacks (rook/queen on straights, bishop/queen on diagonals)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            let cx = tx + dx, cy = ty + dy;
            while (inBounds(cx, cy)) {
                const p = board.cells[cy][cx].type;
                if (p.color !== "empty") {
                    if (p.color === attacker && (p.piece === "rook" || p.piece === "queen")) return true;
                    break;
                }
                cx += dx;
                cy += dy;
            }
        }
        for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            let cx = tx + dx, cy = ty + dy;
            while (inBounds(cx, cy)) {
                const p = board.cells[cy][cx].type;
                if (p.color !== "empty") {
                    if (p.color === attacker && (p.piece === "bishop" || p.piece === "queen")) return true;
                    break;
                }
                cx += dx;
                cy += dy;
            }
        }
        return false;
    }

    private _getAvailableMovesForCell(cell: ChessCell, position: Vector2, board: ChessBoard = this.board): ChessBoard[] {
        const moves: ChessBoard[] = [];
        const {x, y} = position;
        const color = cell.type.color as "white" | "black";
        const enemy = color === "white" ? "black" : "white";

        const inBounds = (x: number, y: number) => x >= 0 && x < 8 && y >= 0 && y < 8;
        const isEmpty = (x: number, y: number) => board.cells[y][x].type.color === "empty";
        const isEnemy = (x: number, y: number) =>
            board.cells[y][x].type.color !== "empty" && board.cells[y][x].type.color === enemy;

        const addMove = (toX: number, toY: number, extra?: (b: ChessBoard) => void) => {
            if (!inBounds(toX, toY)) return;
            const boardCopy = this._copyBoard(board);
            boardCopy.cells[toY][toX].type = {...cell.type};
            boardCopy.cells[y][x].type = {piece: "pawn", color: "empty"};
            boardCopy.enpassant = null;
            boardCopy.turn = enemy;

            // Update canCastle rights if king or rook moves
            if (cell.type.piece === "king") {
                boardCopy.canCastle[color].kingside = false;
                boardCopy.canCastle[color].queenside = false;
            }
            if (cell.type.piece === "rook") {
                if (x === 0 && y === (color === "white" ? 0 : 7))
                    boardCopy.canCastle[color].queenside = false;
                if (x === 7 && y === (color === "white" ? 0 : 7))
                    boardCopy.canCastle[color].kingside = false;
            }
            // If a rook gets captured, remove that side's canCastle rights
            if (toX === 0 && toY === (enemy === "white" ? 0 : 7))
                boardCopy.canCastle[enemy].queenside = false;
            if (toX === 7 && toY === (enemy === "white" ? 0 : 7))
                boardCopy.canCastle[enemy].kingside = false;

            if (extra) extra(boardCopy);
            moves.push(boardCopy);
        };

        const addIfEmpty = (toX: number, toY: number): boolean => {
            if (!inBounds(toX, toY) || !isEmpty(toX, toY)) return false;
            addMove(toX, toY);
            return true;
        };

        const addIfEnemy = (toX: number, toY: number) => {
            if (inBounds(toX, toY) && isEnemy(toX, toY)) addMove(toX, toY);
        };

        const addIfEmptyOrEnemy = (toX: number, toY: number): boolean => {
            if (!inBounds(toX, toY)) return false;
            if (isEmpty(toX, toY)) {
                addMove(toX, toY);
                return true;
            }
            if (isEnemy(toX, toY)) {
                addMove(toX, toY);
                return false;
            }
            return false;
        };

        const addSliding = (dx: number, dy: number) => {
            let cx = x + dx, cy = y + dy;
            while (inBounds(cx, cy)) {
                if (!addIfEmptyOrEnemy(cx, cy)) break;
                cx += dx;
                cy += dy;
            }
        };

        // Check if a square is attacked by the enemy
        const isAttackedBy = (tx: number, ty: number, attacker: "white" | "black"): boolean => {
            const aDir = attacker === "white" ? 1 : -1;
            // Pawn attacks
            if (inBounds(tx - 1, ty - aDir) && board.cells[ty - aDir][tx - 1].type.color === attacker && board.cells[ty - aDir][tx - 1].type.piece === "pawn") return true;
            if (inBounds(tx + 1, ty - aDir) && board.cells[ty - aDir][tx + 1].type.color === attacker && board.cells[ty - aDir][tx + 1].type.piece === "pawn") return true;
            // Knight attacks
            for (const [dx, dy] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
                const nx = tx + dx, ny = ty + dy;
                if (inBounds(nx, ny) && board.cells[ny][nx].type.color === attacker && board.cells[ny][nx].type.piece === "knight") return true;
            }
            // King attacks
            for (const [dx, dy] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
                const nx = tx + dx, ny = ty + dy;
                if (inBounds(nx, ny) && board.cells[ny][nx].type.color === attacker && board.cells[ny][nx].type.piece === "king") return true;
            }
            // Sliding attacks (rook/queen on straights, bishop/queen on diagonals)
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                let cx = tx + dx, cy = ty + dy;
                while (inBounds(cx, cy)) {
                    const p = board.cells[cy][cx].type;
                    if (p.color !== "empty") {
                        if (p.color === attacker && (p.piece === "rook" || p.piece === "queen")) return true;
                        break;
                    }
                    cx += dx;
                    cy += dy;
                }
            }
            for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
                let cx = tx + dx, cy = ty + dy;
                while (inBounds(cx, cy)) {
                    const p = board.cells[cy][cx].type;
                    if (p.color !== "empty") {
                        if (p.color === attacker && (p.piece === "bishop" || p.piece === "queen")) return true;
                        break;
                    }
                    cx += dx;
                    cy += dy;
                }
            }
            return false;
        };

        switch (cell.type.piece) {
            case "pawn": {
                const dir = color === "white" ? 1 : -1;
                const startRank = color === "white" ? 1 : 6;
                const promoRank = color === "white" ? 7 : 0;
                const isPromo = (y + dir) === promoRank;

                const addPromoMoves = (toX: number, toY: number, extraBefore?: (b: ChessBoard) => void) => {
                    if (isPromo) {
                        for (const promo of ["queen", "rook", "bishop", "knight"] as const) {
                            addMove(toX, toY, (b) => {
                                if (extraBefore) extraBefore(b);
                                b.cells[toY][toX].type = {piece: promo, color};
                            });
                        }
                    } else {
                        addMove(toX, toY, extraBefore);
                    }
                };

                // Single push
                if (inBounds(x, y + dir) && isEmpty(x, y + dir)) {
                    addPromoMoves(x, y + dir);
                    // Double push from starting rank — set en passant target
                    if (!isPromo && y === startRank && isEmpty(x, y + dir * 2)) {
                        addMove(x, y + dir * 2, (b) => {
                            b.enpassant = {x, y: y + dir};
                        });
                    }
                }

                // Diagonal captures
                if (inBounds(x - 1, y + dir) && isEnemy(x - 1, y + dir)) {
                    addPromoMoves(x - 1, y + dir);
                }
                if (inBounds(x + 1, y + dir) && isEnemy(x + 1, y + dir)) {
                    addPromoMoves(x + 1, y + dir);
                }

                // En passant (never on promo rank)
                if (board.enpassant) {
                    const ep = board.enpassant;
                    if (ep.x === x - 1 && ep.y === y + dir) {
                        addMove(x - 1, y + dir, (b) => {
                            b.cells[y][x - 1].type = {piece: "pawn", color: "empty"};
                        });
                    }
                    if (ep.x === x + 1 && ep.y === y + dir) {
                        addMove(x + 1, y + dir, (b) => {
                            b.cells[y][x + 1].type = {piece: "pawn", color: "empty"};
                        });
                    }
                }
                break;
            }

            case "knight": {
                const offsets = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
                for (const [dx, dy] of offsets) {
                    addIfEmptyOrEnemy(x + dx, y + dy);
                }
                break;
            }

            case "bishop": {
                addSliding(1, 1);
                addSliding(1, -1);
                addSliding(-1, 1);
                addSliding(-1, -1);
                break;
            }

            case "rook": {
                addSliding(1, 0);
                addSliding(-1, 0);
                addSliding(0, 1);
                addSliding(0, -1);
                break;
            }

            case "queen": {
                addSliding(1, 0);
                addSliding(-1, 0);
                addSliding(0, 1);
                addSliding(0, -1);
                addSliding(1, 1);
                addSliding(1, -1);
                addSliding(-1, 1);
                addSliding(-1, -1);
                break;
            }

            case "king": {
                const offsets = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
                for (const [dx, dy] of offsets) {
                    addIfEmptyOrEnemy(x + dx, y + dy);
                }

                // Castling
                const rank = color === "white" ? 0 : 7;
                if (x === 4 && y === rank) {
                    // Kingside
                    if (board.canCastle[color].kingside
                        && isEmpty(5, rank) && isEmpty(6, rank)
                        && board.cells[rank][7].type.piece === "rook"
                        && board.cells[rank][7].type.color === color
                        && !isAttackedBy(4, rank, enemy)
                        && !isAttackedBy(5, rank, enemy)
                        && !isAttackedBy(6, rank, enemy)) {
                        addMove(6, rank, (b) => {
                            // Move rook from h file to f file
                            b.cells[rank][5].type = {piece: "rook", color};
                            b.cells[rank][7].type = {piece: "pawn", color: "empty"};
                            b.canCastle[color].kingside = false;
                            b.canCastle[color].queenside = false;
                            b.didCastle[color] = true;
                        });
                    }
                    // Queenside
                    if (board.canCastle[color].queenside
                        && isEmpty(1, rank) && isEmpty(2, rank) && isEmpty(3, rank)
                        && board.cells[rank][0].type.piece === "rook"
                        && board.cells[rank][0].type.color === color
                        && !isAttackedBy(4, rank, enemy)
                        && !isAttackedBy(3, rank, enemy)
                        && !isAttackedBy(2, rank, enemy)) {
                        addMove(2, rank, (b) => {
                            // Move rook from a file to d file
                            b.cells[rank][3].type = {piece: "rook", color};
                            b.cells[rank][0].type = {piece: "pawn", color: "empty"};
                            b.canCastle[color].kingside = false;
                            b.canCastle[color].queenside = false;
                            b.didCastle[color] = true;
                        });
                    }
                }
                break;
            }
        }

        return moves;
    }

    private _generateLegalMoves(board: ChessBoard): ChessBoard[] {
        const moves: ChessBoard[] = [];
        for (let x = 0; x < 8; x++) {
            for (let y = 0; y < 8; y++) {
                const cell = board.cells[y][x];
                if (cell.type.color !== board.turn) continue;
                const childBoards = this._getAvailableMovesForCell(cell, {x, y}, board);
                for (const b of childBoards) {
                    if (!this._isInCheck(board.turn, b)) {
                        moves.push(b);
                    }
                }
            }
        }
        return moves;
    }

    private _ttable = new Map<string, { value: number; depth: number }>();

    /** Cap TT size so deep searches (e.g. depth 8) cannot grow the Map without bound on one position. */
    private static readonly _TTABLE_MAX = 120_000;

    private _ttableStore(key: string, value: number, depth: number): void {
        if (this._ttable.size < ChessBot._TTABLE_MAX) {
            this._ttable.set(key, { value, depth });
        }
    }

    private _boardKey(board: ChessBoard): string {
        let key = board.turn === "white" ? "w" : "b";
        const pieceChar: Record<string, string> = {
            pawn: "p", knight: "n", bishop: "b", rook: "r", queen: "q", king: "k",
        };
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const t = board.cells[y][x].type;
                if (t.color === "empty") {
                    key += ".";
                } else {
                    const c = pieceChar[t.piece];
                    key += t.color === "white" ? c.toUpperCase() : c;
                }
            }
        }
        key += (board.canCastle.white.kingside ? "K" : "") +
            (board.canCastle.white.queenside ? "Q" : "") +
            (board.canCastle.black.kingside ? "k" : "") +
            (board.canCastle.black.queenside ? "q" : "");
        if (board.enpassant) key += board.enpassant.x.toString() + board.enpassant.y.toString();
        return key;
    }

    private _quickMaterialCount(board: ChessBoard): number {
        let score = 0;
        const vals: Record<string, number> = {pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 0};
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const t = board.cells[y][x].type;
                if (t.color === "empty") continue;
                score += (t.color === "white" ? 1 : -1) * vals[t.piece];
            }
        }
        return score;
    }

    private _alphaBeta(board: ChessBoard, depth: number, alpha: number, beta: number, maximizing: boolean): number {
        // Check transposition table
        const key = this._boardKey(board);
        const cached = this._ttable.get(key);
        if (cached && cached.depth >= depth) {
            return cached.value;
        }

        // Leaf node — static evaluation
        if (depth === 0) {
            const value = this.getBoardValue(board);
            this._ttableStore(key, value, 0);
            return value;
        }

        const legalMoves = this._generateLegalMoves(board);

        // Terminal position
        if (legalMoves.length === 0) {
            if (this._isInCheck(board.turn, board)) {
                // Checkmate — return massive score for the winning side
                return maximizing ? -1000000 : 1000000;
            }
            return 0; // Stalemate
        }

        // Move ordering — sort captures/high-value exchanges first
        legalMoves.sort((a, b) => {
            const aVal = this._quickMaterialCount(a);
            const bVal = this._quickMaterialCount(b);
            return maximizing ? bVal - aVal : aVal - bVal;
        });

        let value: number;
        if (maximizing) {
            value = -Infinity;
            for (const move of legalMoves) {
                value = Math.max(value, this._alphaBeta(move, depth - 1, alpha, beta, false));
                alpha = Math.max(alpha, value);
                if (beta <= alpha) break;
            }
        } else {
            value = Infinity;
            for (const move of legalMoves) {
                value = Math.min(value, this._alphaBeta(move, depth - 1, alpha, beta, true));
                beta = Math.min(beta, value);
                if (beta <= alpha) break;
            }
        }

        this._ttableStore(key, value, depth);
        return value;
    }

    toFEN(): string {
        // Build board position string (ranks 8 to 1)
        const rows: string[] = [];
        for (let rank = 7; rank >= 0; rank--) {
            let rowStr = "";
            let emptyCount = 0;
            for (let file = 0; file < 8; file++) {
                const cell = this.board.cells[rank][file];
                if (cell.type.color === "empty") {
                    emptyCount++;
                } else {
                    if (emptyCount > 0) {
                        rowStr += emptyCount;
                        emptyCount = 0;
                    }
                    const pieceMap: Record<string, string> = {
                        pawn: "p",
                        knight: "n",
                        bishop: "b",
                        rook: "r",
                        queen: "q",
                        king: "k",
                    };
                    const piece = pieceMap[cell.type.piece];
                    rowStr += cell.type.color === "white" ? piece.toUpperCase() : piece;
                }
            }
            if (emptyCount > 0) {
                rowStr += emptyCount;
            }
            rows.push(rowStr);
        }
        const position = rows.join("/");

        // Active color
        const activeColor = this.board.turn === "white" ? "w" : "b";

        // Castling availability
        let castling = "";
        if (this.board.canCastle.white.kingside) castling += "K";
        if (this.board.canCastle.white.queenside) castling += "Q";
        if (this.board.canCastle.black.kingside) castling += "k";
        if (this.board.canCastle.black.queenside) castling += "q";
        if (castling === "") castling = "-";

        // En passant target square
        let enPassant = "-";
        if (this.board.enpassant) {
            const files = "abcdefgh";
            enPassant = files[this.board.enpassant.x] + (this.board.enpassant.y + 1);
        }

        // Halfmove clock and fullmove number (we don't track these, so use defaults)
        const halfmove = "0";
        const fullmove = "1";

        return `${position} ${activeColor} ${castling} ${enPassant} ${halfmove} ${fullmove}`;
    }

    private _parse_fen(fen: string) {
        const parts = fen.split(" ");
        const boardPosition = {x: 0, y: 7};
        const toParse = parts[0];
        for (let i = 0; i < toParse.length; i++) {
            const char = toParse[i];
            if (/[0-9]/.test(char)) {
                boardPosition.x += Number(char);
                continue;
            }
            const cell = this.board.cells[boardPosition.y][boardPosition.x];
            if (char !== "/") cell.type.color = /[a-z]/.test(char) ? "black" : "white";
            switch (char) {
                case "p":
                case "P":
                    cell.type.piece = "pawn";
                    break;
                case "b":
                case "B":
                    cell.type.piece = "bishop";
                    break;
                case "n":
                case "N":
                    cell.type.piece = "knight";
                    break;
                case "r":
                case "R":
                    cell.type.piece = "rook";
                    break;
                case "k":
                case "K":
                    cell.type.piece = "king";
                    break;
                case "q":
                case "Q":
                    cell.type.piece = "queen";
                    break;
                case "/":
                    boardPosition.x = 0;
                    boardPosition.y--;
                    break;
                default:
                    throw new Error("Invalid FEN character: " + char);
            }
            if (char !== "/") boardPosition.x++;
        }

        this.board.turn = parts[1] === "w" ? "white" : "black";

        // Parse canCastle
        const canCastle = parts[2];
        this.board.canCastle = {
            white: {kingside: canCastle.includes("K"), queenside: canCastle.includes("Q")},
            black: {kingside: canCastle.includes("k"), queenside: canCastle.includes("q")},
        };

        // Parse en passant
        if (parts[3] && parts[3] !== "-") {
            const file = parts[3].charCodeAt(0) - 97; // 'a' = 0
            const rank = parseInt(parts[3][1]) - 1;
            this.board.enpassant = {x: file, y: rank};
        } else {
            this.board.enpassant = null;
        }
    }

    public isInCheck(color: "white" | "black", board: ChessBoard = this.board): boolean {
        return this._isInCheck(color, board);
    }

    public toChessNotation(from: ChessBoard, to: ChessBoard): string {
        return this._toChessNotation(from, to);
    }

    public getLegalMoves(board: ChessBoard = this.board): ChessBoard[] {
        return this._generateLegalMoves(board);
    }
}

export function prettyBoard(board: ChessBoard): string {
    const lines: string[] = [];
    lines.push("  ┌───┬───┬───┬───┬───┬───┬───┬───┐");
    for (let rank = 7; rank >= 0; rank--) {
        const row = board.cells[rank]
            .map((cell, file) => {
                if (cell.type.color === "empty") {
                    // checkerboard dots
                    return (rank + file) % 2 === 0 ? " · " : "   ";
                }
                return ` ${UNICODE_PIECES[cell.type.color][cell.type.piece]} `;
            })
            .join("│");
        lines.push(`${rank + 1} │${row}│`);
        if (rank > 0) lines.push("  ├───┼───┼───┼───┼───┼───┼───┼───┤");
    }
    lines.push("  └───┴───┴───┴───┴───┴───┴───┴───┘");
    lines.push("    a   b   c   d   e   f   g   h");
    return lines.join("\n");
}
