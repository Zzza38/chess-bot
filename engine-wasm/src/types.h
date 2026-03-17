#ifndef TYPES_H
#define TYPES_H

#include <stdint.h>

/* Piece types */
#define EMPTY   0
#define PAWN    1
#define KNIGHT  2
#define BISHOP  3
#define ROOK    4
#define QUEEN   5
#define KING    6

/* Colors: positive = white, negative = black, 0 = empty */
#define WHITE   0
#define BLACK   1

/* Castling rights bitmask */
#define CASTLE_WK  0x01  /* White kingside  */
#define CASTLE_WQ  0x02  /* White queenside */
#define CASTLE_BK  0x04  /* Black kingside  */
#define CASTLE_BQ  0x08  /* Black queenside */

/* Move flags */
#define FLAG_NONE       0x00
#define FLAG_CASTLE     0x01
#define FLAG_EP         0x02
#define FLAG_DOUBLE     0x04  /* double pawn push */
#define FLAG_PROMO      0x08  /* promotion */

/* Score constants */
#define INF_SCORE    1000000
#define MATE_SCORE    999000

/* Max moves per position */
#define MAX_MOVES  256
/* Max search depth / ply */
#define MAX_PLY    128

/*
 * Move encoding (32-bit):
 *   bits  0-5:  from square (0-63)
 *   bits  6-11: to square   (0-63)
 *   bits 12-15: captured piece type (0 = none, 1-6 = piece)
 *   bits 16-19: promotion piece type (0 = none, 2-5 = N/B/R/Q)
 *   bits 20-23: flags
 */
typedef uint32_t Move;

#define MOVE_NONE 0

static inline Move encode_move(int from, int to, int captured, int promo, int flags) {
    return (uint32_t)from | ((uint32_t)to << 6) | ((uint32_t)captured << 12)
           | ((uint32_t)promo << 16) | ((uint32_t)flags << 20);
}

static inline int move_from(Move m)     { return m & 0x3F; }
static inline int move_to(Move m)       { return (m >> 6) & 0x3F; }
static inline int move_captured(Move m) { return (m >> 12) & 0x0F; }
static inline int move_promo(Move m)    { return (m >> 16) & 0x0F; }
static inline int move_flags(Move m)    { return (m >> 20) & 0x0F; }
static inline int move_is_capture(Move m) { return move_captured(m) != 0; }

/* Square helpers */
static inline int sq(int file, int rank) { return rank * 8 + file; }
static inline int sq_file(int s)         { return s & 7; }
static inline int sq_rank(int s)         { return s >> 3; }

/* Board state */
typedef struct {
    int8_t   squares[64];       /* piece type * sign (positive=white, negative=black) */
    uint8_t  side;              /* WHITE=0, BLACK=1 */
    uint8_t  castle_rights;     /* bitmask CASTLE_WK|WQ|BK|BQ */
    int8_t   ep_square;         /* -1 or 0-63 */
    uint8_t  did_castle[2];     /* [WHITE]=0/1, [BLACK]=0/1 — for eval bonus */
    uint64_t hash;              /* Zobrist hash (incrementally updated) */

    /* Undo stacks */
    Move     move_stack[MAX_PLY];
    uint8_t  castle_stack[MAX_PLY];
    int8_t   ep_stack[MAX_PLY];
    int8_t   captured_stack[MAX_PLY];
    uint64_t hash_stack[MAX_PLY];
    uint8_t  did_castle_stack[MAX_PLY * 2];
    int      ply;

    /* King positions cached */
    int8_t   king_sq[2]; /* [WHITE], [BLACK] — updated in make/unmake */
} Board;

/* Eval breakdown for the analysis panel */
typedef struct {
    int16_t material;
    int16_t pst;
    int16_t bishop_pair;
    int16_t castling;
    int16_t rook_seventh;
    int16_t doubled_pawns;
    int16_t isolated_pawns;
    int16_t passed_pawns;
    int16_t rook_open_file;
    int16_t rook_semi_open_file;
    int16_t king_safety;
    int16_t check_penalty;
    int16_t total;
} EvalBreakdown;

/* Search result */
typedef struct {
    Move  best_move;
    int   score;
    int   depth;
    int   nodes;
} SearchResult;

/* TT entry flags */
#define TT_EXACT  0
#define TT_ALPHA  1  /* upper bound */
#define TT_BETA   2  /* lower bound */

typedef struct {
    uint64_t key;
    int32_t  value;
    Move     best_move;
    int16_t  depth;
    uint8_t  flag;
    uint8_t  age;
} TTEntry;

/* Ranked move for API output */
typedef struct {
    Move  move;
    int   score;
    char  notation[16];
    EvalBreakdown breakdown;
} RankedMove;

#endif /* TYPES_H */
