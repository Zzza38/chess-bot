"use client";

interface EvalBarProps {
    label: string;
    evalCp: number | null;
    mate: number | null;
    isLoading: boolean;
}

export default function EvalBar({ label, evalCp, mate, isLoading }: EvalBarProps) {
    const evalValue = evalCp ?? 0;
    const hasData = evalCp !== null || mate !== null;

    let whitePct: number;
    let valueLabel: string;

    if (!hasData) {
        whitePct = 50;
        valueLabel = "—";
    } else if (mate !== null) {
        whitePct = mate > 0 ? 100 : 0;
        valueLabel = `M${Math.abs(mate)}`;
    } else {
        whitePct = 50 + Math.max(-50, Math.min(50, evalValue / 10));
        const pawns = evalValue / 100;
        valueLabel = (pawns >= 0 ? "+" : "") + pawns.toFixed(1);
    }

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            height: "100%",
            gap: 4,
        }}>
            {/* Bar */}
            <div style={{
                width: 28,
                flex: 1,
                display: "flex",
                flexDirection: "column",
                border: "2px solid #333",
                borderRadius: 4,
                overflow: "hidden",
                position: "relative",
                flexShrink: 0,
            }}>
                {/* Black portion (top) */}
                <div style={{
                    background: "#333",
                    flex: `${100 - whitePct} 0 0`,
                    transition: "flex 0.3s ease",
                }} />
                {/* White portion (bottom) */}
                <div style={{
                    background: "#f0f0f0",
                    flex: `${whitePct} 0 0`,
                    transition: "flex 0.3s ease",
                }} />
                {/* Value label */}
                <div style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%) rotate(-90deg)",
                    fontSize: 10,
                    fontWeight: 700,
                    color: whitePct > 50 ? "#333" : "#eee",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                }}>
                    {isLoading ? "..." : valueLabel}
                </div>
            </div>
            {/* Title label */}
            <div style={{
                fontSize: 9,
                fontWeight: 600,
                color: "#666",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                whiteSpace: "nowrap",
            }}>
                {label}
            </div>
        </div>
    );
}
