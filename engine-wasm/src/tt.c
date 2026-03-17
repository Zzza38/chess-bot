#include "tt.h"
#include <string.h>

/* --- Zobrist keys --- */

/* zobrist_keys[color][piece_type][square] — color: 0=white pieces, 1=black pieces */
static uint64_t zk_piece[2][7][64];
static uint64_t zk_castle[16];
static uint64_t zk_ep[65];  /* 0-63 = square, 64 = no ep (maps from -1) */
static uint64_t zk_side;

/* Simple xorshift64 PRNG for deterministic key generation */
static uint64_t xorshift_state = 0x12345678DEADBEEFULL;

static uint64_t xorshift64(void) {
    uint64_t x = xorshift_state;
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    xorshift_state = x;
    return x;
}

void zobrist_init(void) {
    xorshift_state = 0x12345678DEADBEEFULL;

    for (int c = 0; c < 2; c++)
        for (int p = 0; p < 7; p++)
            for (int s = 0; s < 64; s++)
                zk_piece[c][p][s] = xorshift64();

    for (int i = 0; i < 16; i++)
        zk_castle[i] = xorshift64();

    for (int i = 0; i < 65; i++)
        zk_ep[i] = xorshift64();

    zk_side = xorshift64();
}

uint64_t zobrist_piece_key(int piece, int square) {
    /* piece is signed: positive=white, negative=black */
    if (piece == 0) return 0;
    int color = piece > 0 ? 0 : 1;
    int ptype = piece > 0 ? piece : -piece;
    if (ptype < 1 || ptype > 6 || square < 0 || square > 63) return 0;
    return zk_piece[color][ptype][square];
}

uint64_t zobrist_castle_key(uint8_t castle_rights) {
    return zk_castle[castle_rights & 0x0F];
}

uint64_t zobrist_ep_key(int8_t ep_square) {
    if (ep_square < 0) return zk_ep[64];
    return zk_ep[ep_square];
}

uint64_t zobrist_side_key(void) {
    return zk_side;
}

uint64_t zobrist_hash(const Board *b) {
    uint64_t h = 0;
    for (int s = 0; s < 64; s++) {
        if (b->squares[s] != 0) {
            h ^= zobrist_piece_key(b->squares[s], s);
        }
    }
    h ^= zobrist_castle_key(b->castle_rights);
    h ^= zobrist_ep_key(b->ep_square);
    if (b->side == BLACK) h ^= zk_side;
    return h;
}

/* --- Transposition Table --- */

static TTEntry tt_table[TT_SIZE];

void tt_init(void) {
    tt_clear();
}

void tt_clear(void) {
    memset(tt_table, 0, sizeof(tt_table));
}

TTEntry *tt_probe(uint64_t key) {
    TTEntry *entry = &tt_table[key & (TT_SIZE - 1)];
    if (entry->key == key) return entry;
    return NULL;
}

void tt_store(uint64_t key, int depth, int value, uint8_t flag, Move best_move) {
    TTEntry *entry = &tt_table[key & (TT_SIZE - 1)];
    /* Always replace, or replace if deeper search */
    if (entry->key != key || depth >= entry->depth) {
        entry->key = key;
        entry->value = (int32_t)value;
        entry->depth = (int16_t)depth;
        entry->flag = flag;
        entry->best_move = best_move;
    }
}
