#include "eval.h"
#include "movegen.h"
#include <stddef.h>

/* Material values (centipawns) */
static const int material_val[] = {0, 100, 320, 330, 500, 900, 20000};

/* Piece-Square Tables — from white's perspective, index 0 = a1 */
/* For black: mirror vertically (index = (7-rank)*8 + file) */

static const int16_t pst_pawn[64] = {
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10,-20,-20, 10, 10,  5,
     5, -5,-10,  0,  0,-10, -5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5,  5, 10, 25, 25, 10,  5,  5,
    10, 10, 20, 30, 30, 20, 10, 10,
    50, 50, 50, 50, 50, 50, 50, 50,
     0,  0,  0,  0,  0,  0,  0,  0,
};

static const int16_t pst_knight[64] = {
   -50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50,
};

static const int16_t pst_bishop[64] = {
   -20,-10,-10,-10,-10,-10,-10,-20,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  0,  5, 10, 10,  5,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -20,-10,-10,-10,-10,-10,-10,-20,
};

static const int16_t pst_rook[64] = {
     0,  0,  0,  5,  5,  0,  0,  0,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     5, 10, 10, 10, 10, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
};

static const int16_t pst_queen[64] = {
   -20,-10,-10, -5, -5,-10,-10,-20,
   -10,  0,  5,  0,  0,  0,  0,-10,
   -10,  5,  5,  5,  5,  5,  0,-10,
     0,  0,  5,  5,  5,  5,  0, -5,
    -5,  0,  5,  5,  5,  5,  0, -5,
   -10,  0,  5,  5,  5,  5,  0,-10,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -20,-10,-10, -5, -5,-10,-10,-20,
};

static const int16_t pst_king[64] = {
    20, 30, 10,  0,  0, 10, 30, 20,
    20, 20,  0,  0,  0,  0, 20, 20,
   -10,-20,-20,-20,-20,-20,-20,-10,
   -20,-30,-30,-40,-40,-30,-30,-20,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
};

static const int16_t *pst_tables[] = {
    NULL,        /* EMPTY */
    pst_pawn,
    pst_knight,
    pst_bishop,
    pst_rook,
    pst_queen,
    pst_king,
};

static inline int get_pst(int piece_type, int color, int square) {
    if (piece_type < 1 || piece_type > 6) return 0;
    const int16_t *table = pst_tables[piece_type];
    /* White reads directly (rank 0 = index 0..7), black mirrors */
    int idx = color == WHITE ? square : ((7 - sq_rank(square)) * 8 + sq_file(square));
    return table[idx];
}

