"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApi, useNow } from "@/lib/api";
import type { MarketsSnapshot, RouteQuote, RoutesSnapshot, Settlement } from "@/lib/data/types";
import { ago, blockNo, bps, num, signed } from "@/lib/format";
import { RoutePath } from "../RoutePath";
import { RoutePanel, VERDICT } from "./RoutePanel";
import { useEligibleAlert } from "./useEligibleAlert";

type SortKey = "net" | "size" | "spread" | "impact" | "result" | "gas";
const SORTS: { k: SortKey; label: string; get: (q: RouteQuote) => number }[] = [
  { k: "size", label: "Size", get: (q) => q.amountIn },
  { k: "spread", label: "Raw spread", get: (q) => q.rawEdgeBps },
  { k: "impact", label: "Impact", get: (q) => q.impactBps },
  { k: "result", label: "Quoted result", get: (q) => q.grossResult },
  { k: "gas", label: "Est. gas", get: (q) => q.gasSettlement ?? 0 },
  { k: "net", label: "Est. net", get: (q) => q.netResult ?? -Infinity },
];

const toNum = (s: string) => (s.trim() === "" ? null : Number(s));

export function Scanner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const now = useNow(1000);

  const [settlement, setSettlement] = useState<Settlement>(params.get("s") === "WETH" ? "WETH" : "USDG");
  const [maxHops, setMaxHops] = useState(4);
  const [asset, setAsset] = useState("");
  const [venues, setVenues] = useState({ v2: true, v3: true });
  const [more, setMore] = useState(false);
  const [f, setF] = useState({ minSize: "", maxSize: "", minNet: "", maxImpact: "", maxAge: "" });
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "net", dir: -1 });

  const routesUrl = `/api/routes?settlement=${settlement}&maxHops=${maxHops}${asset ? `&token=${asset}` : ""}`;
  const [fast, setFast] = useState(false);
  const { data, error, loading, readAt, refresh } = useApi<RoutesSnapshot>(routesUrl, fast ? 15_000 : 30_000);
  const alert = useEligibleAlert(data);
  useEffect(() => {
    setFast(alert.on);
  }, [alert.on]);
  const { data: markets } = useApi<MarketsSnapshot>("/api/markets");

  const selected = params.get("r");
  const selectedAmount = params.get("a") ? Number(params.get("a")) : null;

  const rows = useMemo(() => {
    if (!data) return [];
    const minSize = toNum(f.minSize), maxSize = toNum(f.maxSize), minNet = toNum(f.minNet), maxImpact = toNum(f.maxImpact), maxAge = toNum(f.maxAge);
    const getter = SORTS.find((s) => s.k === sort.k)!.get;
    return data.quoted
      .filter((q) => q.hops.every((h) => venues[h.venue]))
      .filter((q) => (minSize === null || q.amountIn >= minSize) && (maxSize === null || q.amountIn <= maxSize))
      .filter((q) => minNet === null || (q.netResult ?? -Infinity) >= minNet)
      .filter((q) => maxImpact === null || q.impactBps <= maxImpact)
      .filter((q) => maxAge === null || (now - q.quotedAt) / 1000 <= maxAge)
      .sort((a, b) => (getter(a) - getter(b)) * sort.dir);
  }, [data, f, venues, sort, now]);

  const open = useCallback(
    (q: RouteQuote) => {
      const sp = new URLSearchParams(params.toString());
      sp.set("r", q.id);
      sp.set("a", String(+q.amountIn.toFixed(6)));
      sp.set("s", q.settlement.symbol);
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const close = useCallback(() => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("r");
    sp.delete("a");
    router.replace(sp.size ? `${pathname}?${sp}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const scanAge = data ? now - data.meta.blockTimestamp * 1000 : 0;
  const stale = scanAge > 90_000;
  const selectedQuote = data?.quoted.find((q) => q.id === selected) ?? null;

  const th = (k: SortKey, label: string) => (
    <th className="r" aria-sort={sort.k === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => setSort((s) => ({ k, dir: s.k === k ? ((s.dir * -1) as 1 | -1) : -1 }))}>
        {label} {sort.k === k ? (sort.dir === -1 ? "↓" : "↑") : ""}
      </button>
    </th>
  );

  return (
    <div className="wrap tpage">
      <div className="thead">
        <div>
          <span className="label">Scanner</span>
          <h1>Opportunities</h1>
          <p className="desc">
            Closed loops of 2–4 depth-verified Uniswap pools that begin and end in the settlement asset. Candidates are ranked by spot edge, then every hop is
            quoted on-chain at a size scaled to the shallowest pool. Each row is an estimate at one block — open it to re-quote and rehearse the exact call.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className={`btn ${alert.on ? "btn-solid" : ""}`} aria-pressed={alert.on} onClick={alert.toggle} title="Browser notification and a chime when a loop clears every cost">
            {alert.on ? "● Alerts on" : "Notify me"}
          </button>
          <button type="button" className="btn" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh scan"}</button>
          {alert.on && (
            <span className="faint" style={{ fontSize: 12, flexBasis: "100%", textAlign: "right" }}>
              {alert.permission === "granted"
                ? "Keep this tab open — you get a notification and a chime when a loop is eligible."
                : alert.permission === "denied"
                  ? "Notifications are blocked for this site: you will only hear the chime and see the tab title."
                  : "Keep this tab open — the tab title and a chime flag eligible loops."}
            </span>
          )}
        </div>
      </div>

      <div className="kpis">
        <div><span className="label">Eligible estimates</span><div className={`v ${data?.eligible ? "sig" : ""}`}>{data ? data.eligible : "—"}</div></div>
        <div><span className="label">Cycles quoted</span><div className="v">{data ? data.quoted.length : "—"}</div></div>
        <div><span className="label">Candidates ranked</span><div className="v">{data ? num(data.candidatesRanked, 0) : "—"}</div></div>
        <div><span className="label">Routable pools</span><div className="v">{data ? data.routablePools : "—"}</div></div>
        <div><span className="label">Gas conversion</span><div className="v">{data ? (data.gasConversion.credible ? "Credible" : "Incomplete") : "—"}</div></div>
      </div>
      {data && <p className="faint mono" style={{ fontSize: 12, margin: "8px 0 0" }}>{data.gasConversion.note}</p>}

      <div className="filters main">
        <div className="f">
          <span className="label">Settle in</span>
          <div className="seg" role="group" aria-label="Settlement asset">
            {(["USDG", "WETH"] as Settlement[]).map((s) => <button key={s} type="button" aria-pressed={settlement === s} onClick={() => setSettlement(s)}>{s}</button>)}
          </div>
        </div>
        <div className="f">
          <span className="label">Pools per loop</span>
          <div className="seg" role="group" aria-label="Pools per loop">
            {[[2, "2 only"], [3, "≤ 3"], [4, "≤ 4"]].map(([n, l]) => <button key={n} type="button" aria-pressed={maxHops === n} onClick={() => setMaxHops(n as number)}>{l}</button>)}
          </div>
        </div>
        <div className="f grow">
          <label className="label" htmlFor="sc-asset">Asset</label>
          <select id="sc-asset" className="select" value={asset} onChange={(e) => setAsset(e.target.value)}>
            <option value="">All verified assets</option>
            {markets?.markets.map((m) => <option key={m.stock.address} value={m.stock.address}>{m.stock.symbol} — {m.stock.name}</option>)}
          </select>
        </div>
        <div className="f">
          <span className="label">Venue</span>
          <div className="seg" role="group" aria-label="Venue">
            {(["v2", "v3"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={venues[v]} onClick={() => setVenues((x) => ({ ...x, [v]: !x[v] }))}>Uniswap {v.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div className="f">
          <span className="label" aria-hidden="true">&nbsp;</span>
          <button type="button" className="btn btn-sm btn-quiet" aria-expanded={more} onClick={() => setMore((m) => !m)}>{more ? "Hide filters" : "More filters"}</button>
        </div>
      </div>
      {more && (
        <div className="filters more" style={{ marginTop: -6 }}>
          {([
            ["minSize", "Min size", settlement],
            ["maxSize", "Max size", settlement],
            ["minNet", "Min est. net", settlement],
            ["maxImpact", "Max price impact", "bps"],
            ["maxAge", "Max quote age", "s"],
          ] as const).map(([k, l, u]) => (
            <div className="f" key={k}>
              <label className="label" htmlFor={`mf-${k}`}>{l}</label>
              <div className="unit">
                <input id={`mf-${k}`} className="input" inputMode="decimal" value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value.replace(",", ".") }))} />
                <span>{u}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && !data && <p className="err">Scan failed: {error}</p>}
      {!data ? (
        <div className="panel"><p className="loading">Scanning loops… a cold read of every pool can take a while.</p></div>
      ) : (
        <>
          <div className={`banner ${data.eligible ? "go" : ""}`}>
            <div className="row">
              <strong>{data.eligible ? `${data.eligible} eligible route${data.eligible > 1 ? "s" : ""} right now` : "No eligible route right now"}</strong>
              <span className="num faint" style={{ fontSize: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span className={`tag ${stale ? "warn" : "ok"}`}>{stale ? "stale" : "fresh"}</span>
                {data.meta.network} · {data.meta.chainId} · block {blockNo(data.meta.block)} · read {readAt ? ago(readAt, now) : "—"}
              </span>
            </div>
            <p>{data.note}</p>
            {error && <p className="err">Last refresh failed ({error}); showing the previous scan.</p>}
          </div>

          <div className="panel tbl-wrap">
            <table className="tbl stack">
              <caption className="sr-only">Quoted loops. Select a row to open the route panel.</caption>
              <thead>
                <tr>
                  <th>Route</th>
                  {th("size", `Size (${settlement})`)}
                  {th("spread", "Raw spread")}
                  {th("impact", "Impact")}
                  {th("result", "Quoted result")}
                  {th("gas", "Est. gas")}
                  {th("net", "Est. net")}
                  <th>Status</th>
                  <th className="r">Quote</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={9} className="empty">No loop matches these filters.</td></tr>
                )}
                {rows.map((q) => {
                  const v = VERDICT[q.verdict];
                  return (
                    <tr
                      key={q.id}
                      className={`click ${q.id === selected ? "sel" : ""}`}
                      tabIndex={0}
                      onClick={() => open(q)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open(q))}
                    >
                      <td data-l="Route" className="full"><RoutePath quote={q} /></td>
                      <td data-l="Size" className="r num">{num(q.amountIn, 2)}</td>
                      <td data-l="Raw spread" className="r num">{bps(q.rawEdgeBps)}</td>
                      <td data-l="Impact" className="r num">{(q.impactBps / 100).toFixed(2)}%</td>
                      <td data-l="Quoted result" className={`r num ${q.grossResult > 0 ? "pos" : "neg"}`}>{signed(q.grossResult)}</td>
                      <td data-l="Est. gas" className="r num">{q.gasSettlement === null ? "—" : q.gasSettlement.toFixed(4)}</td>
                      <td data-l="Est. net" className={`r num ${(q.netResult ?? 0) > 0 ? "pos" : "neg"}`}><b>{signed(q.netResult)}</b></td>
                      <td data-l="Status"><span className={`tag ${v.tag}`}>{v.title}</span></td>
                      <td data-l="Quote" className="r num faint">{ago(q.quotedAt, now)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="side-grid">
            <div className="panel">
              <div className="panel-head"><strong>Why loops are not eligible</strong><span className="num faint" style={{ marginLeft: "auto", fontSize: 12 }}>block {blockNo(data.meta.block)}</span></div>
              <div className="panel-body">
                {data.rejection.length === 0 ? <p className="muted" style={{ margin: 0 }}>Every quoted loop is eligible.</p> : (
                  <dl className="kv">
                    {data.rejection.map((r) => (
                      <div key={r.reason} style={{ display: "contents" }}>
                        <dt>{VERDICT[r.reason].title}<small>{VERDICT[r.reason].text}</small></dt>
                        <dd>{r.count}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </div>
            <div className="panel">
              <div className="panel-head"><strong>Pools kept out of routing</strong><Link href="/app/pools" style={{ marginLeft: "auto", fontSize: 13 }}>Pool explorer →</Link></div>
              <div className="panel-body">
                <dl className="kv">
                  <dt>Inactive — no liquidity in range</dt><dd>{data.excluded.inactive}</dd>
                  <dt>Below the dust floor</dt><dd>{data.excluded.dust}</dd>
                  <dt>Hollow — failed the depth probe</dt><dd>{data.excluded.hollow}</dd>
                  <dt>Not probed (RPC)</dt><dd>{data.excluded.unprobed}</dd>
                  <dt>Uniswap v4 — no adapter</dt><dd>{num(data.excluded.v4, 0)}</dd>
                </dl>
              </div>
            </div>
          </div>
        </>
      )}

      {selected && (
        <RoutePanel key={selected} routeId={selected} initialAmount={selectedAmount} initialQuote={selectedQuote} onClose={close} />
      )}
    </div>
  );
}
