import type { RouteQuote } from "@/lib/data/types";
import { feeLabel } from "@/lib/format";

export function RoutePath({ quote, compact = false }: { quote: RouteQuote; compact?: boolean }) {
  return (
    <span className="route">
      <span className="sym">{quote.settlement.symbol}</span>
      {quote.hops.map((h, i) => (
        <span key={i} style={{ display: "contents" }}>
          {!compact && <span className="via">{h.venue.toUpperCase()} {feeLabel(h.feePips)}</span>}
          <span className="arr">→</span>
          <span className="sym">{h.tokenOut.symbol}</span>
        </span>
      ))}
    </span>
  );
}
