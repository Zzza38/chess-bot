import {execFile} from "node:child_process";

const STOCKFISH_PATH = process.env.STOCKFISH_PATH
    || "C:\\Users\\Zion\\Downloads\\stockfish\\stockfish\\stockfish-windows-x86-64.exe";

export function stockfishEval(fen: string, depth = 16): Promise<{ eval: number; mate: number | null; bestMove: string }> {
    return new Promise((resolve, reject) => {
        const proc = execFile(STOCKFISH_PATH, {timeout: 15000});
        let output = "";

        proc.stdout!.on("data", (data: string) => {
            output += data;
            if (output.includes("bestmove")) {
                proc.kill();

                // Parse the last "info depth" line with "score"
                const infoLines = output.split("\n").filter(l => l.includes("score") && l.includes("info depth"));
                const lastInfo = infoLines[infoLines.length - 1] || "";

                let evalScore = 0;
                let mate: number | null = null;

                const cpMatch = lastInfo.match(/score cp (-?\d+)/);
                const mateMatch = lastInfo.match(/score mate (-?\d+)/);
                if (mateMatch) {
                    mate = parseInt(mateMatch[1]);
                } else if (cpMatch) {
                    evalScore = parseInt(cpMatch[1]);
                }

                const bmMatch = output.match(/bestmove (\S+)/);
                const bestMove = bmMatch ? bmMatch[1] : "?";

                resolve({eval: evalScore, mate, bestMove});
            }
        });

        proc.stderr!.on("data", () => {});
        proc.on("error", reject);

        proc.stdin!.write(`uci\nisready\nposition fen ${fen}\ngo depth ${depth}\n`);
    });
}
