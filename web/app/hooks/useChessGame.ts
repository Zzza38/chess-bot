"use client";

import { useReducer, useCallback, useEffect } from "react";
import type { MoveInfo, SerializedBoard } from "../api/_lib/serialize";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

interface HistoryEntry {
    fen: string;
    board: SerializedBoard;
    notation: string | null;
    isCheck: boolean;
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

export interface RankedMoveInfo {
    notation: string;
    score: number;
    board: SerializedBoard;
    breakdown: EvalBreakdown;
}

export interface BotAnalysisData {
    rankedMoves: RankedMoveInfo[];
    thinkingTimeMs: number;
}

interface GameState {
    history: HistoryEntry[];
    currentIndex: number;
    selectedSquare: { x: number; y: number } | null;
    legalMoves: MoveInfo[];
    pendingPromotion: {
        from: { x: number; y: number };
        to: { x: number; y: number };
        moves: Array<{ notation: string; promotionPiece: string | null }>;
    } | null;
    flipped: boolean;
    searchDepth: number;
    evalResult: { botEval: number; eval: number; mate: number | null; bestMove: string } | null;
    isEvalLoading: boolean;
    isBotThinking: boolean;
    isCheckmate: boolean;
    isStalemate: boolean;
    botAnalysis: BotAnalysisData | null;
    showBotAnalysis: boolean;
}

type Action =
    | { type: "SELECT_SQUARE"; x: number; y: number }
    | { type: "CLEAR_SELECTION" }
    | { type: "SET_LEGAL_MOVES"; moves: MoveInfo[] }
    | { type: "MAKE_MOVE"; fen: string; board: SerializedBoard; notation: string; isCheck: boolean; isCheckmate: boolean; isStalemate: boolean }
    | { type: "UNDO" }
    | { type: "REDO" }
    | { type: "GO_TO_MOVE"; index: number }
    | { type: "FLIP_BOARD" }
    | { type: "SET_DEPTH"; depth: number }
    | { type: "NEW_GAME"; board: SerializedBoard }
    | { type: "LOAD_FEN"; fen: string; board: SerializedBoard }
    | { type: "SET_EVAL"; result: GameState["evalResult"] }
    | { type: "SET_EVAL_LOADING"; loading: boolean }
    | { type: "SET_BOT_THINKING"; thinking: boolean }
    | { type: "SET_PENDING_PROMOTION"; data: GameState["pendingPromotion"] }
    | { type: "CLEAR_PENDING_PROMOTION" }
    | { type: "SET_BOT_ANALYSIS"; data: BotAnalysisData }
    | { type: "TOGGLE_BOT_ANALYSIS" };

function makeInitialBoard(): SerializedBoard {
    // Standard starting position
    const backRank = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
    const cells: Array<Array<{ piece: string; color: string }>> = [];
    for (let y = 0; y < 8; y++) {
        const row: Array<{ piece: string; color: string }> = [];
        for (let x = 0; x < 8; x++) {
            if (y === 0) row.push({ piece: backRank[x], color: "white" });
            else if (y === 1) row.push({ piece: "pawn", color: "white" });
            else if (y === 6) row.push({ piece: "pawn", color: "black" });
            else if (y === 7) row.push({ piece: backRank[x], color: "black" });
            else row.push({ piece: "pawn", color: "empty" });
        }
        cells.push(row);
    }
    return {
        cells,
        turn: "white",
        canCastle: { white: { kingside: true, queenside: true }, black: { kingside: true, queenside: true } },
        didCastle: { white: false, black: false },
        enpassant: null,
    };
}

function createInitialState(): GameState {
    return {
        history: [{
            fen: STARTING_FEN,
            board: makeInitialBoard(),
            notation: null,
            isCheck: false,
        }],
        currentIndex: 0,
        selectedSquare: null,
        legalMoves: [],
        pendingPromotion: null,
        flipped: false,
        searchDepth: 3,
        evalResult: null,
        isEvalLoading: false,
        isBotThinking: false,
        isCheckmate: false,
        isStalemate: false,
        botAnalysis: null,
        showBotAnalysis: false,
    };
}

function reducer(state: GameState, action: Action): GameState {
    switch (action.type) {
        case "SELECT_SQUARE":
            return { ...state, selectedSquare: { x: action.x, y: action.y } };

        case "CLEAR_SELECTION":
            return { ...state, selectedSquare: null, legalMoves: state.legalMoves };

        case "SET_LEGAL_MOVES":
            return { ...state, legalMoves: action.moves };

        case "MAKE_MOVE": {
            const newHistory = state.history.slice(0, state.currentIndex + 1);
            newHistory.push({
                fen: action.fen,
                board: action.board,
                notation: action.notation,
                isCheck: action.isCheck,
            });
            return {
                ...state,
                history: newHistory,
                currentIndex: newHistory.length - 1,
                selectedSquare: null,
                pendingPromotion: null,
                evalResult: null,
                isCheckmate: action.isCheckmate,
                isStalemate: action.isStalemate,
            };
        }

        case "UNDO":
            if (state.currentIndex <= 0) return state;
            return {
                ...state,
                currentIndex: state.currentIndex - 1,
                selectedSquare: null,
                pendingPromotion: null,
                isCheckmate: false,
                isStalemate: false,
                evalResult: null,
            };

        case "REDO":
            if (state.currentIndex >= state.history.length - 1) return state;
            return {
                ...state,
                currentIndex: state.currentIndex + 1,
                selectedSquare: null,
                pendingPromotion: null,
                evalResult: null,
            };

        case "GO_TO_MOVE":
            return {
                ...state,
                currentIndex: action.index,
                selectedSquare: null,
                pendingPromotion: null,
                evalResult: null,
                isCheckmate: false,
                isStalemate: false,
            };

        case "FLIP_BOARD":
            return { ...state, flipped: !state.flipped };

        case "SET_DEPTH":
            return { ...state, searchDepth: action.depth };

        case "NEW_GAME":
            return {
                ...createInitialState(),
                flipped: state.flipped,
                searchDepth: state.searchDepth,
                history: [{
                    fen: STARTING_FEN,
                    board: action.board,
                    notation: null,
                    isCheck: false,
                }],
            };

        case "LOAD_FEN":
            return {
                ...createInitialState(),
                flipped: state.flipped,
                searchDepth: state.searchDepth,
                history: [{
                    fen: action.fen,
                    board: action.board,
                    notation: null,
                    isCheck: false,
                }],
            };

        case "SET_EVAL":
            return { ...state, evalResult: action.result, isEvalLoading: false };

        case "SET_EVAL_LOADING":
            return { ...state, isEvalLoading: action.loading };

        case "SET_BOT_THINKING":
            return { ...state, isBotThinking: action.thinking };

        case "SET_PENDING_PROMOTION":
            return { ...state, pendingPromotion: action.data };

        case "CLEAR_PENDING_PROMOTION":
            return { ...state, pendingPromotion: null, selectedSquare: null };

        case "SET_BOT_ANALYSIS":
            return { ...state, botAnalysis: action.data };

        case "TOGGLE_BOT_ANALYSIS":
            return { ...state, showBotAnalysis: !state.showBotAnalysis };

        default:
            return state;
    }
}

export function useChessGame() {
    const [state, dispatch] = useReducer(reducer, undefined, createInitialState);

    const currentPosition = state.history[state.currentIndex];
    const canUndo = state.currentIndex > 0;
    const canRedo = state.currentIndex < state.history.length - 1;
    const isGameOver = state.isCheckmate || state.isStalemate;
    const moves = state.history.slice(1).map(h => ({ notation: h.notation! }));

    // Derive last move
    const lastMove = state.currentIndex > 0
        ? deriveLastMove(state.history[state.currentIndex - 1].board, currentPosition.board, state.history[state.currentIndex - 1].board.turn)
        : null;

    // Pre-fetch legal moves when position changes
    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/legal-moves", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fen: currentPosition.fen }),
            signal: controller.signal,
        })
            .then(r => r.json())
            .then(data => dispatch({ type: "SET_LEGAL_MOVES", moves: data.moves }))
            .catch(() => {});
        return () => controller.abort();
    }, [currentPosition.fen]);

    const handleSquareClick = useCallback(async (x: number, y: number) => {
        if (isGameOver || state.isBotThinking) return;

        // If pending promotion, cancel on outside click
        if (state.pendingPromotion) {
            dispatch({ type: "CLEAR_PENDING_PROMOTION" });
            return;
        }

        const currentBoard = currentPosition.board;

        if (!state.selectedSquare) {
            // Nothing selected — select own piece
            if (currentBoard.cells[y]?.[x]?.color === currentBoard.turn) {
                dispatch({ type: "SELECT_SQUARE", x, y });
            }
            return;
        }

        // Same square — deselect
        if (state.selectedSquare.x === x && state.selectedSquare.y === y) {
            dispatch({ type: "CLEAR_SELECTION" });
            return;
        }

        // Check if this is a legal destination
        const matching = state.legalMoves.filter(
            m => m.from.x === state.selectedSquare!.x && m.from.y === state.selectedSquare!.y
                && m.to.x === x && m.to.y === y
        );

        if (matching.length === 0) {
            // Not a legal destination — maybe select a different piece
            if (currentBoard.cells[y]?.[x]?.color === currentBoard.turn) {
                dispatch({ type: "SELECT_SQUARE", x, y });
            } else {
                dispatch({ type: "CLEAR_SELECTION" });
            }
            return;
        }

        // Check for promotion
        const promoMoves = matching.filter(m => m.isPromotion);
        if (promoMoves.length > 0) {
            dispatch({
                type: "SET_PENDING_PROMOTION",
                data: {
                    from: state.selectedSquare,
                    to: { x, y },
                    moves: promoMoves.map(m => ({ notation: m.notation, promotionPiece: m.promotionPiece })),
                },
            });
            return;
        }

        // Normal move
        await executeMove(matching[0].notation);
    }, [state.selectedSquare, state.legalMoves, currentPosition, isGameOver, state.isBotThinking, state.pendingPromotion]);

    async function executeMove(notation: string) {
        const res = await fetch("/api/move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fen: currentPosition.fen, notation }),
        });
        const data = await res.json();
        if (data.success) {
            dispatch({
                type: "MAKE_MOVE",
                fen: data.fen,
                board: data.board,
                notation,
                isCheck: data.isCheck,
                isCheckmate: data.isCheckmate,
                isStalemate: data.isStalemate,
            });
        }
    }

    const handlePromotionChoice = useCallback(async (piece: string) => {
        if (!state.pendingPromotion) return;
        const promoMap: Record<string, string> = { queen: "Q", rook: "R", bishop: "B", knight: "N" };
        const suffix = promoMap[piece] || "Q";
        const move = state.pendingPromotion.moves.find(m => m.notation.endsWith("=" + suffix));
        dispatch({ type: "CLEAR_PENDING_PROMOTION" });
        if (move) {
            await executeMove(move.notation);
        }
    }, [state.pendingPromotion, currentPosition.fen]);

    const handleBotMove = useCallback(async () => {
        if (isGameOver || state.isBotThinking) return;
        dispatch({ type: "SET_BOT_THINKING", thinking: true });
        try {
            const res = await fetch("/api/bot-move", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fen: currentPosition.fen, depth: state.searchDepth }),
            });
            const data = await res.json();
            if (data.notation) {
                dispatch({
                    type: "MAKE_MOVE",
                    fen: data.fen,
                    board: data.board,
                    notation: data.notation,
                    isCheck: data.isCheck,
                    isCheckmate: data.isCheckmate,
                    isStalemate: data.isStalemate,
                });
            }
        } finally {
            dispatch({ type: "SET_BOT_THINKING", thinking: false });
        }
    }, [currentPosition.fen, state.searchDepth, isGameOver, state.isBotThinking]);

    // Auto-evaluate whenever position changes
    useEffect(() => {
        const controller = new AbortController();
        dispatch({ type: "SET_EVAL_LOADING", loading: true });
        fetch("/api/stockfish-eval", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fen: currentPosition.fen }),
            signal: controller.signal,
        })
            .then(r => r.json())
            .then(data => dispatch({ type: "SET_EVAL", result: data }))
            .catch(() => dispatch({ type: "SET_EVAL_LOADING", loading: false }));
        return () => controller.abort();
    }, [currentPosition.fen]);

    // Auto-analyze position in background
    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/bot-analysis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fen: currentPosition.fen, depth: state.searchDepth }),
            signal: controller.signal,
        })
            .then(r => r.json())
            .then(data => dispatch({ type: "SET_BOT_ANALYSIS", data }))
            .catch(() => {});
        return () => controller.abort();
    }, [currentPosition.fen, state.searchDepth]);

    const handleLoadFen = useCallback(async (fen: string) => {
        try {
            // Validate by fetching legal moves (which creates a ChessBot from the FEN)
            const res = await fetch("/api/legal-moves", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fen }),
            });
            if (!res.ok) return;
            // Also need the board state — make a dummy move request to get it
            // Actually, just fetch the board via the move endpoint with the FEN
            const moveRes = await fetch("/api/move", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fen, notation: "__get_board__" }),
            });
            // This will fail (no such move), but we need the board
            // Better approach: add a dedicated endpoint or parse FEN client-side
            // For now, let's parse the FEN client-side to get the board
            const board = fenToBoard(fen);
            dispatch({ type: "LOAD_FEN", fen, board });
        } catch {
            // Invalid FEN
        }
    }, []);

    const handleNewGame = useCallback(async () => {
        const board = fenToBoard(STARTING_FEN);
        dispatch({ type: "NEW_GAME", board });
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            if (e.target instanceof HTMLInputElement) return;
            if (e.key === "ArrowLeft") { dispatch({ type: "UNDO" }); e.preventDefault(); }
            if (e.key === "ArrowRight") { dispatch({ type: "REDO" }); e.preventDefault(); }
            if (e.key === "f") dispatch({ type: "FLIP_BOARD" });
        }
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, []);

    // Filter legal destinations for the selected square
    const legalDestinations = state.selectedSquare
        ? state.legalMoves
            .filter(m => m.from.x === state.selectedSquare!.x && m.from.y === state.selectedSquare!.y)
            .map(m => ({ x: m.to.x, y: m.to.y, isCapture: m.isCapture }))
            // Deduplicate (promotions create multiple entries for the same square)
            .filter((d, i, arr) => arr.findIndex(a => a.x === d.x && a.y === d.y) === i)
        : [];

    return {
        board: currentPosition.board,
        flipped: state.flipped,
        selectedSquare: state.selectedSquare,
        legalDestinations,
        lastMove,
        pendingPromotion: state.pendingPromotion ? {
            to: state.pendingPromotion.to,
            color: currentPosition.board.turn,
        } : null,
        moves,
        currentMoveIndex: state.currentIndex,
        searchDepth: state.searchDepth,
        currentFen: currentPosition.fen,
        evalResult: state.evalResult,
        isEvalLoading: state.isEvalLoading,
        isBotThinking: state.isBotThinking,
        isCheckmate: state.isCheckmate,
        isStalemate: state.isStalemate,
        isGameOver,
        canUndo,
        canRedo,
        turn: currentPosition.board.turn,
        handleSquareClick,
        handlePromotionChoice,
        handleBotMove,
        handleLoadFen,
        handleNewGame,
        handleUndo: () => dispatch({ type: "UNDO" }),
        handleRedo: () => dispatch({ type: "REDO" }),
        handleFlip: () => dispatch({ type: "FLIP_BOARD" }),
        handleSetDepth: (d: number) => dispatch({ type: "SET_DEPTH", depth: d }),
        handleGoToMove: (index: number) => dispatch({ type: "GO_TO_MOVE", index }),
        botAnalysis: state.botAnalysis,
        showBotAnalysis: state.showBotAnalysis,
        handleToggleBotAnalysis: () => dispatch({ type: "TOGGLE_BOT_ANALYSIS" }),
    };
}

