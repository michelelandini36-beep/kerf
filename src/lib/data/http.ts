import type { DataProvider } from "./types";

// Live adapter. Point KERF_API_BASE_URL at a backend that serves the same
// endpoints as src/app/api/* (see /docs#developers). Server-only: the key
// never reaches the browser.
//
// The backend is expected to answer in the shapes declared in types.ts
// (human units). If yours returns base-unit bigints as strings, convert them
// here — this file is the only place that knows about the wire format.

function base() {
  const url = process.env.KERF_API_BASE_URL;
  if (!url) throw new Error("KERF_API_BASE_URL is not set; set KERF_DATA_SOURCE=mock or configure the backend.");
  return url.replace(/\/$/, "");
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.KERF_API_KEY) headers.authorization = `Bearer ${process.env.KERF_API_KEY}`;
  if (init?.body) headers["content-type"] = "application/json";
  const res = await fetch(base() + path, { ...init, headers, cache: "no-store" });
  if (!res.ok) throw new Error(`Backend ${path} answered ${res.status}`);
  const body = await res.json();
  return (body && typeof body === "object" && "data" in body ? body.data : body) as T;
}

const qs = (o: Record<string, string | number | boolean | null | undefined>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString();

export const httpProvider: DataProvider = {
  markets: () => call("/api/markets"),
  routes: (o) => call(`/api/routes?${qs(o)}`),
  quote: (req) => call("/api/quote", { method: "POST", body: JSON.stringify(req) }),
  activity: (o) => call(`/api/activity?${qs(o)}`),
  status: () => call("/api/status"),
  token: () => call("/api/token"),
  v4Pools: (o) => call(`/api/pools/v4?${qs(o)}`),
};
