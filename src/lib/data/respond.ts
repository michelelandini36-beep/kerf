import "server-only";
import { dataSource } from ".";

export async function respond<T>(work: () => Promise<T>) {
  try {
    const data = await work();
    return Response.json({ ok: true, data, meta: { fetchedAt: new Date().toISOString(), source: dataSource } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ ok: false, error: message, meta: { fetchedAt: new Date().toISOString(), source: dataSource } }, { status: 502 });
  }
}
