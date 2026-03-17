#include "board.h"
#include "tt.h"
#include "movegen.h"
#include <string.h>
#include <stdio.h>
#include <ctype.h>

void board_init(Board *b) {
    memset(b, 0, sizeof(Board));
    for (int i = 0; i < 64; i++) b->squares[i] = 0;
    b->side = WHITE;
    b->castle_rights = CASTLE_WK | CASTLE_WQ | CASTLE_BK | CASTLE_BQ;
    b->ep_square = -1;
    b->did_castle[0] = 0;
    b->did_castle[1] = 0;
    b->ply = 0;
    b->king_sq[WHITE] = -1;
    b->king_sq[BLACK] = -1;
}

void board_set_fen(Board *b, const char *fen) {
    board_init(b);

    int rank = 7, file = 0;
    const char *p = fen;

    /* 1. Piece placement */
    while (*p && *p != ' ') {
        if (*p == '/') {
            rank--;
            file = 0;
        } else if (*p >= '1' && *p <= '8') {
            file += (*p - '0');
        } else {
            int piece = 0;
            int color_sign = 1; /* positive for white */
            if (islower((unsigned char)*p)) color_sign = -1;
            switch (tolower((unsigned char)*p)) {
                case 'p': piece = PAWN;   break;
                case 'n': piece = KNIGHT; break;
                case 'b': piece = BISHOP; break;
                case 'r': piece = ROOK;   break;
                case 'q': piece = QUEEN;  break;
                case 'k': piece = KING;   break;
                default: break;
            }
            int s = sq(file, rank);
            b->squares[s] = (int8_t)(color_sign * piece);
            if (piece == KING) {
                b->king_sq[color_sign > 0 ? WHITE : BLACK] = (int8_t)s;
            }
            file++;
        }
        p++;
    }

    /* 2. Active color */
    if (*p == ' ') p++;
    b->side = (*p == 'b') ? BLACK : WHITE;
    p++;

    /* 3. Castling availability */
    if (*p == ' ') p++;
    b->castle_rights = 0;
    while (*p && *p != ' ') {
        switch (*p) {
            case 'K': b->castle_rights |= CASTLE_WK; break;
            case 'Q': b->castle_rights |= CASTLE_WQ; break;
            case 'k': b->castle_rights |= CASTLE_BK; break;
            case 'q': b->castle_rights |= CASTLE_BQ; break;
            default: break;
        }
        p++;
    }

    /* 4. En passant */
    if (*p == ' ') p++;
    if (*p == '-') {
        b->ep_square = -1;
        p++;
    } else if (*p >= 'a' && *p <= 'h') {
        int ep_file = *p - 'a'; p++;
        int ep_rank = *p - '1'; p++;
        b->ep_square = (int8_t)sq(ep_file, ep_rank);
    }

    /* Compute Zobrist hash */
    b->hash = zobrist_hash(b);
}

int board_get_fen(const Board *b, char *buf, int buflen) {
    char *p = buf;
    char *end = buf + buflen - 1;

    /* 1. Piece placement */
    for (int rank = 7; rank >= 0; rank--) {
        int empty_count = 0;
        for (int file = 0; file < 8; file++) {
            int piece = b->squares[sq(file, rank)];
            if (piece == 0) {
                empty_count++;
            } else {
                if (empty_count > 0 && p < end) {
                    *p++ = '0' + empty_count;
                    empty_count = 0;
                }
                if (p < end) *p++ = piece_char(piece);
            }
        }
        if (empty_count > 0 && p < end) *p++ = '0' + empty_count;
        if (rank > 0 && p < end) *p++ = '/';
    }

    /* 2. Active color */
    if (p < end) *p++ = ' ';
    if (p < end) *p++ = b->side == WHITE ? 'w' : 'b';

    /* 3. Castling */
    if (p < end) *p++ = ' ';
    if (b->castle_rights == 0) {
        if (p < end) *p++ = '-';
    } else {
        if ((b->castle_rights & CASTLE_WK) && p < end) *p++ = 'K';
        if ((b->castle_rights & CASTLE_WQ) && p < end) *p++ = 'Q';
        if ((b->castle_rights & CASTLE_BK) && p < end) *p++ = 'k';
        if ((b->castle_rights & CASTLE_BQ) && p < end) *p++ = 'q';
    }

    /* 4. En passant */
    if (p < end) *p++ = ' ';
    if (b->ep_square < 0) {
        if (p < end) *p++ = '-';
    } else {
        if (p < end) *p++ = 'a' + sq_file(b->ep_square);
        if (p < end) *p++ = '1' + sq_rank(b->ep_square);
    }

    /* 5. Halfmove clock and fullmove (defaults) */
    if (p + 4 < end) {
        *p++ = ' '; *p++ = '0';
        *p++ = ' '; *p++ = '1';
    }

    *p = '\0';
    return (int)(p - buf);
}

