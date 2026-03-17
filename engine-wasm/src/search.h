#ifndef SEARCH_H
#define SEARCH_H

#include "types.h"

/* Initialize search state (killer moves, history table, etc.) */
void search_init(void);

/* Search for the best move using iterative deepening.
 * Returns the best move, fills result with score/depth/nodes. */
Move search_best(Board *b, int max_depth, SearchResult *result);

/* Get ranked moves (all legal moves scored). Returns count.
 * Fills 'ranked' array. Caller should allocate MAX_MOVES entries. */
int search_ranked(Board *b, int depth, RankedMove *ranked, int max_results);

#endif /* SEARCH_H */
