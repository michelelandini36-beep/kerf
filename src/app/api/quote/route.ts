import type { QuoteRequest } from "@/lib/data/types";
import { provider } from "@/lib/data";
import { respond } from "@/lib/data/respond";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<QuoteRequest> | null;
  return respond(async () => {
    if (!body?.routeId || typeof body.amountIn !== "number" || !(body.amountIn > 0)) throw new Error("routeId and a positive amountIn are required.");
    return provider.quote({
      routeId: body.routeId,
      amountIn: body.amountIn,
      simulate: Boolean(body.simulate),
      from: body.from ?? null,
      minProfit: typeof body.minProfit === "number" ? body.minProfit : undefined,
      deadlineSec: typeof body.deadlineSec === "number" ? Math.min(600, Math.max(30, body.deadlineSec)) : undefined,
    });
  });
}
