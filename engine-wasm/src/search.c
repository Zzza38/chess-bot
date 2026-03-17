#include "search.h"
#include "eval.h"
#include "movegen.h"
#include "board.h"
#include "tt.h"
#include <string.h>

/* Forward declarations */
static inline int material_val_lookup(int piece_type);
static int negamax(Board *b, int depth, int alpha, int beta, int ply);

/* --- Search state --- */

/* Killer moves: 2 per ply */
static Move killers[MAX_PLY][2];

/* History heuristic: history[color][from][to] */
static int history[2][64][64];

/* Node counter */
static int node_count;

/* --- MVV-LVA scoring --- */
/* Most Valuable Victim - Least Valuable Attacker */
static const int mvv_lva_table[7][7] = {
    /*          .    P    N    B    R    Q    K   (attacker) */
    /* . */  {  0,   0,   0,   0,   0,   0,   0 },
    /* P */  {  0, 105, 104, 103, 102, 101, 100 },
    /* N */  {  0, 205, 204, 203, 202, 201, 200 },
    /* B */  {  0, 305, 304, 303, 302, 301, 300 },
    /* R */  {  0, 405, 404, 403, 402, 401, 400 },
    /* Q */  {  0, 505, 504, 503, 502, 501, 500 },
    /* K */  {  0, 605, 604, 603, 602, 601, 600 },
};

void search_init(void) {
    memset(killers, 0, sizeof(killers));
    memset(history, 0, sizeof(history));
    node_count = 0;
}

/* --- Move ordering --- */

static void score_moves(Board *b, Move *moves, int *scores, int n, Move tt_move, int ply) {
    int side = b->side;
    for (int i = 0; i < n; i++) {
        if (moves[i] == tt_move) {
            scores[i] = 100000; /* TT move first */
        } else if (move_is_capture(moves[i])) {
            int victim = move_captured(moves[i]);
            int abs_piece = b->squares[move_from(moves[i])];
            int attacker = abs_piece > 0 ? abs_piece : -abs_piece;
            if (victim >= 1 && victim <= 6 && attacker >= 1 && attacker <= 6)
                scores[i] = 10000 + mvv_lva_table[victim][attacker];
            else
                scores[i] = 10000;
        } else if (moves[i] == killers[ply][0]) {
            scores[i] = 9000;
        } else if (moves[i] == killers[ply][1]) {
            scores[i] = 8000;
        } else {
            scores[i] = history[side][move_from(moves[i])][move_to(moves[i])];
        }
    }
}

/* Selection sort: pick the best move and swap it to position 'start' */
static void pick_move(Move *moves, int *scores, int n, int start) {
    int best_idx = start;
    int best_score = scores[start];
    for (int i = start + 1; i < n; i++) {
        if (scores[i] > best_score) {
            best_score = scores[i];
            best_idx = i;
        }
    }
    if (best_idx != start) {
        /* Swap */
        Move tm = moves[start]; moves[start] = moves[best_idx]; moves[best_idx] = tm;
        int ts = scores[start]; scores[start] = scores[best_idx]; scores[best_idx] = ts;
    }
}

/* Material value lookup for quiescence delta pruning */
static inline int material_val_lookup(int piece_type) {
    static const int vals[] = {0, 100, 320, 330, 500, 900, 20000};
    if (piece_type < 0 || piece_type > 6) return 0;
    return vals[piece_type];
}

/* --- Quiescence search --- */

