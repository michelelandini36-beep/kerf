"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, useApi, useNow } from "@/lib/api";
import { BRAND, explorerAddress, explorerBlock, explorerTx } from "@/lib/brand";
import type { QuoteResponse, RouteQuote, StatusSnapshot } from "@/lib/data/types";
import { submitCycle, type TxPhase, type TxUpdate } from "@/lib/execution";
import { blockNo, bps, feeLabel, num, price, short, signed, utc } from "@/lib/format";
import { useWallet } from "@/lib/wallet";
import { RoutePath } from "../RoutePath";

const TOLERANCES = [0.9, 0.75, 0.5, 0.25];
const DEADLINES = [30, 60, 120, 300, 600];
const SIM_TTL_MS = 30_000;
const DEADLINE_MARGIN_S = 20;

export const VERDICT: Record<string, { tag: string; title: string; text: string }> = {
  eligible: { tag: "go", title: "Eligible estimate", text: "Positive after pool fees, price impact, protocol fee and gas at this block." },
  "no-profit": { tag: "off", title: "Negative estimated result", text: "After pool fees and price impact the loop hands back less than it borrowed at this block." },
  "gas-exceeds": { tag: "warn", title: "Gas exceeds profit", text: "The loop is positive before gas, but gas costs more than it earns." },
  incomplete: { tag: "warn", title: "Net incomplete", text: "Gas could not be valued with a credible same-block rate, so the net is unknown." },
};

const PHASES: TxPhase[] = ["resimulating", "awaiting-wallet", "submitted", "pending", "confirmed"];
const PHASE_LABEL: Record<TxPhase, string> = {
  resimulating: "Re-simulated",
  "awaiting-wallet": "Awaiting wallet",
  submitted: "Submitted",
  pending: "Pending",
  confirmed: "Confirmed",
  reverted: "Reverted",
  rejected: "Rejected in wallet",
};

const dp = (sym: string) => (sym === "WETH" ? 8 : 6);

