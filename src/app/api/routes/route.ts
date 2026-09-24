import { provider } from "@/lib/data";
import { respond } from "@/lib/data/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const settlement = q.get("settlement") === "WETH" ? "WETH" : "USDG";
  const maxHops = Math.min(4, Math.max(2, Number(q.get("maxHops") ?? 4) || 4));
  return respond(() => provider.routes({ settlement, maxHops, token: q.get("token") }), 15);
}
