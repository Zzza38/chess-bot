#include "movegen.h"
#include "board.h"
#include <stdlib.h>

#define IN_BOUNDS(f, r) ((f) >= 0 && (f) < 8 && (r) >= 0 && (r) < 8)

static const int knight_dx[] = {-2, -2, -1, -1, 1, 1, 2, 2};
static const int knight_dy[] = {-1,  1, -2,  2,-2, 2,-1, 1};

static const int king_dx[] = {-1, -1, -1, 0, 0, 1, 1, 1};
static const int king_dy[] = {-1,  0,  1,-1, 1,-1, 0, 1};

/* Sliding directions: bishop = diagonals, rook = straights */
static const int bishop_dx[] = {1, 1, -1, -1};
static const int bishop_dy[] = {1, -1, 1, -1};

static const int rook_dx[] = {1, -1, 0, 0};
static const int rook_dy[] = {0, 0, 1, -1};

/* Add a pawn move, handling promotions. Returns number of moves added. */
static int add_pawn_move(Move *list, int n, int from, int to, int captured, int color, int flags) {
    int promo_rank = color == WHITE ? 7 : 0;
    if (sq_rank(to) == promo_rank) {
        /* Promotion: generate all 4 */
        list[n++] = encode_move(from, to, captured, QUEEN,  flags | FLAG_PROMO);
        list[n++] = encode_move(from, to, captured, ROOK,   flags | FLAG_PROMO);
        list[n++] = encode_move(from, to, captured, BISHOP, flags | FLAG_PROMO);
        list[n++] = encode_move(from, to, captured, KNIGHT, flags | FLAG_PROMO);
    } else {
        list[n++] = encode_move(from, to, captured, 0, flags);
    }
    return n;
}

static int add_pawn_capture(Move *list, int n, int from, int to, int captured, int color) {
    int promo_rank = color == WHITE ? 7 : 0;
    if (sq_rank(to) == promo_rank) {
        list[n++] = encode_move(from, to, captured, QUEEN,  FLAG_PROMO);
        list[n++] = encode_move(from, to, captured, ROOK,   FLAG_PROMO);
        list[n++] = encode_move(from, to, captured, BISHOP, FLAG_PROMO);
        list[n++] = encode_move(from, to, captured, KNIGHT, FLAG_PROMO);
    } else {
        list[n++] = encode_move(from, to, captured, 0, 0);
    }
    return n;
}