export function RoutePanel({ routeId, initialAmount, initialQuote, onClose }: { routeId: string; initialAmount: number | null; initialQuote: RouteQuote | null; onClose: () => void }) {
  const now = useNow(1000);
  const wallet = useWallet();
  const { data: status } = useApi<StatusSnapshot>("/api/status");
  const [quote, setQuote] = useState<RouteQuote | null>(initialQuote);
  const [amount, setAmount] = useState<string>(initialAmount ? String(+initialAmount.toFixed(6)) : initialQuote ? String(+initialQuote.amountIn.toFixed(6)) : "");
  const [tolerance, setTolerance] = useState(0.5);
  const [deadline, setDeadline] = useState(120);
  const [floor, setFloor] = useState("");
  const [busy, setBusy] = useState<"quote" | "sim" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sim, setSim] = useState<{ res: QuoteResponse; key: string; at: number } | null>(null);
  const [review, setReview] = useState(false);
  const [tx, setTx] = useState<TxUpdate[] | null>(null);
  const cancel = useRef({ cancelled: false });

  const amountNum = Number(amount);
  const sym = quote?.settlement.symbol ?? (routeId.startsWith("WETH") ? "WETH" : "USDG");
  const gasFloor = quote?.gasSettlement ?? 0;
  const floorNum = floor.trim() === "" ? gasFloor : Number(floor);
  const minProfit = quote ? Math.max(floorNum, (quote.netResult ?? 0) > 0 ? (quote.netResult ?? 0) * tolerance : 0) : 0;
  const key = JSON.stringify([routeId, amountNum, tolerance, deadline, floorNum, wallet.address]);

  const requote = useCallback(
    async (amt?: number) => {
      const a = amt ?? amountNum;
      if (!(a > 0)) return setError("Enter a positive flash amount.");
      setBusy("quote");
      setError(null);
      try {
        const r = await api<QuoteResponse>("/api/quote", { method: "POST", body: JSON.stringify({ routeId, amountIn: a }) });
        setQuote(r.quote);
        if (!amount) setAmount(String(+r.quote.amountIn.toFixed(6)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Quote failed");
      } finally {
        setBusy(null);
      }
    },
    [routeId, amountNum, amount],
  );

  // First open from a shared link: fetch a quote for the given amount.
  useEffect(() => {
    if (!initialQuote) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      requote(initialAmount ?? 10);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !tx && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, tx]);

  const simulate = async () => {
    if (!(amountNum > 0)) return setError("Enter a positive flash amount.");
    setBusy("sim");
    setError(null);
    try {
      const r = await api<QuoteResponse>("/api/quote", {
        method: "POST",
        body: JSON.stringify({ routeId, amountIn: amountNum, simulate: true, from: wallet.address, minProfit, deadlineSec: deadline }),
      });
      setQuote(r.quote);
      setSim({ res: r, key, at: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setBusy(null);
    }
  };

  const expired = quote ? now > quote.expiresAt : false;
  const simMatches = sim !== null && sim.key === key;
  const simFresh = sim !== null && now - sim.at < SIM_TTL_MS && (sim.res.simulation?.deadlineAt ?? 0) * 1000 - now > DEADLINE_MARGIN_S * 1000;
  const simValid = simMatches && simFresh && Boolean(sim?.res.simulation?.ok);

  const checks = useMemo(() => {
    const onChain = wallet.chainId === BRAND.chainId;
    const gasOk = wallet.balanceEth !== null && quote ? wallet.balanceEth >= quote.gasEth * 1.5 : false;
    return [
      { ok: Boolean(wallet.address), t: "Wallet connected", d: wallet.address ? short(wallet.address) : "Connect a wallet to sign. Quoting and simulating work without one." },
      { ok: Boolean(wallet.address) && onChain, t: `Wallet on ${BRAND.chainName} (${BRAND.chainId})`, d: !wallet.address ? "No wallet connected." : onChain ? "Correct network." : `Wallet is on chain ${wallet.chainId}.` },
      { ok: Boolean(status?.executor.verified && !status.executor.paused), t: "Executor deployed and verified", d: status ? (status.executor.paused ? "Executor is paused." : `v${status.executor.version}`) : "Reading…" },
      { ok: gasOk, t: "Gas balance sufficient", d: wallet.balanceEth === null ? "No balance read yet." : `${wallet.balanceEth.toFixed(5)} ETH available` },
      { ok: Boolean(quote) && !expired, t: "Quote fresh", d: expired ? "Prices move every block. This quote has outlived its 20 s window — refresh it first." : quote ? `${Math.max(0, Math.round((quote.expiresAt - now) / 1000))} s left` : "No quote yet." },
      {
        ok: simValid,
        t: "Simulation matches these exact parameters",
        d: !sim ? "Not simulated yet. Run “Simulate exact call”." : !simMatches ? "Inputs changed since the last simulation." : !simFresh ? "Simulation is too old or too close to its deadline." : sim.res.simulation?.ok ? "Simulated call succeeded." : "Simulated call reverted.",
      },
    ];
  }, [wallet, status, quote, expired, now, sim, simMatches, simFresh, simValid]);

  const ready = checks.every((c) => c.ok);

  const execute = async () => {
    if (!sim || !wallet.address || !wallet.kind) return;
    cancel.current = { cancelled: false };
    setTx([]);
    await submitCycle(sim.res, { address: wallet.address, kind: wallet.kind }, (u) => setTx((prev) => [...(prev ?? []), u]), cancel.current);
  };

  const last = tx?.[tx.length - 1];
  const done = last && ["confirmed", "reverted", "rejected"].includes(last.phase);

  const badges = [
    expired && { tag: "warn", title: "Quote expired", text: "Prices move every block. The quote is older than its lifetime and must be refreshed before anything else." },
    sim && simMatches && sim.res.simulation && !sim.res.simulation.ok && { tag: "bad", title: "Simulation failed", text: "The exact executor call reverted when replayed against the latest block." },
    sim && simMatches && sim.res.simulation?.ok && { tag: "ok", title: "Simulation passed", text: "The exact call succeeded against the latest block." },
    quote && VERDICT[quote.verdict],
  ].filter(Boolean) as { tag: string; title: string; text: string }[];

  const s = sim?.res.simulation;

  return (
    <>
      <div className="scrim" onClick={() => !tx && onClose()} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="rp-t">
        <div className="drawer-head">
          <strong id="rp-t">Route</strong>
          <button type="button" className="btn btn-sm btn-quiet" onClick={onClose} disabled={Boolean(tx && !done)}>
            Close ✕
          </button>
        </div>
        <div className="drawer-body">
          {!quote ? (
            error ? <p className="err">{error}</p> : <p className="loading">Quoting this route at the newest block…</p>
          ) : (
            <>
              <div>
                <RoutePath quote={quote} />
                <p className="faint" style={{ fontSize: 13, margin: "8px 0 0" }}>
                  {quote.hops.length} pools · settles in {sym} · starts and ends in the same asset
                </p>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {badges.map((b) => (
                  <div key={b.title} className="banner" style={{ margin: 0, padding: "10px 12px" }}>
                    <span className={`tag ${b.tag}`}>{b.title}</span>
                    <p>{b.text}</p>
                  </div>
                ))}
              </div>

              <section>
                <div className="field">
                  <label className="label" htmlFor="rp-amt">Flash amount ({sym})</label>
                  <div className="with-btns">
                    <input id="rp-amt" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} />
                    <button type="button" className="btn btn-sm btn-quiet" onClick={() => { const v = +(amountNum / 2).toFixed(6); setAmount(String(v)); requote(v); }}>½×</button>
                    <button type="button" className="btn btn-sm btn-quiet" onClick={() => { const v = +(amountNum * 2).toFixed(6); setAmount(String(v)); requote(v); }}>2×</button>
                  </div>
                  <small>Borrowed from the first pool by flash swap and repaid inside the same transaction. You never supply it.</small>
                </div>
                <div className="field-row" style={{ marginTop: 14 }}>
                  <div className="field">
                    <label className="label" htmlFor="rp-tol">Profit tolerance</label>
                    <select id="rp-tol" className="select" value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))}>
                      {TOLERANCES.map((t) => <option key={t} value={t}>accept down to {t * 100}% of the estimate</option>)}
                    </select>
                    <small>A slippage bound on the profit — the only output a loop has.</small>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="rp-dl">Deadline</label>
                    <select id="rp-dl" className="select" value={deadline} onChange={(e) => setDeadline(Number(e.target.value))}>
                      {DEADLINES.map((d) => <option key={d} value={d}>{d < 60 ? `${d} s` : `${d / 60} min`} after the simulated block</option>)}
                    </select>
                    <small>Chain time. Past it the call reverts instead of landing late.</small>
                  </div>
                </div>
                <div className="field" style={{ marginTop: 14 }}>
                  <label className="label" htmlFor="rp-floor">Minimum profit floor ({sym})</label>
                  <input id="rp-floor" className="input" inputMode="decimal" placeholder={`blank = estimated gas, ${gasFloor.toFixed(dp(sym))}`} value={floor} onChange={(e) => setFloor(e.target.value.replace(",", "."))} />
                  <small>The contract cannot see what you pay for gas. A floor at or above it stops a filled loop from being a net loss.</small>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-sm" onClick={() => requote()} disabled={busy !== null}>{busy === "quote" ? "Quoting…" : "Refresh quote"}</button>
                  <button type="button" className="btn btn-sm btn-signal" onClick={simulate} disabled={busy !== null}>{busy === "sim" ? "Simulating…" : "Simulate exact call"}</button>
                </div>
                {error && <p className="err">{error}</p>}
              </section>

              <section>
                <h3>Cost accounting</h3>
                <p className="num faint" style={{ fontSize: 12, margin: "0 0 10px" }}>
                  block {blockNo(quote.block)} · {Math.round((now - quote.quotedAt) / 1000)}s old · {expired ? "expired" : `expires in ${Math.round((quote.expiresAt - now) / 1000)}s`}
                </p>
                <dl className="kv">
                  <dt>Raw price spread<small>Spot prices after pool fees, before impact. A hint, not a result.</small></dt><dd>{bps(quote.rawEdgeBps)}</dd>
                  <dt>Flash amount</dt><dd>{num(quote.amountIn, dp(sym))} {sym}</dd>
                  <dt>Quoted route output<small>QuoterV2 per hop (V2 from same-block reserves). Fees and impact are inside this figure.</small></dt><dd>{num(quote.cycleOutput, dp(sym))} {sym}</dd>
                  <dt>Trading fees<small>{quote.hops.map((h) => feeLabel(h.feePips)).join(" + ")} — taken by the pools, never subtracted again.</small></dt><dd>in the quote</dd>
                  <dt>Flash-liquidity fee<small>The first pool is repaid in {sym}; its swap fee is the only borrowing cost.</small></dt><dd>in the quote</dd>
                  <dt>Quoted result<small>Output − flash amount.</small></dt><dd className={quote.grossResult > 0 ? "pos" : "neg"}>{signed(quote.grossResult, dp(sym))} {sym}</dd>
                  <dt>Protocol fee ({quote.protocolFeeBps / 100}% of a positive result)<small>Rate read from the deployed executor.</small></dt><dd>{num(quote.protocolFee, dp(sym))} {sym}</dd>
                  <dt>Your result before gas</dt><dd>{signed(quote.grossResult - quote.protocolFee, dp(sym))} {sym}</dd>
                  <dt>Gas estimate<small>= {quote.gasEth.toFixed(9)} ETH</small></dt><dd>{num(quote.gasUnits, 0)} × {quote.gasPriceGwei.toFixed(4)} gwei</dd>
                  <dt>Gas in {sym}<small>Same-block WETH/USDG rate, cross-checked against the oracle.</small></dt><dd>{quote.gasSettlement === null ? "not convertible" : `${num(quote.gasSettlement, dp(sym))} ${sym}`}</dd>
                  <dt><b>Estimated result after costs</b><small>After protocol fee and estimated gas.</small></dt><dd className={(quote.netResult ?? 0) > 0 ? "pos" : "neg"}><b>{signed(quote.netResult, dp(sym))} {sym}</b></dd>
                  <dt>Required minimum result (on-chain)<small>max(floor, {tolerance * 100}% of the estimate). Below it the call reverts.</small></dt><dd>{num(minProfit, dp(sym))} {sym}</dd>
                </dl>
              </section>

              <section>
                <h3>Hop by hop</h3>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>#</th><th>Pool</th><th>In</th><th className="r">Out</th></tr></thead>
                    <tbody>
                      {quote.hops.map((h, i) => (
                        <tr key={i}>
                          <td className="num">{i + 1}</td>
                          <td className="num"><a href={explorerAddress(h.pool)} target="_blank" rel="noreferrer">{short(h.pool)}</a><br /><span className="faint" style={{ fontSize: 11 }}>{h.venue.toUpperCase()} {feeLabel(h.feePips)} · {h.ticksCrossed} ticks</span></td>
                          <td className="num">{price(h.amountIn)} {h.tokenIn.symbol}</td>
                          <td className="r num">{price(h.amountOut)} {h.tokenOut.symbol}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h3>Simulation of the exact call</h3>
                {!s ? (
                  <p className="muted" style={{ fontSize: 14, margin: 0 }}>Not run yet. “Simulate exact call” executes <code className="mono">execute(route, amount, minimum, deadline)</code> in an eth_call at the newest block{wallet.address ? " from your address" : " from a placeholder sender until you connect"}.</p>
                ) : (
                  <>
                    <dl className="kv">
                      <dt>Outcome</dt><dd><span className={`tag ${s.ok ? "ok" : "bad"}`}>{s.ok ? "succeeds" : "reverts"}</span></dd>
                      <dt>Mode<small>A passing simulation is not a guarantee.</small></dt><dd>{s.mode === "deployed" ? "deployed executor" : "preview"}</dd>
                      <dt>Simulated at</dt><dd>{utc(Math.floor(new Date(s.simulatedAt).getTime() / 1000))}</dd>
                      <dt>Block</dt><dd><a href={explorerBlock(s.block)} target="_blank" rel="noreferrer">{blockNo(s.block)}</a></dd>
                      {s.revertName && (<><dt>Revert<small>{s.revertReason}</small></dt><dd>{s.revertName}</dd></>)}
                      <dt>Estimated gas</dt><dd>{s.gasUnits ? num(s.gasUnits, 0) : "not estimated"}</dd>
                      <dt>Minimum-profit condition</dt><dd>≥ {num(s.minProfit, dp(sym))} {sym}</dd>
                      <dt>Deadline<small>{utc(s.deadlineAt)}</small></dt><dd>{Math.max(0, s.deadlineAt - Math.floor(now / 1000))}s left</dd>
                    </dl>
                    <p className="label" style={{ margin: "12px 0 6px" }}>Calldata — the wallet receives exactly these bytes</p>
                    <div className="calldata">{s.calldata}</div>
                    {!simMatches && <p className="err">Inputs changed after this simulation — it no longer applies.</p>}
                  </>
                )}
              </section>

              <section>
                <h3>Execution</h3>
                <ul className="checklist">
                  {checks.map((c) => (
                    <li key={c.t} className={c.ok ? "ok" : "no"}>
                      <span className="mk">{c.ok ? "✓" : "○"}</span>
                      <span>{c.t} <span className="faint">— {c.ok ? "met" : "not met"}</span><small>{c.d}</small></span>
                    </li>
                  ))}
                </ul>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                  {!wallet.address && <button type="button" className="btn btn-sm" onClick={wallet.openPicker}>Connect wallet</button>}
                  {wallet.address && wallet.chainId !== BRAND.chainId && <button type="button" className="btn btn-sm" onClick={wallet.switchChain}>Switch network</button>}
                  <button type="button" className="btn btn-signal" disabled={!ready || Boolean(tx && !done)} onClick={() => setReview(true)}>Review and execute</button>
                </div>
                {review && sim && !tx && (
                  <div className="banner go" style={{ marginTop: 14 }}>
                    <strong>Confirm this cut</strong>
                    <dl className="kv">
                      <dt>Route</dt><dd>{quote.hops.length} hops · {sym}</dd>
                      <dt>Flash amount</dt><dd>{num(amountNum, dp(sym))} {sym}</dd>
                      <dt>Minimum you accept</dt><dd>{num(minProfit, dp(sym))} {sym}</dd>
                      <dt>Deadline</dt><dd>{deadline}s</dd>
                      <dt>Max gas</dt><dd>{quote.gasEth.toFixed(9)} ETH</dd>
                    </dl>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="btn btn-signal btn-sm" onClick={execute}>Sign and send</button>
                      <button type="button" className="btn btn-sm btn-quiet" onClick={() => setReview(false)}>Back</button>
                    </div>
                  </div>
                )}
                {tx && (
                  <div className="panel" style={{ marginTop: 14 }}>
                    <div className="panel-body" style={{ display: "grid", gap: 10 }}>
                      <ol className="txsteps">
                        {PHASES.map((p) => {
                          const seen = tx.some((u) => u.phase === p);
                          return <li key={p} className={last?.phase === p ? "now" : seen ? "done" : ""}>{seen ? "■" : "□"} {PHASE_LABEL[p]}</li>;
                        })}
                        {last && ["reverted", "rejected"].includes(last.phase) && <li className="now">■ {PHASE_LABEL[last.phase]}</li>}
                      </ol>
                      {last?.detail && <p style={{ margin: 0, fontSize: 13 }}>{last.detail}</p>}
                      {last?.txHash && <a className="num" style={{ fontSize: 12 }} href={explorerTx(last.txHash)} target="_blank" rel="noreferrer">tx {short(last.txHash, 10, 6)} ↗</a>}
                      {last?.execution && <p className="pos num" style={{ margin: 0 }}>Received {signed(last.execution.userProfit, dp(sym))} {sym} · see History</p>}
                      {last?.phase === "awaiting-wallet" && <button type="button" className="btn btn-sm btn-quiet" onClick={() => (cancel.current.cancelled = true)}>Reject</button>}
                      {done && <button type="button" className="btn btn-sm" onClick={() => { setTx(null); setReview(false); setSim(null); }}>Done</button>}
                    </div>
                  </div>
                )}
                <p className="faint" style={{ fontSize: 12, marginTop: 14 }}>
                  A passing simulation guarantees neither inclusion nor profit: pool state can shift before the transaction lands, and a reverted transaction still costs gas.
                </p>
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
