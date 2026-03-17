"use client";

import Piece from "./Piece";

interface MiniBoardProps {
    cells: Array<Array<{ piece: string; color: string }>>;
}

export default function MiniBoard({ cells }: MiniBoardProps) {
    return (
        <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(8, 1fr)",
            width: 160,
            height: 160,
            border: "1px solid #444",
            borderRadius: 3,
            overflow: "hidden",
            flexShrink: 0,
        }}>
            {[7, 6, 5, 4, 3, 2, 1, 0].map(y =>
                [0, 1, 2, 3, 4, 5, 6, 7].map(x => {
                    const cell = cells[y]?.[x];
                    const isLight = (x + y) % 2 !== 0;
                    return (
                        <div
                            key={`${x}-${y}`}
                            style={{
                                background: isLight ? "#f0d9b5" : "#b58863",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            {cell && cell.color !== "empty" && (
                                <Piece piece={cell.piece} color={cell.color} />
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
}
