import "server-only";
import { dataSource } from ".";

/** Wraps a data call in the { ok, data, meta } envelope. GETs may be shared by the CDN for a few seconds. */
export async function respond<T>(work: () => Promise<T>, cdnSeconds = 0) {
  try {
    const data = await work();
    const headers: Record<string, string> = {};
    if (cdnSeconds > 0) headers["Cache-Control"] = `public, s-maxage=${cdnSeconds}, stale-while-revalidate=${cdnSeconds * 3}`;
    return Response.json({ ok: true, data, meta: { fetchedAt: new Date().toISOString(), source: dataSource } }, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message.split("\n")[0] : "Unknown error";
    return Response.json({ ok: false, error: message, meta: { fetchedAt: new Date().toISOString(), source: dataSource } }, { status: 502 });
  }
}