int generate_pseudo_legal(Board *b, Move *list) {
    int n = 0;
    int side = b->side;
    int sign = side == WHITE ? 1 : -1; /* positive for our pieces */
    int enemy_sign = -sign;
    int pawn_dir = side == WHITE ? 1 : -1;
    int start_rank = side == WHITE ? 1 : 6;

    for (int s = 0; s < 64; s++) {
        int piece = b->squares[s];
        if (piece == 0) continue;
        /* Check if this piece belongs to current side */
        if ((piece > 0 && side != WHITE) || (piece < 0 && side != BLACK)) continue;

        int abs_piece = piece > 0 ? piece : -piece;
        int file = sq_file(s);
        int rank = sq_rank(s);

        switch (abs_piece) {
            case PAWN: {
                /* Single push */
                int to_rank = rank + pawn_dir;
                if (IN_BOUNDS(file, to_rank)) {
                    int to = sq(file, to_rank);
                    if (b->squares[to] == 0) {
                        n = add_pawn_move(list, n, s, to, 0, side, 0);
                        /* Double push */
                        if (rank == start_rank) {
                            int to2 = sq(file, rank + pawn_dir * 2);
                            if (b->squares[to2] == 0) {
                                list[n++] = encode_move(s, to2, 0, 0, FLAG_DOUBLE);
                            }
                        }
                    }
                }
                /* Diagonal captures */
                for (int dx = -1; dx <= 1; dx += 2) {
                    int cf = file + dx;
                    int cr = rank + pawn_dir;
                    if (!IN_BOUNDS(cf, cr)) continue;
                    int to = sq(cf, cr);
                    int target = b->squares[to];
                    if (target != 0 && ((target > 0 ? 1 : -1) == enemy_sign ? 1 : (target > 0 && side == BLACK) || (target < 0 && side == WHITE))) {
                        /* It's an enemy piece */
                        int is_enemy = (target > 0 && side == BLACK) || (target < 0 && side == WHITE);
                        if (is_enemy) {
                            int cap_type = target > 0 ? target : -target;
                            n = add_pawn_capture(list, n, s, to, cap_type, side);
                        }
                    }
                    /* En passant */
                    if (b->ep_square >= 0 && to == b->ep_square) {
                        list[n++] = encode_move(s, to, PAWN, 0, FLAG_EP);
                    }
                }
                break;
            }

            case KNIGHT: {
                for (int i = 0; i < 8; i++) {
                    int tf = file + knight_dx[i];
                    int tr = rank + knight_dy[i];
                    if (!IN_BOUNDS(tf, tr)) continue;
                    int to = sq(tf, tr);
                    int target = b->squares[to];
                    if (target == 0) {
                        list[n++] = encode_move(s, to, 0, 0, 0);
                    } else {
                        int is_enemy = (target > 0 && side == BLACK) || (target < 0 && side == WHITE);
                        if (is_enemy) {
                            int cap_type = target > 0 ? target : -target;
                            list[n++] = encode_move(s, to, cap_type, 0, 0);
                        }
                    }
                }
                break;
            }

            case BISHOP: {
                for (int d = 0; d < 4; d++) {
                    int cf = file + bishop_dx[d];
                    int cr = rank + bishop_dy[d];
                    while (IN_BOUNDS(cf, cr)) {
                        int to = sq(cf, cr);
                        int target = b->squares[to];
                        if (target == 0) {
                            list[n++] = encode_move(s, to, 0, 0, 0);
                        } else {
                            int is_enemy = (target > 0 && side == BLACK) || (target < 0 && side == WHITE);
                            if (is_enemy) {
                                int cap_type = target > 0 ? target : -target;
                                list[n++] = encode_move(s, to, cap_type, 0, 0);
                            }
                            break; /* blocked */
                        }
                        cf += bishop_dx[d];
                        cr += bishop_dy[d];
                    }
                }
                break;
            }

            case ROOK: {
                for (int d = 0; d < 4; d++) {
                    int cf = file + rook_dx[d];
                    int cr = rank + rook_dy[d];
                    while (IN_BOUNDS(cf, cr)) {
                        int to = sq(cf, cr);
                        int target = b->squares[to];
                        if (target == 0) {
                            list[n++] = encode_move(s, to, 0, 0, 0);
                        } else {
                            int is_enemy = (target > 0 && side == BLACK) || (target < 0 && side == WHITE);
                            if (is_enemy) {
                                int cap_type = target > 0 ? target : -target;
                                list[n++] = encode_move(s, to, cap_type, 0, 0);
                            }
                            break;
                        }
                        cf += rook_dx[d];
                        cr += rook_dy[d];
                    }
                }
                break;
            }

            case QUEEN: {
                /* Queen = bishop + rook directions */
                for (int d = 0; d < 4; d++) {
                    int cf = file + bishop_dx[d];
                    int cr = rank + bishop_dy[d];
                    while (IN_BOUNDS(cf, cr)) {
                        int to = sq(cf, cr);
                        int target = b->squares[to];
                        if (target == 0) {
                            list[n++] = encode_move(s, to, 0, 0, 0);
                        } else {
                            int is_enemy = (target > 0 && side == BLACK) || (target < 0 && side == WHITE);
                            if (is_enemy) {
                                int cap_type = target > 0 ? target : -target;
                                list[n++] = encode_move(s, to, cap_type, 0, 0);
                            }
                            break;
                        }
                        cf += bishop_dx[d];
                        cr += bishop_dy[d];
                    }
                }
                for (int d = 0; d < 4; d++) {
                    int cf = file + rook_dx[d];
                    int cr = rank + rook_dy[d];
                    while (IN_BOUNDS(cf, cr)) {
                        int to = sq(cf, cr);
                        int target = b->squares[to];
                        if (target == 0) {
                            list[n++] = encode_move(s, to, 0, 0, 0);
                        } else {
                            int is_enemy = (target > 0 && side == BLACK) || (target < 0 && side == WHITE);
                            if (is_enemy) {
                                int cap_type = target > 0 ? target : -target;
                                list[n++] = encode_move(s, to, cap_type, 0, 0);
                            }
                            break;
                        }
                        cf += rook_dx[d];
                        cr += rook_dy[d];
                    }
                }
                break;
            }

            case KING: {
                for (int i = 0; i < 8; i++) {
                    int tf = file + king_dx[i];
                    int tr = rank + king_dy[i];
                    if (!IN_BOUNDS(tf, tr)) continue;
                    int to = sq(tf, tr);
                    int target = b->squares[to];
                    if (target == 0) {
                        list[n++] = encode_move(s, to, 0, 0, 0);
                    } else {
                        int is_enemy = (target > 0 && side == BLACK) || (target < 0 && side == WHITE);
                        if (is_enemy) {
                            int cap_type = target > 0 ? target : -target;
                            list[n++] = encode_move(s, to, cap_type, 0, 0);
                        }
                    }
                }

                /* Castling */
                int crank = side == WHITE ? 0 : 7;
                if (rank == crank && file == 4) {
                    int enemy = side == WHITE ? BLACK : WHITE;
                    /* Kingside */
                    uint8_t ks_flag = side == WHITE ? CASTLE_WK : CASTLE_BK;
                    if ((b->castle_rights & ks_flag) &&
                        b->squares[sq(5, crank)] == 0 &&
                        b->squares[sq(6, crank)] == 0 &&
                        !is_attacked(b, sq(4, crank), enemy) &&
                        !is_attacked(b, sq(5, crank), enemy) &&
                        !is_attacked(b, sq(6, crank), enemy)) {
                        /* Verify rook is present */
                        int rook_val = side == WHITE ? ROOK : -ROOK;
                        if (b->squares[sq(7, crank)] == rook_val) {
                            list[n++] = encode_move(s, sq(6, crank), 0, 0, FLAG_CASTLE);
                        }
                    }
                    /* Queenside */
                    uint8_t qs_flag = side == WHITE ? CASTLE_WQ : CASTLE_BQ;
                    if ((b->castle_rights & qs_flag) &&
                        b->squares[sq(1, crank)] == 0 &&
                        b->squares[sq(2, crank)] == 0 &&
                        b->squares[sq(3, crank)] == 0 &&
                        !is_attacked(b, sq(4, crank), enemy) &&
                        !is_attacked(b, sq(3, crank), enemy) &&
                        !is_attacked(b, sq(2, crank), enemy)) {
                        int rook_val = side == WHITE ? ROOK : -ROOK;
                        if (b->squares[sq(0, crank)] == rook_val) {
                            list[n++] = encode_move(s, sq(2, crank), 0, 0, FLAG_CASTLE);
                        }
                    }
                }
                break;
            }
        }
    }
    return n;
}