void board_make_move(Board *b, Move m) {
    int from = move_from(m);
    int to   = move_to(m);
    int flags = move_flags(m);
    int piece = b->squares[from];
    int abs_piece = piece > 0 ? piece : -piece;
    int color = piece > 0 ? WHITE : BLACK;

    /* Save undo info */
    b->move_stack[b->ply] = m;
    b->castle_stack[b->ply] = b->castle_rights;
    b->ep_stack[b->ply] = b->ep_square;
    b->captured_stack[b->ply] = (int8_t)b->squares[to];
    b->hash_stack[b->ply] = b->hash;
    b->did_castle_stack[b->ply * 2]     = b->did_castle[WHITE];
    b->did_castle_stack[b->ply * 2 + 1] = b->did_castle[BLACK];

    /* Update hash: remove piece from 'from' */
    b->hash ^= zobrist_piece_key(piece, from);

    /* Handle capture: remove captured piece from hash */
    if (move_captured(m)) {
        int cap_sq = to;
        /* En passant: captured pawn is on a different square */
        if (flags & FLAG_EP) {
            cap_sq = sq(sq_file(to), sq_rank(from));
            b->squares[cap_sq] = 0;
            b->hash ^= zobrist_piece_key(color == WHITE ? -PAWN : PAWN, cap_sq);
        } else {
            b->hash ^= zobrist_piece_key(b->squares[to], to);
        }
    }

    /* Move piece */
    b->squares[to] = piece;
    b->squares[from] = 0;
    b->hash ^= zobrist_piece_key(piece, to);

    /* Promotion */
    if (flags & FLAG_PROMO) {
        int promo_piece = move_promo(m);
        int signed_promo = color == WHITE ? promo_piece : -promo_piece;
        b->hash ^= zobrist_piece_key(piece, to);      /* remove pawn */
        b->squares[to] = (int8_t)signed_promo;
        b->hash ^= zobrist_piece_key(signed_promo, to); /* add promoted piece */
    }

    /* Castling move */
    if (flags & FLAG_CASTLE) {
        int rank_base = color == WHITE ? 0 : 56;
        if (to == rank_base + 6) {
            /* Kingside: move rook from h to f */
            int rook = b->squares[rank_base + 7];
            b->hash ^= zobrist_piece_key(rook, rank_base + 7);
            b->squares[rank_base + 5] = rook;
            b->squares[rank_base + 7] = 0;
            b->hash ^= zobrist_piece_key(rook, rank_base + 5);
        } else if (to == rank_base + 2) {
            /* Queenside: move rook from a to d */
            int rook = b->squares[rank_base];
            b->hash ^= zobrist_piece_key(rook, rank_base);
            b->squares[rank_base + 3] = rook;
            b->squares[rank_base] = 0;
            b->hash ^= zobrist_piece_key(rook, rank_base + 3);
        }
        b->did_castle[color] = 1;
    }

    /* Update en passant square */
    b->hash ^= zobrist_ep_key(b->ep_square);
    if (flags & FLAG_DOUBLE) {
        /* Double pawn push: set ep square */
        b->ep_square = (int8_t)sq(sq_file(from), (sq_rank(from) + sq_rank(to)) / 2);
    } else {
        b->ep_square = -1;
    }
    b->hash ^= zobrist_ep_key(b->ep_square);

    /* Update castling rights */
    b->hash ^= zobrist_castle_key(b->castle_rights);
    if (abs_piece == KING) {
        if (color == WHITE) b->castle_rights &= ~(CASTLE_WK | CASTLE_WQ);
        else                b->castle_rights &= ~(CASTLE_BK | CASTLE_BQ);
    }
    if (abs_piece == ROOK) {
        if (from == sq(0, 0)) b->castle_rights &= ~CASTLE_WQ;
        if (from == sq(7, 0)) b->castle_rights &= ~CASTLE_WK;
        if (from == sq(0, 7)) b->castle_rights &= ~CASTLE_BQ;
        if (from == sq(7, 7)) b->castle_rights &= ~CASTLE_BK;
    }
    /* If rook captured on its home square */
    if (to == sq(0, 0)) b->castle_rights &= ~CASTLE_WQ;
    if (to == sq(7, 0)) b->castle_rights &= ~CASTLE_WK;
    if (to == sq(0, 7)) b->castle_rights &= ~CASTLE_BQ;
    if (to == sq(7, 7)) b->castle_rights &= ~CASTLE_BK;
    b->hash ^= zobrist_castle_key(b->castle_rights);

    /* Update king position */
    if (abs_piece == KING) {
        b->king_sq[color] = (int8_t)to;
    }

    /* Switch side */
    b->hash ^= zobrist_side_key();
    b->side ^= 1;

    b->ply++;
}

