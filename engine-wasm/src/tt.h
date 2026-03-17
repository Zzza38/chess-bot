#ifndef TT_H
#define TT_H

#include "types.h"

/* Zobrist key generation */
void     zobrist_init(void);
uint64_t zobrist_hash(const Board *b);
uint64_t zobrist_piece_key(int piece, int square);
uint64_t zobrist_castle_key(uint8_t castle_rights);
uint64_t zobrist_ep_key(int8_t ep_square);
uint64_t zobrist_side_key(void);

/* Transposition table */
#define TT_SIZE  (1 << 20)  /* ~1M entries = ~20MB */

void     tt_init(void);
void     tt_clear(void);
TTEntry *tt_probe(uint64_t key);
void     tt_store(uint64_t key, int depth, int value, uint8_t flag, Move best_move);

#endif /* TT_H */