static int quiescence(Board *b, int alpha, int beta) {
    node_count++;

    int stand_pat = evaluate(b);
    /* Side-relative: convert to side-to-move perspective */
    if (b->side == BLACK) stand_pat = -stand_pat;

    if (stand_pat >= beta) return beta;
    if (stand_pat > alpha) alpha = stand_pat;

    /* Delta pruning: if even capturing a queen can't raise alpha, skip */
    if (stand_pat + 900 < alpha) return alpha;

    Move captures[MAX_MOVES];
    int n = generate_captures(b, captures);

    /* Simple MVV-LVA ordering for captures */
    int scores[MAX_MOVES];
    for (int i = 0; i < n; i++) {
        int victim = move_captured(captures[i]);
        scores[i] = victim >= 1 && victim <= 6 ? material_val_lookup(victim) : 0;
    }

    for (int i = 0; i < n; i++) {
        pick_move(captures, scores, n, i);

        board_make_move(b, captures[i]);
        /* Check legality: our king must not be in check after the move */
        if (is_in_check(b, b->side ^ 1)) {
            board_unmake_move(b);
            continue;
        }

        int score = -quiescence(b, -beta, -alpha);
        board_unmake_move(b);

        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
    }

    return alpha;
}

/* --- Main negamax search --- */

static int negamax(Board *b, int depth, int alpha, int beta, int ply) {
    node_count++;

    /* Check TT */
    TTEntry *tt = tt_probe(b->hash);
    Move tt_move = MOVE_NONE;
    if (tt && tt->depth >= depth) {
        tt_move = tt->best_move;
        if (tt->flag == TT_EXACT) return tt->value;
        if (tt->flag == TT_BETA && tt->value >= beta) return tt->value;
        if (tt->flag == TT_ALPHA && tt->value <= alpha) return tt->value;
    } else if (tt) {
        tt_move = tt->best_move;
    }

    /* Leaf node: quiescence search */
    if (depth <= 0) {
        return quiescence(b, alpha, beta);
    }

    int in_check = is_in_check(b, b->side);

    /* Null move pruning: skip when in check or at shallow depths */
    if (!in_check && depth >= 3 && ply > 0) {
        /* Quick material check: don't do null move in endgame (few pieces) */
        int piece_count = 0;
        for (int s = 0; s < 64; s++) {
            int p = b->squares[s];
            if (p != 0) {
                int ap = p > 0 ? p : -p;
                if (ap != PAWN && ap != KING) piece_count++;
            }
        }
        if (piece_count >= 3) {
            board_make_null_move(b);
            int R = depth >= 6 ? 3 : 2; /* adaptive reduction */
            int null_score = -negamax(b, depth - 1 - R, -beta, -beta + 1, ply + 1);
            board_unmake_null_move(b);
            if (null_score >= beta) return beta;
        }
    }

    /* Generate legal moves */
    Move moves[MAX_MOVES];
    int n = generate_legal(b, moves);

    /* Terminal: checkmate or stalemate */
    if (n == 0) {
        if (in_check) return -MATE_SCORE + ply; /* checkmate, prefer shorter mates */
        return 0; /* stalemate */
    }

    /* Check extension: if in check, search one ply deeper */
    if (in_check) depth++;

    /* Score and order moves */
    int scores[MAX_MOVES];
    score_moves(b, moves, scores, n, tt_move, ply);

    Move best_move = MOVE_NONE;
    int best_score = -INF_SCORE;
    uint8_t tt_flag = TT_ALPHA;
    int moves_searched = 0;

    for (int i = 0; i < n; i++) {
        pick_move(moves, scores, n, i);

        board_make_move(b, moves[i]);

        int score;

        /* Late Move Reductions (LMR) */
        if (moves_searched >= 4 && depth >= 3 &&
            !move_is_capture(moves[i]) && !(move_flags(moves[i]) & FLAG_PROMO) &&
            !in_check && !is_in_check(b, b->side ^ 1)) {
            /* Reduced search */
            int reduction = 1;
            if (moves_searched >= 8) reduction = 2;
            score = -negamax(b, depth - 1 - reduction, -alpha - 1, -alpha, ply + 1);
            /* Re-search if it looks promising */
            if (score > alpha) {
                score = -negamax(b, depth - 1, -beta, -alpha, ply + 1);
            }
        } else {
            /* PVS: first move full window, rest zero-window */
            if (moves_searched == 0) {
                score = -negamax(b, depth - 1, -beta, -alpha, ply + 1);
            } else {
                score = -negamax(b, depth - 1, -alpha - 1, -alpha, ply + 1);
                if (score > alpha && score < beta) {
                    score = -negamax(b, depth - 1, -beta, -alpha, ply + 1);
                }
            }
        }

        board_unmake_move(b);
        moves_searched++;

        if (score > best_score) {
            best_score = score;
            best_move = moves[i];
        }

        if (score > alpha) {
            alpha = score;
            tt_flag = TT_EXACT;
        }

        if (alpha >= beta) {
            tt_flag = TT_BETA;
            /* Update killer moves */
            if (!move_is_capture(moves[i])) {
                killers[ply][1] = killers[ply][0];
                killers[ply][0] = moves[i];
                /* Update history */
                history[b->side][move_from(moves[i])][move_to(moves[i])] += depth * depth;
            }
            break;
        }
    }

    /* Store in TT */
    tt_store(b->hash, depth, best_score, tt_flag, best_move);

    return best_score;
}