void board_unmake_move(Board *b) {
    b->ply--;

    Move m = b->move_stack[b->ply];
    int from = move_from(m);
    int to   = move_to(m);
    int flags = move_flags(m);

    /* Switch side back */
    b->side ^= 1;
    int color = b->side; /* now current side (the one who made the move) */

    /* Restore saved state */
    b->castle_rights = b->castle_stack[b->ply];
    b->ep_square = b->ep_stack[b->ply];
    b->hash = b->hash_stack[b->ply];
    b->did_castle[WHITE] = b->did_castle_stack[b->ply * 2];
    b->did_castle[BLACK] = b->did_castle_stack[b->ply * 2 + 1];

    int piece = b->squares[to];

    /* Undo promotion */
    if (flags & FLAG_PROMO) {
        piece = color == WHITE ? PAWN : -PAWN;
    }

    /* Move piece back */
    b->squares[from] = (int8_t)piece;
    b->squares[to] = 0;

    /* Restore captured piece */
    int captured = b->captured_stack[b->ply];
    if (flags & FLAG_EP) {
        /* En passant: restore captured pawn to its square */
        int cap_sq = sq(sq_file(to), sq_rank(from));
        b->squares[cap_sq] = (int8_t)(color == WHITE ? -PAWN : PAWN);
    } else if (captured) {
        b->squares[to] = (int8_t)captured;
    }

    /* Undo castling rook move */
    if (flags & FLAG_CASTLE) {
        int rank_base = color == WHITE ? 0 : 56;
        if (to == rank_base + 6) {
            /* Kingside: move rook back from f to h */
            b->squares[rank_base + 7] = b->squares[rank_base + 5];
            b->squares[rank_base + 5] = 0;
        } else if (to == rank_base + 2) {
            /* Queenside: move rook back from d to a */
            b->squares[rank_base] = b->squares[rank_base + 3];
            b->squares[rank_base + 3] = 0;
        }
    }

    /* Update king position */
    int abs_piece = piece > 0 ? piece : -piece;
    if (abs_piece == KING) {
        b->king_sq[color] = (int8_t)from;
    }
}

void board_make_null_move(Board *b) {
    /* Save state */
    b->move_stack[b->ply] = MOVE_NONE;
    b->castle_stack[b->ply] = b->castle_rights;
    b->ep_stack[b->ply] = b->ep_square;
    b->captured_stack[b->ply] = 0;
    b->hash_stack[b->ply] = b->hash;
    b->did_castle_stack[b->ply * 2]     = b->did_castle[WHITE];
    b->did_castle_stack[b->ply * 2 + 1] = b->did_castle[BLACK];

    /* Clear ep */
    b->hash ^= zobrist_ep_key(b->ep_square);
    b->ep_square = -1;
    b->hash ^= zobrist_ep_key(b->ep_square);

    /* Switch side */
    b->hash ^= zobrist_side_key();
    b->side ^= 1;

    b->ply++;
}

void board_unmake_null_move(Board *b) {
    b->ply--;
    b->side ^= 1;
    b->castle_rights = b->castle_stack[b->ply];
    b->ep_square = b->ep_stack[b->ply];
    b->hash = b->hash_stack[b->ply];
    b->did_castle[WHITE] = b->did_castle_stack[b->ply * 2];
    b->did_castle[BLACK] = b->did_castle_stack[b->ply * 2 + 1];
}

/* --- Notation --- */

static const char *piece_letters = ".PNBRQK";

