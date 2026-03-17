#ifndef BOARD_H
#define BOARD_H

#include "types.h"

void board_init(Board *b);
void board_set_fen(Board *b, const char *fen);
int  board_get_fen(const Board *b, char *buf, int buflen);
void board_make_move(Board *b, Move m);
void board_unmake_move(Board *b);
void board_make_null_move(Board *b);
void board_unmake_null_move(Board *b);

/* Convert a move to algebraic notation (e.g., "Nf3", "O-O", "e4") */
int  move_to_notation(const Board *b, Move m, char *buf, int buflen);

/* Parse notation and find matching legal move. Returns MOVE_NONE if not found. */
Move board_parse_notation(Board *b, const char *notation);

/* Piece character for FEN */
static inline char piece_char(int piece_val) {
    /* piece_val is signed: positive=white, negative=black */
    int abs_p = piece_val > 0 ? piece_val : -piece_val;
    const char chars[] = ".pnbrqk";
    if (abs_p < 1 || abs_p > 6) return '.';
    char c = chars[abs_p];
    return piece_val > 0 ? (c - 32) : c; /* uppercase for white */
}

#endif /* BOARD_H */