/* --- Public API --- */

Move search_best(Board *b, int max_depth, SearchResult *result) {
    search_init();
    tt_clear();

    Move best = MOVE_NONE;
    int best_score = 0;

    /* Iterative deepening */
    for (int depth = 1; depth <= max_depth; depth++) {
        node_count = 0;

        /* Aspiration window for depth >= 4 */
        int alpha = -INF_SCORE;
        int beta  =  INF_SCORE;
        if (depth >= 4) {
            alpha = best_score - 50;
            beta  = best_score + 50;
        }

        int score = negamax(b, depth, alpha, beta, 0);

        /* If aspiration window failed, re-search with full window */
        if (score <= alpha || score >= beta) {
            score = negamax(b, depth, -INF_SCORE, INF_SCORE, 0);
        }

        best_score = score;

        /* Get best move from TT */
        TTEntry *tt = tt_probe(b->hash);
        if (tt && tt->best_move != MOVE_NONE) {
            best = tt->best_move;
        }

        if (result) {
            result->best_move = best;
            result->score = best_score;
            result->depth = depth;
            result->nodes = node_count;
        }
    }

    return best;
}

int search_ranked(Board *b, int depth, RankedMove *ranked, int max_results) {
    search_init();
    tt_clear();

    /* First do iterative deepening to populate TT */
    for (int d = 1; d <= depth; d++) {
        negamax(b, d, -INF_SCORE, INF_SCORE, 0);
    }

    /* Now score every root move using TT-informed search */
    Move moves[MAX_MOVES];
    int n = generate_legal(b, moves);
    if (n == 0) return 0;

    /* Score each root move */
    typedef struct { Move m; int score; } ScoredMove;
    ScoredMove scored[MAX_MOVES];

    for (int i = 0; i < n; i++) {
        board_make_move(b, moves[i]);
        /* Search from opponent's perspective, negate */
        int score = -negamax(b, depth - 1, -INF_SCORE, INF_SCORE, 1);
        board_unmake_move(b);
        scored[i].m = moves[i];
        scored[i].score = score;
    }

    /* Sort by score (best first for current side) */
    /* Since negamax is from side-to-move perspective, higher = better */
    for (int i = 0; i < n - 1; i++) {
        for (int j = i + 1; j < n; j++) {
            if (scored[j].score > scored[i].score) {
                ScoredMove tmp = scored[i];
                scored[i] = scored[j];
                scored[j] = tmp;
            }
        }
    }

    /* Fill output */
    int count = n < max_results ? n : max_results;
    for (int i = 0; i < count; i++) {
        ranked[i].move = scored[i].m;
        /* Convert score from side-relative to absolute (positive = white advantage) */
        ranked[i].score = b->side == WHITE ? scored[i].score : -scored[i].score;
        move_to_notation(b, scored[i].m, ranked[i].notation, sizeof(ranked[i].notation));

        /* Get breakdown for position after this move */
        board_make_move(b, scored[i].m);
        ranked[i].breakdown = evaluate_breakdown(b);
        board_unmake_move(b);
    }

    return count;
}
