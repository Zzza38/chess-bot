#ifndef MOVEGEN_H
#define MOVEGEN_H

#include "types.h"

/* Generate all pseudo-legal moves. Returns count. */
int generate_pseudo_legal(Board *b, Move *list);

/* Generate only capture moves (for quiescence search). Returns count. */
int generate_captures(Board *b, Move *list);

/* Generate all legal moves. Returns count. */
int generate_legal(Board *b, Move *list);

/* Check if a square is attacked by the given color */
int is_attacked(const Board *b, int square, int by_color);

/* Check if the given color's king is in check */
int is_in_check(const Board *b, int color);

#endif /* MOVEGEN_H */
