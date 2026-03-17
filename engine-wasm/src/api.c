#include "types.h"
#include "board.h"
#include "tt.h"
#include "movegen.h"
#include "eval.h"
#include "search.h"
#include <string.h>
#include <stdio.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

/* Global board state */
static Board g_board;
static int g_initialized = 0;

/* Shared string buffer for FEN / notation exchange with JS */
#define STRING_BUF_SIZE 1024
static char g_string_buf[STRING_BUF_SIZE];

/* Shared buffer for ranked move results */
#define MAX_RANKED 32
static RankedMove g_ranked[MAX_RANKED];
static int g_ranked_count = 0;

/* Shared breakdown result */
static EvalBreakdown g_breakdown;

/* --- Exported API functions --- */

EMSCRIPTEN_KEEPALIVE
void engine_init(void) {
    zobrist_init();
    tt_init();
    g_initialized = 1;
    board_set_fen(&g_board, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
}

/* Get pointer to the shared string buffer (for JS to write FEN into) */
EMSCRIPTEN_KEEPALIVE
char *engine_get_string_buf(void) {
    return g_string_buf;
}

EMSCRIPTEN_KEEPALIVE
int engine_get_string_buf_size(void) {
    return STRING_BUF_SIZE;
}

/* Load position from FEN in the string buffer */
EMSCRIPTEN_KEEPALIVE
void engine_set_fen(void) {
    board_set_fen(&g_board, g_string_buf);
}

/* Write current FEN to string buffer. Returns length. */
EMSCRIPTEN_KEEPALIVE
int engine_get_fen(void) {
    return board_get_fen(&g_board, g_string_buf, STRING_BUF_SIZE);
}

/* Search to depth. Returns score (centipawns, positive = white advantage).
 * Best move notation is written to string buffer. */
EMSCRIPTEN_KEEPALIVE
int engine_search(int depth) {
    if (depth < 1) depth = 1;
    if (depth > 20) depth = 20;

    SearchResult result;
    Move best = search_best(&g_board, depth, &result);

    if (best != MOVE_NONE) {
        move_to_notation(&g_board, best, g_string_buf, STRING_BUF_SIZE);
    } else {
        g_string_buf[0] = '\0';
    }

    return result.score;
}

/* Get the best move notation (already in string buf from engine_search).
 * Returns string length. */
EMSCRIPTEN_KEEPALIVE
int engine_get_best_move(void) {
    return (int)strlen(g_string_buf);
}

/* Search and rank all moves. Returns count. Results stored in g_ranked. */
EMSCRIPTEN_KEEPALIVE
int engine_get_ranked_moves(int depth, int max_moves) {
    if (depth < 1) depth = 1;
    if (depth > 20) depth = 20;
    if (max_moves < 1) max_moves = 1;
    if (max_moves > MAX_RANKED) max_moves = MAX_RANKED;

    g_ranked_count = search_ranked(&g_board, depth, g_ranked, max_moves);
    return g_ranked_count;
}

/* Get pointer to ranked moves array (for JS to read) */
EMSCRIPTEN_KEEPALIVE
RankedMove *engine_get_ranked_ptr(void) {
    return g_ranked;
}

/* Get info about a specific ranked move by index.
 * Writes notation to string buffer. Returns score. */
EMSCRIPTEN_KEEPALIVE
int engine_get_ranked_move_score(int idx) {
    if (idx < 0 || idx >= g_ranked_count) return 0;
    strncpy(g_string_buf, g_ranked[idx].notation, STRING_BUF_SIZE - 1);
    g_string_buf[STRING_BUF_SIZE - 1] = '\0';
    return g_ranked[idx].score;
}

/* Get breakdown for a ranked move. Returns pointer to breakdown struct. */
EMSCRIPTEN_KEEPALIVE
EvalBreakdown *engine_get_ranked_breakdown(int idx) {
    if (idx < 0 || idx >= g_ranked_count) {
        memset(&g_breakdown, 0, sizeof(g_breakdown));
        return &g_breakdown;
    }
    return &g_ranked[idx].breakdown;
}

/* Get board state after a ranked move (for mini board preview).
 * Makes the move, writes board to buffer, unmakes.
 * Returns pointer to a 64-byte array of signed piece values. */
static int8_t g_board_buf[64];

EMSCRIPTEN_KEEPALIVE
int8_t *engine_get_ranked_board(int idx) {
    if (idx < 0 || idx >= g_ranked_count) {
        memset(g_board_buf, 0, 64);
        return g_board_buf;
    }
    board_make_move(&g_board, g_ranked[idx].move);
    memcpy(g_board_buf, g_board.squares, 64);
    board_unmake_move(&g_board);
    return g_board_buf;
}

/* Make a move. Notation should be in string buffer. Returns 1=success, 0=illegal. */
EMSCRIPTEN_KEEPALIVE
int engine_make_move(void) {
    Move m = board_parse_notation(&g_board, g_string_buf);
    if (m == MOVE_NONE) return 0;
    board_make_move(&g_board, m);
    return 1;
}

/* Get eval breakdown for current position */
EMSCRIPTEN_KEEPALIVE
EvalBreakdown *engine_get_breakdown(void) {
    g_breakdown = evaluate_breakdown(&g_board);
    return &g_breakdown;
}

/* Get static eval for current position */
EMSCRIPTEN_KEEPALIVE
int engine_evaluate(void) {
    return evaluate(&g_board);
}

/* Check if side to move is in check */
EMSCRIPTEN_KEEPALIVE
int engine_is_check(void) {
    return is_in_check(&g_board, g_board.side);
}

/* Check for checkmate */
EMSCRIPTEN_KEEPALIVE
int engine_is_checkmate(void) {
    Move moves[MAX_MOVES];
    int n = generate_legal(&g_board, moves);
    return n == 0 && is_in_check(&g_board, g_board.side);
}

/* Check for stalemate */
EMSCRIPTEN_KEEPALIVE
int engine_is_stalemate(void) {
    Move moves[MAX_MOVES];
    int n = generate_legal(&g_board, moves);
    return n == 0 && !is_in_check(&g_board, g_board.side);
}

/* Count of legal moves */
EMSCRIPTEN_KEEPALIVE
int engine_legal_move_count(void) {
    Move moves[MAX_MOVES];
    return generate_legal(&g_board, moves);
}

/* Get current board squares (64 signed int8 values) */
EMSCRIPTEN_KEEPALIVE
int8_t *engine_get_board(void) {
    return g_board.squares;
}

/* Get current side to move: 0=white, 1=black */
EMSCRIPTEN_KEEPALIVE
int engine_get_side(void) {
    return g_board.side;
}

/* Get node count from last search */
EMSCRIPTEN_KEEPALIVE
int engine_get_nodes(void) {
    /* Access through SearchResult in the future; for now return 0 */
    return 0;
}

/* --- Test main (for native builds only) --- */
#ifndef __EMSCRIPTEN__
int main(void) {
    engine_init();
    printf("Engine initialized.\n");

    /* Starting position */
    printf("FEN: ");
    engine_get_fen();
    printf("%s\n", g_string_buf);

    /* Count legal moves */
    int n = engine_legal_move_count();
    printf("Legal moves: %d\n", n);

    /* Search depth 5 */
    printf("Searching depth 5...\n");
    int score = engine_search(5);
    printf("Best move: %s (score: %d cp)\n", g_string_buf, score);

    /* Ranked moves */
    int ranked_n = engine_get_ranked_moves(4, 10);
    printf("Top %d moves:\n", ranked_n);
    for (int i = 0; i < ranked_n; i++) {
        engine_get_ranked_move_score(i);
        printf("  %d. %s (%d cp)\n", i + 1, g_string_buf, g_ranked[i].score);
    }

    /* Test position: mate in 1 */
    printf("\nMate in 1 test:\n");
    strcpy(g_string_buf, "6k1/5ppp/8/8/8/8/1Q6/K7 w - - 0 1");
    engine_set_fen();
    engine_get_fen();
    printf("FEN: %s\n", g_string_buf);
    score = engine_search(3);
    printf("Best move: %s (score: %d cp)\n", g_string_buf, score);

    return 0;
}
#endif
