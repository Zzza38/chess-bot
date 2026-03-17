"use client";

import { Fragment } from "react";
import Square from "./Square";
import Piece from "./Piece";
import styles from "./Board.module.css";

interface BoardCell {
    piece: string;
    color: string;
}

interface Coord {
    x: number;
    y: number;
}

interface BoardProps {
    cells: BoardCell[][];
    flipped: boolean;
    selectedSquare: Coord | null;
    legalDestinations: Array<{ x: number; y: number; isCapture: boolean }>;
    lastMove: { from: Coord; to: Coord } | null;
    onSquareClick: (x: number, y: number) => void;
    pendingPromotion: { to: Coord; color: string } | null;
    onPromotionChoice: (piece: string) => void;
}

export default function Board({
    cells, flipped, selectedSquare, legalDestinations,
    lastMove, onSquareClick, pendingPromotion, onPromotionChoice,
}: BoardProps) {
    const ranks = flipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
    const files = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

    const isLegalDest = (x: number, y: number) =>
        legalDestinations.some(d => d.x === x && d.y === y && !d.isCapture);
    const isCaptureDest = (x: number, y: number) =>
        legalDestinations.some(d => d.x === x && d.y === y && d.isCapture);

    // Calculate promotion dialog position
    let promoStyle: React.CSSProperties | undefined;
    if (pendingPromotion) {
        const { to } = pendingPromotion;
        const fileIdx = files.indexOf(to.x);
        const rankIdx = ranks.indexOf(to.y);
        // Position is relative to the board grid. Each cell = 1/8th.
        // +1 col offset for rank labels
        const leftPct = ((fileIdx + 1) / 9) * 100;
        const topPct = (rankIdx / 8) * 100;
        promoStyle = {
            left: `${leftPct}%`,
            top: `${topPct}%`,
        };
    }

    return (
        <div className={styles.boardContainer}>
            {ranks.map((y) => (
                <Fragment key={`row-${y}`}>
                    <div className={styles.rankLabel}>{y + 1}</div>
                    {files.map((x) => {
                        const cell = cells[y]?.[x] || { piece: "pawn", color: "empty" };
                        return (
                            <Square
                                key={`${x}-${y}`}
                                x={x}
                                y={y}
                                piece={cell.piece}
                                color={cell.color}
                                isSelected={selectedSquare?.x === x && selectedSquare?.y === y}
                                isLegalDest={isLegalDest(x, y)}
                                isCaptureDest={isCaptureDest(x, y)}
                                isLastMoveFrom={lastMove?.from.x === x && lastMove?.from.y === y}
                                isLastMoveTo={lastMove?.to.x === x && lastMove?.to.y === y}
                                onClick={() => onSquareClick(x, y)}
                            />
                        );
                    })}
                </Fragment>
            ))}
            {/* File labels at bottom */}
            <div className={styles.fileLabelCorner} />
            {files.map(x => (
                <div key={`file-${x}`} className={styles.fileLabel}>
                    {"abcdefgh"[x]}
                </div>
            ))}

            {/* Promotion dialog overlay */}
            {pendingPromotion && promoStyle && (
                <div className={styles.promoOverlay} style={promoStyle}>
                    {["queen", "rook", "bishop", "knight"].map(p => (
                        <div
                            key={p}
                            className={styles.promoOption}
                            onClick={() => onPromotionChoice(p)}
                        >
                            <Piece piece={p} color={pendingPromotion.color} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
