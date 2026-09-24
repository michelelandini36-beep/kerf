"use client";
import Link from "next/link";
import { useState } from "react";
import { useApi, useNow } from "@/lib/api";
import { BRAND, explorerAddress } from "@/lib/brand";
import type { MarketsSnapshot, RoutesSnapshot, StatusSnapshot, TokenInfo } from "@/lib/data/types";
import { ago, blockNo, bps, num, short, signed } from "@/lib/format";
import { RoutePath } from "../RoutePath";

function useStatus() {
  return useApi<StatusSnapshot>("/api/status", 30_000);
}

export function ExecutorLine() {
  const { data, error } = useStatus();
  if (error) return <p className="err">Executor status unavailable: {error}</p>;
  if (!data) return <p className="loading">Reading executor status…</p>;
  const e = data.executor;
  return (
    <p className="mono" style={{ fontSize: 13, margin: "14px 0 0" }}>
      <span className={`tag ${e.verified ? "ok" : "warn"}`}>{e.verified ? "executor verified" : "executor not verified"}</span>{" "}
      {e.address && (
        <a href={explorerAddress(e.address)} target="_blank" rel="noreferrer">
          {short(e.address)}
        </a>
      )}{" "}
      · v{e.version} · fee {e.protocolFeeBps} bps{e.paused ? " · paused" : ""}
    </p>
  );
}