/* Check if another piece of the same type can reach 'to' from a different square */
static int needs_disambiguation(const Board *b, int abs_piece, int from, int to, int color) {
    /* Generate all pseudo-legal moves and see if another same piece type can reach 'to' */
    for (int s = 0; s < 64; s++) {
        if (s == from) continue;
        int p = b->squares[s];
        int abs_p = p > 0 ? p : -p;
        int c = p > 0 ? WHITE : BLACK;
        if (abs_p != abs_piece || c != color) continue;

        /* Check if this piece can reach 'to' (pseudo-legal) */
        int dx = sq_file(to) - sq_file(s);
        int dy = sq_rank(to) - sq_rank(s);
        int adx = dx > 0 ? dx : -dx;
        int ady = dy > 0 ? dy : -dy;
        int can_reach = 0;

        switch (abs_piece) {
            case KNIGHT:
                can_reach = (adx == 2 && ady == 1) || (adx == 1 && ady == 2);
                break;
            case BISHOP:
                if (adx == ady && adx > 0) {
                    can_reach = 1;
                    int sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
                    int cx = sq_file(s) + sx, cy = sq_rank(s) + sy;
                    while (cx != sq_file(to) || cy != sq_rank(to)) {
                        if (b->squares[sq(cx, cy)] != 0) { can_reach = 0; break; }
                        cx += sx; cy += sy;
                    }
                }
                break;
            case ROOK:
                if ((dx == 0 || dy == 0) && (adx + ady) > 0) {
                    can_reach = 1;
                    int sx = dx == 0 ? 0 : (dx > 0 ? 1 : -1);
                    int sy = dy == 0 ? 0 : (dy > 0 ? 1 : -1);
                    int cx = sq_file(s) + sx, cy = sq_rank(s) + sy;
                    while (cx != sq_file(to) || cy != sq_rank(to)) {
                        if (b->squares[sq(cx, cy)] != 0) { can_reach = 0; break; }
                        cx += sx; cy += sy;
                    }
                }
                break;
            case QUEEN:
                if ((dx == 0 || dy == 0 || adx == ady) && (adx + ady) > 0) {
                    can_reach = 1;
                    int sx = dx == 0 ? 0 : (dx > 0 ? 1 : -1);
                    int sy = dy == 0 ? 0 : (dy > 0 ? 1 : -1);
                    int cx = sq_file(s) + sx, cy = sq_rank(s) + sy;
                    while (cx != sq_file(to) || cy != sq_rank(to)) {
                        if (b->squares[sq(cx, cy)] != 0) { can_reach = 0; break; }
                        cx += sx; cy += sy;
                    }
                }
                break;
            default:
                break;
        }
        if (can_reach) return 1;
    }
    return 0;
}

int move_to_notation(const Board *b, Move m, char *buf, int buflen) {
    int from = move_from(m);
    int to   = move_to(m);
    int flags = move_flags(m);
    int piece = b->squares[from];
    int abs_piece = piece > 0 ? piece : -piece;
    int color = piece > 0 ? WHITE : BLACK;
    char *p = buf;

    if (buflen < 2) return 0;

    /* Castling */
    if (flags & FLAG_CASTLE) {
        if (sq_file(to) == 6) {
            snprintf(buf, buflen, "O-O");
        } else {
            snprintf(buf, buflen, "O-O-O");
        }
        return (int)strlen(buf);
    }

    /* Piece letter */
    if (abs_piece != PAWN) {
        *p++ = piece_letters[abs_piece];

        /* Disambiguation */
        if (needs_disambiguation(b, abs_piece, from, to, color)) {
            int same_file = 0, same_rank = 0;
            /* Check if any ambiguous piece shares file or rank */
            for (int s = 0; s < 64; s++) {
                if (s == from) continue;
                int sp = b->squares[s];
                int abs_sp = sp > 0 ? sp : -sp;
                int sc = sp > 0 ? WHITE : BLACK;
                if (abs_sp == abs_piece && sc == color) {
                    if (sq_file(s) == sq_file(from)) same_file = 1;
                    if (sq_rank(s) == sq_rank(from)) same_rank = 1;
                }
            }
            if (same_file && same_rank) {
                *p++ = 'a' + sq_file(from);
                *p++ = '1' + sq_rank(from);
            } else if (same_file) {
                *p++ = '1' + sq_rank(from);
            } else {
                *p++ = 'a' + sq_file(from);
            }
        }
    }

    /* Pawn captures: add file */
    if (abs_piece == PAWN && move_is_capture(m)) {
        *p++ = 'a' + sq_file(from);
    }

    /* Capture symbol */
    if (move_is_capture(m)) {
        *p++ = 'x';
    }

    /* Destination */
    *p++ = 'a' + sq_file(to);
    *p++ = '1' + sq_rank(to);

    /* Promotion */
    if (flags & FLAG_PROMO) {
        *p++ = '=';
        *p++ = piece_letters[move_promo(m)];
    }

    *p = '\0';
    return (int)(p - buf);
}

Move board_parse_notation(Board *b, const char *notation) {
    /* Generate all legal moves and match notation */
    Move moves[MAX_MOVES];
    int n = generate_legal(b, moves);
    char buf[16];

    /* Strip check/checkmate suffixes from input */
    char clean[32];
    strncpy(clean, notation, sizeof(clean) - 1);
    clean[sizeof(clean) - 1] = '\0';
    int len = (int)strlen(clean);
    while (len > 0 && (clean[len-1] == '+' || clean[len-1] == '#')) {
        clean[--len] = '\0';
    }

    for (int i = 0; i < n; i++) {
        move_to_notation(b, moves[i], buf, sizeof(buf));
        /* Strip check suffixes from generated notation too */
        int blen = (int)strlen(buf);
        while (blen > 0 && (buf[blen-1] == '+' || buf[blen-1] == '#')) {
            buf[--blen] = '\0';
        }
        if (strcmp(buf, clean) == 0) {
            return moves[i];
        }
    }
    return MOVE_NONE;
}
