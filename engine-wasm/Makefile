CC = emcc
CFLAGS = -O3 -flto

SRCS = src/board.c src/tt.c src/movegen.c src/eval.c src/search.c src/api.c
OUT = chess-engine

EXPORTED_FUNCTIONS = \
	_engine_init, \
	_engine_get_string_buf, \
	_engine_get_string_buf_size, \
	_engine_set_fen, \
	_engine_get_fen, \
	_engine_search, \
	_engine_get_best_move, \
	_engine_get_ranked_moves, \
	_engine_get_ranked_ptr, \
	_engine_get_ranked_move_score, \
	_engine_get_ranked_breakdown, \
	_engine_get_ranked_board, \
	_engine_make_move, \
	_engine_get_breakdown, \
	_engine_evaluate, \
	_engine_is_check, \
	_engine_is_checkmate, \
	_engine_is_stalemate, \
	_engine_legal_move_count, \
	_engine_get_board, \
	_engine_get_side, \
	_engine_get_nodes, \
	_malloc, \
	_free

EMFLAGS = -s WASM=1 \
	-s MODULARIZE=1 \
	-s EXPORT_NAME="createChessEngine" \
	-s EXPORTED_FUNCTIONS='[$(EXPORTED_FUNCTIONS)]' \
	-s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","UTF8ToString","stringToUTF8","getValue","setValue","HEAPU8","HEAP8","HEAP16","HEAP32"]' \
	-s ALLOW_MEMORY_GROWTH=1 \
	-s INITIAL_MEMORY=33554432 \
	-s ENVIRONMENT='node' \
	-s FILESYSTEM=0 \
	-s ASSERTIONS=0 \
	--no-entry

.PHONY: all clean native

all:
	$(CC) $(CFLAGS) $(EMFLAGS) $(SRCS) -o $(OUT).js

# Native build for testing without Emscripten
native:
	gcc -O2 -Wall -Wextra $(SRCS) -o $(OUT)-native -lm

clean:
	rm -f $(OUT).js $(OUT).wasm $(OUT)-native $(OUT)-native.exe