int generate_captures(Board *b, Move *list) {
    /* Generate only captures + promotions (for quiescence) */
    Move all[MAX_MOVES];
    int total = generate_pseudo_legal(b, all);
    int n = 0;
    for (int i = 0; i < total; i++) {
        if (move_is_capture(all[i]) || (move_flags(all[i]) & FLAG_PROMO)) {
            list[n++] = all[i];
        }
    }
    return n;
}

int is_attacked(const Board *b, int square, int by_color) {
    int f = sq_file(square);
    int r = sq_rank(square);
    int att_sign = by_color == WHITE ? 1 : -1;

    /* Pawn attacks */
    int pawn_dir = by_color == WHITE ? 1 : -1; /* pawns advance in this direction */
    /* A pawn on rank r-pawn_dir can attack rank r */
    int pr = r - pawn_dir;
    if (pr >= 0 && pr < 8) {
        if (f > 0 && b->squares[sq(f-1, pr)] == att_sign * PAWN) return 1;
        if (f < 7 && b->squares[sq(f+1, pr)] == att_sign * PAWN) return 1;
    }

    /* Knight attacks */
    for (int i = 0; i < 8; i++) {
        int nf = f + knight_dx[i];
        int nr = r + knight_dy[i];
        if (IN_BOUNDS(nf, nr) && b->squares[sq(nf, nr)] == att_sign * KNIGHT) return 1;
    }

    /* King attacks */
    for (int i = 0; i < 8; i++) {
        int kf = f + king_dx[i];
        int kr = r + king_dy[i];
        if (IN_BOUNDS(kf, kr) && b->squares[sq(kf, kr)] == att_sign * KING) return 1;
    }

    /* Sliding: rook/queen on straights */
    for (int d = 0; d < 4; d++) {
        int cf = f + rook_dx[d];
        int cr = r + rook_dy[d];
        while (IN_BOUNDS(cf, cr)) {
            int p = b->squares[sq(cf, cr)];
            if (p != 0) {
                if (p == att_sign * ROOK || p == att_sign * QUEEN) return 1;
                break;
            }
            cf += rook_dx[d];
            cr += rook_dy[d];
        }
    }

    /* Sliding: bishop/queen on diagonals */
    for (int d = 0; d < 4; d++) {
        int cf = f + bishop_dx[d];
        int cr = r + bishop_dy[d];
        while (IN_BOUNDS(cf, cr)) {
            int p = b->squares[sq(cf, cr)];
            if (p != 0) {
                if (p == att_sign * BISHOP || p == att_sign * QUEEN) return 1;
                break;
            }
            cf += bishop_dx[d];
            cr += bishop_dy[d];
        }
    }

    return 0;
}

int is_in_check(const Board *b, int color) {
    int king_s = b->king_sq[color];
    if (king_s < 0) return 0;
    int enemy = color == WHITE ? BLACK : WHITE;
    return is_attacked(b, king_s, enemy);
}

int generate_legal(Board *b, Move *list) {
    Move pseudo[MAX_MOVES];
    int total = generate_pseudo_legal(b, pseudo);
    int n = 0;
    int side = b->side;

    for (int i = 0; i < total; i++) {
        board_make_move(b, pseudo[i]);
        if (!is_in_check(b, side)) {
            list[n++] = pseudo[i];
        }
        board_unmake_move(b);
    }
    return n;
}
