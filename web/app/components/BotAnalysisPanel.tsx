"use client";

import { useState } from "react";
import type { RankedMoveInfo } from "../hooks/useChessGame";
import MiniBoard from "./MiniBoard";
import BreakdownTable from "./BreakdownTable";

interface BotAnalysisPanelProps {
    rankedMoves: RankedMoveInfo[];
    thinkingTimeMs: number;
    onClose: () => void;
}

export default function BotAnalysisPanel({ rankedMoves, thinkingTimeMs, onClose }: BotAnalysisPanelProps) {
    const [selectedIdx, setSelectedIdx] = useState(0);
    const selected = rankedMoves[selectedIdx];

    if (!selected) return null;

    return (
        <div style={{
            position: "fixed",
            right: 76,
            bottom: 20,
            width: 320,
            maxHeight: "80vh",
            background: "#1a1a1a",
            border: "2px solid #333",
            borderRadius: 8,
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
            zIndex: 99,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
        }}>
            {/* Header */}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 14px",
                background: "#222",
                borderBottom: "1px solid #333",
            }}>
                <div>
                    <span style={{ fontWeight: 600, color: "#eee", fontSize: 14 }}>Bot Analysis</span>
                    <span style={{ color: "#666", fontSize: 11, marginLeft: 8 }}>{thinkingTimeMs}ms</span>
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: "transparent",
                        border: "none",
                        color: "#888",
                        cursor: "pointer",
                        fontSize: 16,
                        padding: "2px 6px",
                        lineHeight: 1,
                    }}
                >
                    X
                </button>
            </div>

            {/* Move list */}
            <div style={{
                maxHeight: 180,
                overflowY: "auto",
                padding: 6,
            }}>
                {rankedMoves.map((move, idx) => {
                    const pawns = move.score / 100;
                    const isSelected = idx === selectedIdx;
                    const isBest = idx === 0;
                    return (
                        <div
                            key={move.notation}
                            onClick={() => setSelectedIdx(idx)}
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "4px 8px",
                                borderRadius: 4,
                                cursor: "pointer",
                                fontFamily: "monospace",
                                fontSize: 13,
                                background: isSelected ? "#3a5a8a" : isBest ? "#2a3a2a" : "transparent",
                                color: isSelected ? "#fff" : "#ccc",
                            }}
                        >
                            <span>
                                <span style={{ color: "#666", marginRight: 6, fontSize: 11 }}>{idx + 1}.</span>
                                {move.notation}
                            </span>
                            <span style={{
                                color: pawns > 0 ? "#6c6" : pawns < 0 ? "#c66" : "#888",
                                fontSize: 12,
                            }}>
                                {pawns > 0 ? "+" : ""}{pawns.toFixed(2)}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Preview section */}
            <div style={{
                padding: 12,
                borderTop: "1px solid #333",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                overflowY: "auto",
            }}>
                <div style={{ color: "#aaa", fontSize: 11, fontWeight: 600, alignSelf: "flex-start" }}>
                    After {selected.notation}
                </div>
                <MiniBoard cells={selected.board.cells} />
                <div style={{ width: "100%" }}>
                    <div style={{ color: "#aaa", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                        Eval Breakdown
                    </div>
                    <BreakdownTable breakdown={selected.breakdown} />
                </div>
            </div>
        </div>
    );
}
