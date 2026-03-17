"use client";

import { useState } from "react";

interface ControlsProps {
    onNewGame: () => void;
    onFlip: () => void;
    onBotMove: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onLoadFen: (fen: string) => void;
    currentFen: string;
    searchDepth: number;
    onSetDepth: (d: number) => void;
    canUndo: boolean;
    canRedo: boolean;
    isBotThinking: boolean;
    isGameOver: boolean;
}

const btnStyle: React.CSSProperties = {
    padding: "6px 14px",
    border: "1px solid #444",
    borderRadius: 4,
    background: "#2a2a2a",
    color: "#eee",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    transition: "background 0.15s",
};

const btnDisabled: React.CSSProperties = {
    ...btnStyle,
    opacity: 0.4,
    cursor: "default",
};

export default function Controls({
    onNewGame, onFlip, onBotMove, onUndo, onRedo,
    onLoadFen, currentFen, searchDepth, onSetDepth,
    canUndo, canRedo, isBotThinking, isGameOver,
}: ControlsProps) {
    const [fenInput, setFenInput] = useState("");
    const [isEditing, setIsEditing] = useState(false);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: 220 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button style={btnStyle} onClick={onNewGame}>New Game</button>
                <button style={btnStyle} onClick={onFlip}>Flip</button>
                <button
                    style={isBotThinking || isGameOver ? btnDisabled : btnStyle}
                    onClick={onBotMove}
                    disabled={isBotThinking || isGameOver}
                >
                    {isBotThinking ? "Thinking..." : "Bot Move"}
                </button>
            </div>

            <div style={{ display: "flex", gap: 6 }}>
                <button style={canUndo ? btnStyle : btnDisabled} onClick={onUndo} disabled={!canUndo}>
                    ← Undo
                </button>
                <button style={canRedo ? btnStyle : btnDisabled} onClick={onRedo} disabled={!canRedo}>
                    Redo →
                </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ color: "#aaa", fontSize: 12, whiteSpace: "nowrap" }}>Depth: {searchDepth}</label>
                <input
                    type="range"
                    min={1}
                    max={15}
                    value={searchDepth}
                    onChange={e => onSetDepth(Number(e.target.value))}
                    style={{ flex: 1 }}
                />
            </div>

            {/* FEN — always visible, auto-updates */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ color: "#aaa", fontSize: 11, fontWeight: 600 }}>FEN</label>
                <input
                    type="text"
                    value={isEditing ? fenInput : currentFen}
                    onFocus={() => { setFenInput(currentFen); setIsEditing(true); }}
                    onBlur={() => setIsEditing(false)}
                    onChange={e => setFenInput(e.target.value)}
                    style={{
                        padding: "6px 8px",
                        background: "#1a1a1a",
                        border: "1px solid #444",
                        borderRadius: 4,
                        color: "#eee",
                        fontSize: 11,
                        fontFamily: "monospace",
                    }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                    <button
                        style={btnStyle}
                        onClick={() => { navigator.clipboard.writeText(currentFen); }}
                    >
                        Copy
                    </button>
                    <button
                        style={btnStyle}
                        onClick={() => { onLoadFen(fenInput); setIsEditing(false); }}
                    >
                        Load
                    </button>
                </div>
            </div>
        </div>
    );
}
