"use client";

import { useRef, useEffect } from "react";

interface MoveListProps {
    moves: Array<{ notation: string }>;
    currentMoveIndex: number;
    onGoToMove: (index: number) => void;
}

export default function MoveList({ moves, currentMoveIndex, onGoToMove }: MoveListProps) {
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [moves.length]);

    // Group moves into pairs (white, black)
    const pairs: Array<{ num: number; white: { notation: string; idx: number }; black?: { notation: string; idx: number } }> = [];
    for (let i = 0; i < moves.length; i += 2) {
        pairs.push({
            num: Math.floor(i / 2) + 1,
            white: { notation: moves[i].notation, idx: i },
            black: moves[i + 1] ? { notation: moves[i + 1].notation, idx: i + 1 } : undefined,
        });
    }

    return (
        <div ref={listRef} style={{
            width: 220,
            maxHeight: "100%",
            overflowY: "auto",
            background: "#1a1a1a",
            borderRadius: 6,
            padding: "8px 4px",
            fontFamily: "monospace",
            fontSize: 14,
        }}>
            <div style={{ color: "#aaa", padding: "0 8px 6px", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                Moves
            </div>
            {pairs.length === 0 && (
                <div style={{ color: "#666", padding: "8px", textAlign: "center", fontSize: 12 }}>No moves yet</div>
            )}
            {pairs.map(p => (
                <div key={p.num} style={{ display: "flex", gap: 0, padding: "1px 0" }}>
                    <span style={{ width: 32, textAlign: "right", color: "#666", flexShrink: 0, padding: "2px 4px" }}>
                        {p.num}.
                    </span>
                    <span
                        onClick={() => onGoToMove(p.white.idx + 1)}
                        style={{
                            flex: 1,
                            padding: "2px 6px",
                            cursor: "pointer",
                            borderRadius: 3,
                            background: currentMoveIndex === p.white.idx + 1 ? "#3a5a8a" : "transparent",
                            color: currentMoveIndex === p.white.idx + 1 ? "#fff" : "#ccc",
                        }}
                    >
                        {p.white.notation}
                    </span>
                    {p.black && (
                        <span
                            onClick={() => onGoToMove(p.black!.idx + 1)}
                            style={{
                                flex: 1,
                                padding: "2px 6px",
                                cursor: "pointer",
                                borderRadius: 3,
                                background: currentMoveIndex === p.black.idx + 1 ? "#3a5a8a" : "transparent",
                                color: currentMoveIndex === p.black.idx + 1 ? "#fff" : "#ccc",
                            }}
                        >
                            {p.black.notation}
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}