function deriveLastMove(
    prevBoard: SerializedBoard,
    currBoard: SerializedBoard,
    prevTurn: string,
): { from: { x: number; y: number }; to: { x: number; y: number } } | null {
    let from: { x: number; y: number } | null = null;
    let to: { x: number; y: number } | null = null;

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const pc = prevBoard.cells[y]?.[x];
            const cc = currBoard.cells[y]?.[x];
            if (!pc || !cc) continue;

            if (pc.color === prevTurn && cc.color !== prevTurn) {
                // Piece of the moving color disappeared — prefer king for castling
                if (!from || pc.piece === "king") from = { x, y };
            }
            if (cc.color === prevTurn && pc.color !== prevTurn) {
                to = { x, y };
            }
        }
    }

    if (from && to) return { from, to };
    return null;
}

function fenToBoard(fen: string): SerializedBoard {
    const parts = fen.split(" ");
    const rows = parts[0].split("/");
    const cells: Array<Array<{ piece: string; color: string }>> = [];

    const pieceMap: Record<string, string> = {
        p: "pawn", r: "rook", n: "knight", b: "bishop", q: "queen", k: "king",
        P: "pawn", R: "rook", N: "knight", B: "bishop", Q: "queen", K: "king",
    };

    // FEN rows go from rank 8 (top) to rank 1 (bottom), but our array is y=0 is rank 1
    for (let i = 0; i < 8; i++) {
        cells[7 - i] = [];
        const row = rows[i];
        let x = 0;
        for (const ch of row) {
            if (/[1-8]/.test(ch)) {
                for (let n = 0; n < parseInt(ch); n++) {
                    cells[7 - i][x++] = { piece: "pawn", color: "empty" };
                }
            } else {
                const color = ch === ch.toUpperCase() ? "white" : "black";
                cells[7 - i][x++] = { piece: pieceMap[ch], color };
            }
        }
    }

    const turn = (parts[1] === "b" ? "black" : "white") as "white" | "black";
    const castling = parts[2] || "-";
    const canCastle = {
        white: { kingside: castling.includes("K"), queenside: castling.includes("Q") },
        black: { kingside: castling.includes("k"), queenside: castling.includes("q") },
    };

    let enpassant: { x: number; y: number } | null = null;
    if (parts[3] && parts[3] !== "-") {
        enpassant = {
            x: parts[3].charCodeAt(0) - 97,
            y: parseInt(parts[3][1]) - 1,
        };
    }

    return {
        cells,
        turn,
        canCastle,
        didCastle: { white: false, black: false },
        enpassant,
    };
}