/* Internal: compute all eval terms into an EvalBreakdown struct */
static EvalBreakdown eval_internal(Board *b) {
    EvalBreakdown ev = {0};

    int white_bishops = 0, black_bishops = 0;
    int white_king_sq = -1, black_king_sq = -1;

    /* Single pass: material + PST + bishop count + king positions + rook on 7th */
    for (int s = 0; s < 64; s++) {
        int piece = b->squares[s];
        if (piece == 0) continue;

        int abs_p = piece > 0 ? piece : -piece;
        int color = piece > 0 ? WHITE : BLACK;
        int sign = piece > 0 ? 1 : -1;

        /* Material */
        ev.material += (int16_t)(sign * material_val[abs_p]);

        /* PST */
        ev.pst += (int16_t)(sign * get_pst(abs_p, color, s));

        /* Bishop count */
        if (abs_p == BISHOP) {
            if (color == WHITE) white_bishops++;
            else black_bishops++;
        }

        /* King position */
        if (abs_p == KING) {
            if (color == WHITE) white_king_sq = s;
            else black_king_sq = s;
        }

        /* Rook on 7th rank */
        if (abs_p == ROOK) {
            if (color == WHITE && sq_rank(s) == 6) ev.rook_seventh += 40;
            if (color == BLACK && sq_rank(s) == 1) ev.rook_seventh -= 40;
        }
    }

    /* Bishop pair */
    if (white_bishops >= 2) ev.bishop_pair += 50;
    if (black_bishops >= 2) ev.bishop_pair -= 50;

    /* Castling bonus */
    if (b->did_castle[WHITE]) ev.castling += 60;
    if (b->did_castle[BLACK]) ev.castling -= 60;

    /* File-based evaluation */
    int white_pawns_file[8] = {0};
    int black_pawns_file[8] = {0};
    int white_rooks_file[8] = {0};
    int black_rooks_file[8] = {0};

    for (int s = 0; s < 64; s++) {
        int piece = b->squares[s];
        if (piece == 0) continue;
        int f = sq_file(s);
        int abs_p = piece > 0 ? piece : -piece;
        int color = piece > 0 ? WHITE : BLACK;

        if (abs_p == PAWN) {
            if (color == WHITE) white_pawns_file[f]++;
            else black_pawns_file[f]++;
        }
        if (abs_p == ROOK) {
            if (color == WHITE) white_rooks_file[f]++;
            else black_rooks_file[f]++;
        }
    }

    for (int f = 0; f < 8; f++) {
        /* Doubled pawns penalty */
        if (white_pawns_file[f] > 1)
            ev.doubled_pawns -= (int16_t)(20 * (white_pawns_file[f] - 1));
        if (black_pawns_file[f] > 1)
            ev.doubled_pawns += (int16_t)(20 * (black_pawns_file[f] - 1));

        /* Isolated pawn penalty */
        if (white_pawns_file[f] > 0) {
            int has_neighbor = (f > 0 && white_pawns_file[f-1] > 0) ||
                               (f < 7 && white_pawns_file[f+1] > 0);
            if (!has_neighbor)
                ev.isolated_pawns -= (int16_t)(15 * white_pawns_file[f]);
        }
        if (black_pawns_file[f] > 0) {
            int has_neighbor = (f > 0 && black_pawns_file[f-1] > 0) ||
                               (f < 7 && black_pawns_file[f+1] > 0);
            if (!has_neighbor)
                ev.isolated_pawns += (int16_t)(15 * black_pawns_file[f]);
        }

        /* Passed pawn bonus */
        if (white_pawns_file[f] > 0 && black_pawns_file[f] == 0) {
            for (int r = 7; r >= 0; r--) {
                int p = b->squares[sq(f, r)];
                if (p == PAWN) { /* white pawn */
                    int passed = 1;
                    for (int ry = r + 1; ry < 8; ry++) {
                        if (f > 0 && b->squares[sq(f-1, ry)] == -PAWN) { passed = 0; break; }
                        if (f < 7 && b->squares[sq(f+1, ry)] == -PAWN) { passed = 0; break; }
                    }
                    if (passed)
                        ev.passed_pawns += (int16_t)(30 + (r > 3 ? (r - 3) * 15 : 0));
                    break;
                }
            }
        }
        if (black_pawns_file[f] > 0 && white_pawns_file[f] == 0) {
            for (int r = 0; r < 8; r++) {
                int p = b->squares[sq(f, r)];
                if (p == -PAWN) { /* black pawn */
                    int passed = 1;
                    for (int ry = r - 1; ry >= 0; ry--) {
                        if (f > 0 && b->squares[sq(f-1, ry)] == PAWN) { passed = 0; break; }
                        if (f < 7 && b->squares[sq(f+1, ry)] == PAWN) { passed = 0; break; }
                    }
                    if (passed)
                        ev.passed_pawns -= (int16_t)(30 + (r < 4 ? (4 - r) * 15 : 0));
                    break;
                }
            }
        }

        /* Rook on open file */
        if (white_rooks_file[f] > 0 && white_pawns_file[f] == 0 && black_pawns_file[f] == 0)
            ev.rook_open_file += 25;
        if (black_rooks_file[f] > 0 && white_pawns_file[f] == 0 && black_pawns_file[f] == 0)
            ev.rook_open_file -= 25;

        /* Rook on semi-open file */
        if (white_rooks_file[f] > 0 && white_pawns_file[f] == 0 && black_pawns_file[f] > 0)
            ev.rook_semi_open_file += 15;
        if (black_rooks_file[f] > 0 && black_pawns_file[f] == 0 && white_pawns_file[f] > 0)
            ev.rook_semi_open_file -= 15;
    }

    /* King safety: pawn shield */
    if (white_king_sq >= 0) {
        int kf = sq_file(white_king_sq);
        int kr = sq_rank(white_king_sq);
        int shield = 0;
        for (int dx = -1; dx <= 1; dx++) {
            for (int dy = 1; dy <= 2; dy++) {
                int nf = kf + dx;
                int nr = kr + dy;
                if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
                    if (b->squares[sq(nf, nr)] == PAWN) shield++;
                }
            }
        }
        ev.king_safety += (int16_t)(shield * 10);
    }
    if (black_king_sq >= 0) {
        int kf = sq_file(black_king_sq);
        int kr = sq_rank(black_king_sq);
        int shield = 0;
        for (int dx = -1; dx <= 1; dx++) {
            for (int dy = 1; dy <= 2; dy++) {
                int nf = kf + dx;
                int nr = kr - dy;
                if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
                    if (b->squares[sq(nf, nr)] == -PAWN) shield++;
                }
            }
        }
        ev.king_safety -= (int16_t)(shield * 10);
    }

    /* Check penalty */
    if (is_in_check(b, b->side)) {
        ev.check_penalty += (int16_t)(b->side == WHITE ? -100 : 100);
    }

    /* Total */
    ev.total = ev.material + ev.pst + ev.bishop_pair + ev.castling + ev.rook_seventh
             + ev.doubled_pawns + ev.isolated_pawns + ev.passed_pawns
             + ev.rook_open_file + ev.rook_semi_open_file + ev.king_safety + ev.check_penalty;

    return ev;
}

int evaluate(Board *b) {
    EvalBreakdown ev = eval_internal(b);
    return ev.total;
}

EvalBreakdown evaluate_breakdown(Board *b) {
    return eval_internal(b);
}
