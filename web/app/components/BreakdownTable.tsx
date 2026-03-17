"use client";

import type { EvalBreakdown } from "../hooks/useChessGame";

const LABELS: [keyof EvalBreakdown, string][] = [
    ["material", "Material"],
    ["pst", "Piece Position"],
    ["bishopPair", "Bishop Pair"],
    ["castling", "Castling"],
    ["rookSeventh", "Rook on 7th"],
    ["doubledPawns", "Doubled Pawns"],
    ["isolatedPawns", "Isolated Pawns"],
    ["passedPawns", "Passed Pawns"],
    ["rookOpenFile", "Rook Open File"],
    ["rookSemiOpenFile", "Rook Semi-Open"],
    ["kingSafety", "King Safety"],
    ["checkPenalty", "Check"],
];

interface BreakdownTableProps {
    breakdown: EvalBreakdown;
}

export default function BreakdownTable({ breakdown }: BreakdownTableProps) {
    return (
        <div style={{ fontSize: 11, fontFamily: "monospace" }}>
            {LABELS.map(([key, label]) => {
                const value = breakdown[key];
                if (value === 0) return null;
                return (
                    <div key={key} style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "1px 0",
                    }}>
                        <span style={{ color: "#999" }}>{label}</span>
                        <span style={{
                            color: value > 0 ? "#6c6" : "#c66",
                            fontWeight: 500,
                        }}>
                            {value > 0 ? "+" : ""}{(value / 100).toFixed(2)}
                        </span>
                    </div>
                );
            })}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "3px 0 0",
                marginTop: 3,
                borderTop: "1px solid #444",
                fontWeight: 700,
            }}>
                <span style={{ color: "#ccc" }}>Total</span>
                <span style={{
                    color: breakdown.total > 0 ? "#6c6" : breakdown.total < 0 ? "#c66" : "#888",
                }}>
                    {breakdown.total > 0 ? "+" : ""}{(breakdown.total / 100).toFixed(2)}
                </span>
            </div>
        </div>
    );
}
