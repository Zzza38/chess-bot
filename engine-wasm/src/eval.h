#ifndef EVAL_H
#define EVAL_H

#include "types.h"

/* Static evaluation from white's perspective (positive = white advantage) */
int evaluate(Board *b);

/* Detailed breakdown for the analysis panel */
EvalBreakdown evaluate_breakdown(Board *b);

#endif /* EVAL_H */
