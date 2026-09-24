import { provider } from "@/lib/data";
import { respond } from "@/lib/data/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const limit = Math.min(100, Math.max(1, Number(q.get("limit") ?? 25) || 25));
  return respond(() => provider.activity({ caller: q.get("caller"), page: Number(q.get("page") ?? 1) || 1, limit }), 10);
}
