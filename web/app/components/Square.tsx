"use client";

import Piece from "./Piece";
import styles from "./Board.module.css";

interface SquareProps {
    x: number;
    y: number;
    piece: string;
    color: string;
    isSelected: boolean;
    isLegalDest: boolean;
    isCaptureDest: boolean;
    isLastMoveFrom: boolean;
    isLastMoveTo: boolean;
    onClick: () => void;
}

export default function Square({
    x, y, piece, color,
    isSelected, isLegalDest, isCaptureDest,
    isLastMoveFrom, isLastMoveTo,
    onClick,
}: SquareProps) {
    const isLight = (x + y) % 2 !== 0;
    const classes = [
        styles.square,
        isLight ? styles.light : styles.dark,
        isSelected ? styles.selected : "",
        isLastMoveFrom || isLastMoveTo ? styles.lastMove : "",
    ].filter(Boolean).join(" ");

    return (
        <div className={classes} onClick={onClick}>
            {color !== "empty" && <Piece piece={piece} color={color} />}
            {isLegalDest && !isCaptureDest && <div className={styles.legalDot} />}
            {isCaptureDest && <div className={styles.legalCapture} />}
        </div>
    );
}
