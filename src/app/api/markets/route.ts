import { provider } from "@/lib/data";
import { respond } from "@/lib/data/respond";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET() {
  return respond(() => provider.markets(), 15);
}