export function LivePreview() {
  const now = useNow(5000);
  const m = useApi<MarketsSnapshot>("/api/markets", 30_000);
  const r = useApi<RoutesSnapshot>("/api/routes?settlement=USDG&maxHops=3", 30_000);
  if (m.error || r.error) return <div className="panel"><p className="err panel-body">A read failed, so nothing is shown in its place: {m.error ?? r.error}</p></div>;
  if (!m.data || !r.data) return <div className="panel"><p className="loading">Reading pool state and the latest route scan…</p></div>;
  const spreads = m.data.markets
    .filter((x) => x.rawSpreadBps !== null)
    .sort((a, b) => (b.rawSpreadBps ?? 0) - (a.rawSpreadBps ?? 0))
    .slice(0, 6);
  const top = r.data.quoted.slice(0, 5);
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">{m.data.meta.network} · pools & routes</span>
        <span className="num faint" style={{ marginLeft: "auto", fontSize: 12 }}>
          block {blockNo(m.data.meta.block)} · read {ago(m.readAt ?? now, now)}
        </span>
      </div>
      <div className="side-grid" style={{ marginTop: 0, gap: 0 }}>
        <div className="panel-body" style={{ borderRight: "1px solid var(--rule)" }}>
          <h3 className="label" style={{ margin: "0 0 10px" }}>Widest raw spreads</h3>
          <table className="tbl">
            <thead>
              <tr><th>Asset</th><th className="r">Pools</th><th className="r">Raw spread</th></tr>
            </thead>
            <tbody>
              {spreads.map((s) => (
                <tr key={s.stock.address}>
                  <td><b className="mono">{s.stock.symbol}</b> <span className="faint" style={{ fontSize: 12 }}>{s.stock.name}</span></td>
                  <td className="r num">{s.pools.filter((p) => p.state === "routable").length}</td>
                  <td className="r num">{bps(s.rawSpreadBps)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel-body">
          <h3 className="label" style={{ margin: "0 0 10px" }}>
            Closest cycles · {r.data.eligible} eligible
          </h3>
          <table className="tbl">
            <thead>
              <tr><th>Route</th><th className="r">Est. net</th></tr>
            </thead>
            <tbody>
              {top.map((q) => (
                <tr key={q.id}>
                  <td><RoutePath quote={q} compact /></td>
                  <td className={`r num ${q.verdict === "eligible" ? "pos" : "neg"}`}>{signed(q.netResult)} {q.settlement.symbol}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type Cap = "live" | "limited" | "off" | "checking";
function capsFrom(st: StatusSnapshot | null, err: string | null): Record<string, { s: Cap; d: string }> {
  if (err) return Object.fromEntries(["scan", "quote", "simulate", "execute", "history"].map((k) => [k, { s: "off" as Cap, d: "Status read failed." }]));
  if (!st) return Object.fromEntries(["scan", "quote", "simulate", "execute", "history"].map((k) => [k, { s: "checking" as Cap, d: "Reading the network…" }]));
  const ex = st.executor;
  return {
    scan: { s: "live", d: `Pools read at block ${blockNo(st.head.block)}.` },
    quote: { s: "live", d: "QuoterV2 per hop, V2 from same-block reserves." },
    simulate: { s: "live", d: st.simulation.mode === "deployed" ? "Against the deployed executor." : "Preview via state override." },
    execute: ex.verified && !ex.paused ? { s: "live", d: "Verified executor, not paused." } : { s: "limited", d: ex.paused ? "Executor paused." : "No verified executor." },
    history: ex.verified ? { s: "live", d: "From CycleExecuted events + receipts." } : { s: "off", d: "Needs a verified executor." },
  };
}

const capTag = (c: Cap) => (c === "live" ? "ok" : c === "limited" ? "warn" : c === "checking" ? "off" : "bad");
const capText = (c: Cap) => (c === "live" ? "connected" : c === "limited" ? "limited" : c === "checking" ? "checking" : "not connected");

export function ProductCards() {
  const { data, error } = useStatus();
  const caps = capsFrom(data, error);
  const items = [
    { k: "scan", n: "01", t: "Scanner", sub: "Every verified pool, one block.", p: "Pools come straight from the canonical factories for issuer-verified stock tokens. Each is read at a single block and depth-probed with a real quote. Closed cycles are ranked, then quoted hop by hop — and a rejected route always says why.", href: "/app", go: "Open the scanner" },
    { k: "simulate", n: "02", t: "Simulation", sub: "The exact call, before you sign.", p: "Spread, quoted output, pool fees, protocol fee and gas each get their own line. The executor call runs with your wallet, amount, minimum and deadline. Change any input and the result is thrown away.", href: "/app", go: "Simulate a route" },
    { k: "execute", n: "03", t: "Execution", sub: "Atomic, from your own wallet.", p: "A flash swap funds the whole cycle inside one transaction. The contract repays the pool, checks your minimum and pays you the measured gain. The button unlocks only when executor, fresh simulation and wallet all agree.", href: "/docs#executor", go: "How execution works" },
  ];
  return (
    <div className="cards c3">
      {items.map((i) => (
        <article key={i.k}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="mono sig">{i.n}</span>
            <span className={`tag ${capTag(caps[i.k].s)}`}>{capText(caps[i.k].s)}</span>
          </div>
          <h3>{i.t}</h3>
          <p className="sub">{i.sub}</p>
          <p>{i.p}</p>
          <p className="faint mono" style={{ fontSize: 12 }}>{caps[i.k].d}</p>
          <Link className="go" href={i.href}>{i.go} →</Link>
        </article>
      ))}
    </div>
  );
}

export function CapabilityGrid() {
  const { data, error } = useStatus();
  const caps = capsFrom(data, error);
  return (
    <div className="cards c5">
      {Object.entries(caps).map(([k, v]) => (
        <div key={k}>
          <span className="label">{k}</span>
          <span className={`tag ${capTag(v.s)}`}>{capText(v.s)}</span>
          <p style={{ fontSize: 13 }}>{v.d}</p>
        </div>
      ))}
    </div>
  );
}

export function IntegrationsTable() {
  const { data } = useStatus();
  const ex = data?.executor;
  const rows: { n: string; role: string; tag: string; state: string; d: string; href?: string }[] = [
    { n: `${BRAND.chainName} (${BRAND.chainId})`, role: "Network", tag: data ? "ok" : "off", state: data ? `head ${blockNo(data.head.block)}` : "checking", d: "ETH for gas · Blockscout explorer" },
    { n: "Stock token registry", role: "Assets", tag: "ok", state: "verified", d: "Issuer list; every contract is checked on-chain against the issuer beacon. Tickers are never trusted on their own." },
    { n: "Uniswap V2", role: "Pools · flash swaps", tag: "ok", state: "supported", d: "Canonical factory, constant-product math on same-block reserves, uniswapV2Call flash swaps.", href: data?.adapters.find((a) => a.id === "v2")?.address },
    { n: "Uniswap V3 + QuoterV2", role: "Pools · quotes · flash swaps", tag: "ok", state: "supported", d: "Canonical factory, official QuoterV2, uniswapV3SwapCallback; tiers 0.01 / 0.05 / 0.30 / 1 %.", href: data?.adapters.find((a) => a.id === "v3")?.address },
    { n: "Uniswap v4", role: "Pools", tag: "warn", state: "listed, not routed", d: "Hooks can rewrite fees and pricing, and there is no v4 adapter." },
    { n: "Chainlink ETH/USD · USDG/USD", role: "Gas valuation check", tag: "off", state: "cross-check only", d: "Confirms or vetoes the pool rate used to value gas. Never prices a trade. No sequencer-uptime feed exists on this chain." },
    { n: "KerfExecutor", role: "Execution", tag: ex ? (ex.verified ? "ok" : "warn") : "off", state: ex ? (ex.verified ? `v${ex.version} verified` : "unverified") : "checking", d: ex ? `Protocol fee ${ex.protocolFeeBps} bps · ${ex.paused ? "paused" : "accepting executions"}` : "Reading the executor…", href: ex?.address ?? undefined },
    { n: `${BRAND.chainName} testnet`, role: "Network", tag: "off", state: "not used", d: "No Uniswap deployment is listed there, so nothing could be verified." },
    { n: "Security audit", role: "Contract", tag: "bad", state: "none", d: "Unit tests on real Uniswap bytecode and mainnet-fork tests — but no independent audit." },
  ];
  return (
    <div className="tbl-wrap panel">
      <table className="tbl stack">
        <caption className="sr-only">Integrations and their status</caption>
        <thead>
          <tr><th>Integration</th><th>Role</th><th>State</th><th>Detail</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.n}>
              <td data-l="Integration"><b>{r.href ? <a href={explorerAddress(r.href)} target="_blank" rel="noreferrer">{r.n} ↗</a> : r.n}</b></td>
              <td data-l="Role" className="muted">{r.role}</td>
              <td data-l="State"><span className={`tag ${r.tag}`}>{r.state}</span></td>
              <td data-l="Detail" className="full muted" style={{ fontSize: 13 }}>{r.d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TokenCard() {
  const { data, error } = useApi<TokenInfo>("/api/token");
  const [copied, setCopied] = useState(false);
  if (error) return <div className="panel"><p className="err panel-body">Token read failed: {error}</p></div>;
  if (!data) return <div className="panel"><p className="loading">Reading ${BRAND.token}…</p></div>;
  const copy = async () => {
    if (!data.address) return;
    try {
      await navigator.clipboard.writeText(data.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };
  return (
    <div className="panel side-grid" style={{ marginTop: 0, gap: 0 }}>
      <div className="panel-body" style={{ borderRight: "1px solid var(--rule)", display: "grid", gap: 14, alignContent: "start" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span className="label">{BRAND.chainName} · {BRAND.chainId}</span>
          <span className={`tag ${data.status === "live" ? "go" : "off"}`}>{data.status}</span>
        </div>
        <span className="label">Contract address</span>
        <span className="addr" style={{ fontSize: 15 }}>{data.address ?? "Soon — published here first."}</span>
        {data.address && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
            <a className="btn btn-sm btn-quiet" href={explorerAddress(data.address)} target="_blank" rel="noreferrer">View on explorer ↗</a>
          </div>
        )}
      </div>
      <div className="panel-body inset">
        <span className="label">Read at block {blockNo(data.block)}</span>
        <dl className="kv" style={{ marginTop: 12 }}>
          <dt>Name</dt><dd>{data.name}</dd>
          <dt>Symbol</dt><dd>{data.symbol}</dd>
          <dt>Decimals</dt><dd>{data.decimals}</dd>
          <dt>Total supply</dt><dd>{num(data.totalSupply, 0)}</dd>
          <dt>Market<small>{data.market ? "" : data.marketReason}</small></dt>
          <dd>{data.market ? `${data.market.price} · ${data.market.venue}` : "none"}</dd>
        </dl>
      </div>
    </div>
  );
}
