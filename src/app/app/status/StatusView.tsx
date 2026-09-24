"use client";
import { useApi, useNow } from "@/lib/api";
import { explorerAddress, explorerBlock } from "@/lib/brand";
import type { StatusSnapshot } from "@/lib/data/types";
import { ago, blockNo, short } from "@/lib/format";

export function StatusView() {
  const now = useNow(1000);
  const { data: s, error, loading, readAt, refresh } = useApi<StatusSnapshot>("/api/status", 15_000);
  const age = (ts: number) => ago(ts * 1000, now);
  return (
    <div className="wrap tpage">
      <div className="thead">
        <div>
          <span className="label">Status</span>
          <h1>Network, data and integrations</h1>
          <p className="desc">
            Each line comes from a real read made by this server, or from the verified registry with its source. Nothing is marked operational because it was
            planned; a missing dependency says exactly what is missing.
          </p>
        </div>
        <button type="button" className="btn" onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
      </div>
      {error && <p className="err">Status read failed: {error}{s ? " — showing the last good read." : ""}</p>}
      {!s ? (
        <div className="panel"><p className="loading">Reading network status…</p></div>
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          <div className="kpis">
            <div><span className="label">Head</span><div className="v"><a href={explorerBlock(s.head.block)} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>{blockNo(s.head.block)}</a></div><span className="faint num" style={{ fontSize: 12 }}>{age(s.head.timestamp)}</span></div>
            <div><span className="label">Safe (L1 batch)</span><div className="v">{blockNo(s.safe.block)}</div><span className="faint num" style={{ fontSize: 12 }}>{age(s.safe.timestamp)}</span></div>
            <div><span className="label">Finalized</span><div className="v">{blockNo(s.finalized.block)}</div><span className="faint num" style={{ fontSize: 12 }}>{age(s.finalized.timestamp)}</span></div>
            <div><span className="label">Gas price</span><div className="v">{s.gasPriceGwei.toFixed(4)}</div><span className="faint num" style={{ fontSize: 12 }}>gwei</span></div>
            <div><span className="label">RPC latency</span><div className="v">{s.head.latencyMs}</div><span className="faint num" style={{ fontSize: 12 }}>ms · {s.network.rpcKind}</span></div>
          </div>

          <div className="side-grid" style={{ marginTop: 0 }}>
            <section className="panel">
              <div className="panel-head"><strong>Network</strong><span className="tag ok" style={{ marginLeft: "auto" }}>reachable</span></div>
              <div className="panel-body">
                <dl className="kv">
                  <dt>Name</dt><dd>{s.network.name}</dd>
                  <dt>Chain id</dt><dd>{s.network.chainId}</dd>
                  <dt>RPC host<small>{s.network.rpcKind === "public" ? "Public endpoint — rate-limited; set KERF_RPC_URL for production." : "Provider endpoint."}</small></dt><dd>{s.network.rpcHost}</dd>
                  <dt>Explorer</dt><dd><a href={s.network.explorer} target="_blank" rel="noreferrer">{s.network.explorer.replace("https://", "")} ↗</a></dd>
                  <dt>Last read</dt><dd>{readAt ? ago(readAt, now) : "—"}</dd>
                </dl>
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">
                <strong>Executor</strong>
                <span className={`tag ${s.executor.verified ? "ok" : "bad"}`} style={{ marginLeft: "auto" }}>{s.executor.verified ? "verified" : "unverified"}</span>
              </div>
              <div className="panel-body" style={{ display: "grid", gap: 14 }}>
                <dl className="kv">
                  <dt>Address</dt><dd>{s.executor.address ? <a href={explorerAddress(s.executor.address)} target="_blank" rel="noreferrer">{short(s.executor.address)} ↗</a> : "not configured"}</dd>
                  <dt>Version</dt><dd>{s.executor.version}</dd>
                  <dt>Protocol fee</dt><dd>{s.executor.protocolFeeBps} bps</dd>
                  <dt>Paused</dt><dd>{s.executor.paused ? "yes" : "no"}</dd>
                  <dt>Owner</dt><dd>{short(s.executor.owner)}</dd>
                  <dt>Fee recipient</dt><dd>{short(s.executor.feeRecipient)}</dd>
                  <dt>Simulation<small>{s.simulation.label}</small></dt><dd>{s.simulation.mode}</dd>
                </dl>
                <ul className="checklist">
                  {s.executor.checks.map((c) => (
                    <li key={c.label} className={c.ok ? "ok" : "no"}><span className="mk">{c.ok ? "✓" : "✕"}</span><span>{c.label}<small className="mono">{c.detail}</small></span></li>
                  ))}
                </ul>
              </div>
            </section>
          </div>

          <section className="panel">
            <div className="panel-head"><strong>Adapters</strong></div>
            <div className="tbl-wrap">
              <table className="tbl stack">
                <thead><tr><th>Venue</th><th>State</th><th>Contract</th><th>Detail</th></tr></thead>
                <tbody>
                  {s.adapters.map((a) => (
                    <tr key={a.id}>
                      <td data-l="Venue"><b>{a.label}</b></td>
                      <td data-l="State"><span className={`tag ${a.status === "supported" ? "ok" : "warn"}`}>{a.status}</span></td>
                      <td data-l="Contract" className="num"><a href={explorerAddress(a.address)} target="_blank" rel="noreferrer">{short(a.address)} ↗</a></td>
                      <td data-l="Detail" className="full muted" style={{ fontSize: 13 }}>{a.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><strong>Registry provenance</strong></div>
            <div className="tbl-wrap">
              <table className="tbl stack">
                <thead><tr><th>Entry</th><th>Source</th><th>Method</th><th className="r">Verified</th></tr></thead>
                <tbody>
                  {s.registry.map((r) => (
                    <tr key={r.label}>
                      <td data-l="Entry"><b>{r.label}</b></td>
                      <td data-l="Source" className="full muted" style={{ fontSize: 13 }}>{r.source}</td>
                      <td data-l="Method" className="full muted" style={{ fontSize: 13 }}>{r.method}</td>
                      <td data-l="Verified" className="r num">{r.verifiedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
