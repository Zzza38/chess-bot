"use client";

import { useChessGame } from "./hooks/useChessGame";
import Board from "./components/Board";
import MoveList from "./components/MoveList";
import Controls from "./components/Controls";
import EvalBar from "./components/EvalBar";
import BotAnalysisPanel from "./components/BotAnalysisPanel";

export default function Home() {
    const game = useChessGame();

    let statusMsg = "";
    if (game.isCheckmate) {
        const winner = game.turn === "white" ? "Black" : "White";
        statusMsg = `Checkmate — ${winner} wins!`;
    } else if (game.isStalemate) {
        statusMsg = "Stalemate — Draw";
    } else if (game.isBotThinking) {
        statusMsg = "Bot is thinking...";
    }

    return (
        <div style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "100vh",
            padding: 24,
            gap: 20,
        }}>
            {/* Eval bars */}
            <div style={{ display: "flex", gap: 6, height: "min(80vw, 80vh)", maxHeight: 640 }}>
                <EvalBar
                    label="Bot"
                    evalCp={game.evalResult?.botEval ?? null}
                    mate={null}
                    isLoading={game.isEvalLoading}
                />
                <EvalBar
                    label="SF"
                    evalCp={game.evalResult?.eval ?? null}
                    mate={game.evalResult?.mate ?? null}
                    isLoading={game.isEvalLoading}
                />
            </div>

            {/* Board */}
            <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
            }}>
                {statusMsg && (
                    <div style={{
                        padding: "8px 16px",
                        background: game.isCheckmate ? "#8b3a3a" : game.isStalemate ? "#5a5a3a" : "#2a2a2a",
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#eee",
                    }}>
                        {statusMsg}
                    </div>
                )}
                <div style={{
                    width: "min(80vw, 80vh)",
                    maxWidth: 640,
                    aspectRatio: "1",
                }}>
                    <Board
                        cells={game.board.cells}
                        flipped={game.flipped}
                        selectedSquare={game.selectedSquare}
                        legalDestinations={game.legalDestinations}
                        lastMove={game.lastMove}
                        onSquareClick={game.handleSquareClick}
                        pendingPromotion={game.pendingPromotion}
                        onPromotionChoice={game.handlePromotionChoice}
                    />
                </div>
                <div style={{ color: "#888", fontSize: 11, fontFamily: "monospace" }}>
                    {game.turn === "white" ? "White" : "Black"} to move
                </div>
            </div>

            {/* Side panel: controls + move list */}
            <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                maxHeight: "min(80vw, 80vh)",
            }}>
                <Controls
                    onNewGame={game.handleNewGame}
                    onFlip={game.handleFlip}
                    onBotMove={game.handleBotMove}
                    onUndo={game.handleUndo}
                    onRedo={game.handleRedo}
                    onLoadFen={game.handleLoadFen}
                    currentFen={game.currentFen}
                    searchDepth={game.searchDepth}
                    onSetDepth={game.handleSetDepth}
                    canUndo={game.canUndo}
                    canRedo={game.canRedo}
                    isBotThinking={game.isBotThinking}
                    isGameOver={game.isGameOver}
                />
                <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                    <MoveList
                        moves={game.moves}
                        currentMoveIndex={game.currentMoveIndex}
                        onGoToMove={game.handleGoToMove}
                    />
                </div>
            </div>

            {/* Analysis toggle button */}
            {game.botAnalysis && (
                <button
                    onClick={game.handleToggleBotAnalysis}
                    style={{
                        position: "fixed",
                        bottom: 20,
                        right: 20,
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        border: "2px solid #444",
                        background: game.showBotAnalysis ? "#3a5a8a" : "#2a2a2a",
                        color: "#eee",
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 600,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                        zIndex: 100,
                    }}
                    title="Toggle Bot Analysis"
                >
                    AI
                </button>
            )}

            {/* Analysis panel */}
            {game.showBotAnalysis && game.botAnalysis && (
                <BotAnalysisPanel
                    rankedMoves={game.botAnalysis.rankedMoves}
                    thinkingTimeMs={game.botAnalysis.thinkingTimeMs}
                    onClose={game.handleToggleBotAnalysis}
                />
            )}
        </div>
    );
}
