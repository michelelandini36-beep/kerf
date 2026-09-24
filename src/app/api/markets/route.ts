import { provider } from "@/lib/data";
import { respond } from "@/lib/data/respond";

export const dynamic = "force-dynamic";

export function GET() {
  return respond(() => provider.markets());
}
