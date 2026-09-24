import { provider } from "@/lib/data";
import { respond } from "@/lib/data/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  return respond(() => provider.v4Pools({ page: Number(q.get("page") ?? 1) || 1, includeExtreme: q.get("includeExtreme") === "true" }), 60);
}
