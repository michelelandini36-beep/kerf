export const short = (a?: string | null, head = 6, tail = 4) => (a ? `${a.slice(0, head)}…${a.slice(-tail)}` : "—");

export function num(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function signed(n: number | null | undefined, digits = 4) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return (n > 0 ? "+" : n < 0 ? "−" : "") + s;
}

export function bps(n: number | null | undefined, asPct = true) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (!asPct) return `${n.toFixed(0)} bps`;
  const v = n / 100;
  return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2) + "%";
}

export const pct = (n: number) => (n / 100).toFixed(2) + "%";
export const feeLabel = (pips: number) => (pips / 10_000).toFixed(pips < 1000 ? 2 : 2) + "%";

export function usd(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 10_000) return "$" + (n / 1000).toFixed(1) + "k";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function price(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const d = n >= 1000 ? 2 : n >= 1 ? 4 : 6;
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function ago(fromMs: number, nowMs: number) {
  const s = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 172800) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export const blockNo = (b: number) => b.toLocaleString("en-US");

export const utc = (unixSec: number) => new Date(unixSec * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
