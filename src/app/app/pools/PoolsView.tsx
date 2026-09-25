"use client";
import { useMemo, useState } from "react";
import { useApi, useNow } from "@/lib/api";
import { explorerAddress } from "@/lib/brand";
import type { MarketsSnapshot, Pool, PoolState, V4Page } from "@/lib/data/types";
import { ago, blockNo, feeLabel, price, short, usd } from "@/lib/format";

const STATES: { k: PoolState; label: string; tag: string }[] = [
  { k: "routable", label: "Routable", tag: "ok" },
  { k: "inactive", label: "Inactive", tag: "off" },
  { k: "dust", label: "Dust", tag: "off" },
  { k: "hollow", label: "Hollow", tag: "bad" },
  { k: "unprobed", label: "Not probed", tag: "warn" },
  { k: "no-usd", label: "No USD value", tag: "warn" },
];
const PAIRS = [
  ["all", "All"],
  ["stock-quote", "Stock / quote"],
  ["stock-stock", "Stock / stock"],
  ["connector", "WETH / USDG"],
] as const;

export function PoolsView() {
  const now = useNow(5000);
  const { data, error, loading, readAt, refresh } = useApi<MarketsSnapshot>("/api/markets");
  const [q, setQ] = useState("");
  const [asset, setAsset] = useState("");
  const [pair, setPair] = useState<(typeof PAIRS)[number][0]>("all");
  const [venue, setVenue] = useState<"all" | "v2" | "v3">("all");
  const [state, setState] = useState<"" | PoolState>("");
  const [extreme, setExtreme] = useState(false);
  const [v4page, setV4page] = useState(1);
  const v4 = useApi<V4Page>(`/api/pools/v4?page=${v4page}&includeExtreme=${extreme}`);

  const all: Pool[] = useMemo(() => (data ? [...data.markets.flatMap((m) => m.pools), ...data.stockStock, ...data.connectors] : []), [data]);
  const counts = useMemo(() => Object.fromEntries(STATES.map((s) => [s.k, all.filter((p) => p.state === s.k).length])), [all]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((p) => !needle || [p.address, p.base.symbol, p.base.name, p.quote.symbol, p.quote.name, p.base.address, p.quote.address].some((x) => x.toLowerCase().includes(needle)))
      .filter((p) => !asset || p.base.address === asset || p.quote.address === asset)
      .filter((p) => pair === "all" || p.pairType === pair)
      .filter((p) => venue === "all" || p.venue === venue)
      .filter((p) => !state || p.state === state)
      .sort((a, b) => b.depthUsd - a.depthUsd);
  }, [all, q, asset, pair, venue, state]);

  const assets = useMemo(() => {
    const m = new Map<string, string>();
    all.forEach((p) => [p.base, p.quote].forEach((a) => m.set(a.address, `${a.symbol} — ${a.name}`)));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);

  return (
    <div className="wrap tpage">
      <div className="thead">
        <div>
          <span className="label">Pool explorer</span>
          <h1>Verified pools</h1>
          <p className="desc">
            Every pool the canonical Uniswap V2 and V3 factories return for an issuer-verified stock token, USDG or WETH — all read at one block. Spot prices
            are indicative, before price impact. Uniswap v4 pools are listed separately below: they are neither priced nor routed.
          </p>
        </div>
        <button type="button" className="btn" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
      </div>

      <section className="filters pools" aria-label="Pool filters">
        <div className="f">
          <label className="label" htmlFor="pq">Search</label>
          <input id="pq" className="input" placeholder="Symbol, name or 0x address" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="f">
          <label className="label" htmlFor="pa">Asset</label>
          <select id="pa" className="select" value={asset} onChange={(e) => setAsset(e.target.value)}>
            <option value="">All assets</option>
            {assets.map(([a, l]) => <option key={a} value={a}>{l}</option>)}
          </select>
        </div>
        <div className="f">
          <span className="label">Pair</span>
          <div className="seg" role="group" aria-label="Pair type">
            {PAIRS.map(([k, l]) => <button key={k} type="button" aria-pressed={pair === k} onClick={() => setPair(k)}>{l}</button>)}
          </div>
        </div>
        <div className="f">
          <span className="label">Venue</span>
          <div className="seg" role="group" aria-label="Venue">
            {(["all", "v2", "v3"] as const).map((v) => <button key={v} type="button" aria-pressed={venue === v} onClick={() => setVenue(v)}>{v === "all" ? "All" : `Uniswap ${v.toUpperCase()}`}</button>)}
          </div>
        </div>
        <div className="f">
          <label className="label" htmlFor="pe">Eligibility</label>
          <select id="pe" className="select" value={state} onChange={(e) => setState(e.target.value as PoolState | "")}>
            <option value="">All states</option>
            {STATES.map((s) => <option key={s.k} value={s.k}>{s.label} ({counts[s.k] ?? 0})</option>)}
          </select>
        </div>
      </section>

      <section className="panel" aria-label="Pools">
        <div className="panel-head">
          <strong>Pools</strong>
          {data && <span className="num faint" style={{ fontSize: 12, marginLeft: "auto" }}>{rows.length} of {all.length} · block {blockNo(data.meta.block)} · read {readAt ? ago(readAt, now) : "—"}</span>}
        </div>
        {error && !data && <p className="err panel-body">{error}</p>}
        {!data ? (
          <p className="loading">Reading pool state…</p>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl stack">
              <thead>
                <tr><th>Pair</th><th>Venue</th><th className="r">Spot price</th><th className="r">USD</th><th className="r">+1 % depth</th><th className="r">Probe</th><th>State</th><th>Pool</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={8} className="empty">No pool matches these filters.</td></tr>}
                {rows.slice(0, 200).map((p) => {
                  const st = STATES.find((s) => s.k === p.state)!;
                  return (
                    <tr key={p.address}>
                      <td data-l="Pair"><b className="mono">{p.base.symbol}</b><span className="faint"> / {p.quote.symbol}</span></td>
                      <td data-l="Venue" className="num">{p.venue.toUpperCase()} {feeLabel(p.feePips)}</td>
                      <td data-l="Spot price" className="r num">{p.state === "inactive" ? "—" : price(p.price)}</td>
                      <td data-l="USD" className="r num">{p.priceUsd === null ? "—" : usd(p.priceUsd)}</td>
                      <td data-l="+1 % depth" className="r num">{usd(p.depthUsd)}</td>
                      <td data-l="Probe" className="r num">{p.probeImpactBps === null ? "—" : `${p.probeImpactBps.toFixed(2)} bps`}</td>
                      <td data-l="State"><span className={`tag ${st.tag}`}>{st.label}</span></td>
                      <td data-l="Pool" className="num"><a href={explorerAddress(p.address)} target="_blank" rel="noreferrer">{short(p.address)} ↗</a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length > 200 && <p className="faint" style={{ padding: 12, fontSize: 13 }}>Showing the 200 deepest. Narrow the filters to see the rest.</p>}
          </div>
        )}
      </section>

      <section className="panel" style={{ marginTop: 24 }} aria-labelledby="v4-t">
        <div className="panel-head">
          <strong id="v4-t">Uniswap v4 pools — listed, not supported</strong>
          <span className="tag warn">no adapter</span>
        </div>
        <div className="panel-body" style={{ display: "grid", gap: 12 }}>
          <p className="muted" style={{ margin: 0, fontSize: 14, maxWidth: "60em" }}>
            These pools were initialised between two verified assets, so some of them may set part of an asset’s price. Kerf does not
            price or route them: a v4 pool can run a hook that rewrites its fee or swap curve, which would make the V3 formula wrong, and the executor has no v4
            settlement path.
          </p>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input type="checkbox" checked={extreme} onChange={(e) => { setExtreme(e.target.checked); setV4page(1); }} />
            Include pools with an LP fee above 10 %
          </label>
        </div>
        {!v4.data ? (
          <p className="loading">Loading the v4 census…</p>
        ) : (
          <>
            <div className="tbl-wrap">
              <table className="tbl stack">
                <thead><tr><th>Pair</th><th className="r">LP fee</th><th className="r">Tick spacing</th><th>Hooks</th><th className="r">Created</th><th>Pool id</th></tr></thead>
                <tbody>
                  {v4.data.rows.map((r) => (
                    <tr key={r.id}>
                      <td data-l="Pair"><b className="mono">{r.symbols[0]}</b><span className="faint"> / {r.symbols[1]}</span></td>
                      <td data-l="LP fee" className={`r num ${r.feePips !== 0x800000 && r.feePips > 100_000 ? "sig" : ""}`}>{r.feePips === 0x800000 ? "dynamic" : `${(r.feePips / 10_000).toFixed(2)}%`}</td>
                      <td data-l="Tick spacing" className="r num">{r.tickSpacing}</td>
                      <td data-l="Hooks" className="num">{/^0x0+$/.test(r.hooks) ? <span className="faint">none</span> : short(r.hooks)}</td>
                      <td data-l="Created" className="r num">{blockNo(r.createdBlock)}</td>
                      <td data-l="Pool id" className="num faint">{short(r.id, 10, 6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span className="faint">{v4.data.total} shown · {v4.data.hiddenExtreme} hidden · census block {blockNo(v4.data.snapshotBlock)}</span>
              <button type="button" className="btn btn-sm btn-quiet" disabled={v4.data.page <= 1} onClick={() => setV4page((p) => p - 1)}>← Prev</button>
              <span>{v4.data.page} / {v4.data.pages}</span>
              <button type="button" className="btn btn-sm btn-quiet" disabled={v4.data.page >= v4.data.pages} onClick={() => setV4page((p) => p + 1)}>Next →</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
