"use client";
import { useEffect, useMemo, useState } from "react";
import { api, useApi } from "@/lib/api";
import { explorerAddress, explorerTx } from "@/lib/brand";
import type { ActivityPage, Execution } from "@/lib/data/types";
import { loadLocal } from "@/lib/execution";
import { blockNo, num, short, utc } from "@/lib/format";
import { useWallet } from "@/lib/wallet";

const CONF: Record<Execution["confirmation"], { tag: string; label: string }> = {
  l2: { tag: "warn", label: "on L2" },
  safe: { tag: "ok", label: "batch on L1 (safe)" },
  finalized: { tag: "go", label: "finalized on L1" },
};

const dp = (sym: string) => (sym === "WETH" ? 8 : 6);

function toCsv(rows: Execution[]) {
  const head = ["tx_hash", "block", "timestamp_utc", "caller", "settlement", "path", "amount_in", "gross_profit", "user_profit", "protocol_fee", "gas_eth", "confirmation"];
  const lines = rows.map((r) =>
    [r.txHash, r.block, utc(r.timestamp), r.caller, r.settlement.symbol, r.path.join(">"), r.amountIn.toFixed(dp(r.settlement.symbol)), r.grossProfit.toFixed(dp(r.settlement.symbol)), r.userProfit.toFixed(dp(r.settlement.symbol)), r.protocolFee.toFixed(dp(r.settlement.symbol)), r.gasEth.toFixed(18), r.confirmation].join(","),
  );
  return [head.join(","), ...lines].join("\n");
}

export function HistoryView() {
  const w = useWallet();
  const [scope, setScope] = useState<"mine" | "all">("all");
  const [page, setPage] = useState(1);
  const [local, setLocal] = useState<Execution[]>([]);
  const [exporting, setExporting] = useState(false);
  const caller = scope === "mine" ? w.address : null;
  const url = scope === "mine" && !w.address ? null : `/api/activity?page=${page}&limit=25${caller ? `&caller=${caller}` : ""}`;
  const { data, error, loading } = useApi<ActivityPage>(url, 60_000);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal(loadLocal());
  }, []);

  const localRows = useMemo(() => (page === 1 ? local.filter((l) => !caller || l.caller.toLowerCase() === caller.toLowerCase()) : []), [local, page, caller]);
  const rows = [...localRows, ...(data?.rows ?? [])];

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: Execution[] = [...localRows];
      let p = 1;
      for (;;) {
        const d = await api<ActivityPage>(`/api/activity?page=${p}&limit=100${caller ? `&caller=${caller}` : ""}`);
        all.push(...d.rows);
        if (p >= d.pages) break;
        p++;
      }
      const blob = new Blob([toCsv(all)], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `kerf-executions-${scope}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="wrap tpage">
      <div className="thead">
        <div>
          <span className="label">History</span>
          <h1>Executions</h1>
          <p className="desc">
            Each row is a CycleExecuted event from the verified executor, with gas and time taken from its receipt. Proceeds are what the contract paid out; gas is
            what the transaction cost. They are netted only when both are in ETH — no historical price conversion is claimed.
          </p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div className="seg" role="group" aria-label="Scope">
            <button type="button" aria-pressed={scope === "mine"} onClick={() => { setScope("mine"); setPage(1); }}>My wallet</button>
            <button type="button" aria-pressed={scope === "all"} onClick={() => { setScope("all"); setPage(1); }}>All executions</button>
          </div>
          <span className="faint" style={{ fontSize: 13 }}>{scope === "mine" ? (w.address ? short(w.address) : "no wallet") : "All executions"}</span>
          <button type="button" className="btn btn-sm btn-quiet" style={{ marginLeft: "auto" }} disabled={!rows.length || exporting} onClick={exportCsv}>
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
        {scope === "mine" && !w.address ? (
          <div className="empty">
            <p>Connect a wallet to see the executions it signed.</p>
            <button type="button" className="btn btn-sm btn-signal" onClick={w.openPicker}>Connect wallet</button>
          </div>
        ) : error && !data ? (
          <p className="err panel-body">{error}</p>
        ) : !data ? (
          <p className="loading">Reading executor events…</p>
        ) : rows.length === 0 ? (
          <p className="empty">No executions yet{caller ? " from this wallet" : ""}. That is normal: most blocks have no eligible route.</p>
        ) : (
          <>
            <div className="tbl-wrap">
              <table className="tbl stack">
                <thead>
                  <tr><th>Time (UTC)</th><th>Caller</th><th>Route</th><th className="r">Flash</th><th className="r">Proceeds</th><th className="r">Fee</th><th className="r">Gas (ETH)</th><th className="r">Net</th><th>Confirmation</th><th>Tx</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const sym = r.settlement.symbol;
                    const net = sym === "WETH" ? r.userProfit - r.gasEth : null;
                    const isLocal = localRows.includes(r);
                    return (
                      <tr key={r.txHash}>
                        <td data-l="Time" className="num">{utc(r.timestamp).slice(5, 16)}<br /><span className="faint" style={{ fontSize: 11 }}>block {blockNo(r.block)}</span></td>
                        <td data-l="Caller" className="num"><a href={explorerAddress(r.caller)} target="_blank" rel="noreferrer">{short(r.caller)}</a></td>
                        <td data-l="Route" className="mono" style={{ fontSize: 12 }}>{r.path.join(" → ")}</td>
                        <td data-l="Flash" className="r num">{num(r.amountIn, 2)} {sym}</td>
                        <td data-l="Proceeds" className="r num pos">+{num(r.userProfit, dp(sym))}</td>
                        <td data-l="Fee" className="r num">{num(r.protocolFee, 2)}</td>
                        <td data-l="Gas" className="r num">{r.gasEth.toFixed(9)}</td>
                        <td data-l="Net" className="r num">{net === null ? <span className="faint" title="Proceeds and gas are different assets">n/a</span> : num(net, 8)}</td>
                        <td data-l="Confirmation"><span className={`tag ${CONF[r.confirmation].tag}`}>{isLocal ? "this browser" : CONF[r.confirmation].label}</span></td>
                        <td data-l="Tx" className="num"><a href={explorerTx(r.txHash)} target="_blank" rel="noreferrer">{short(r.txHash)} ↗</a></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span className="faint">{data.total + localRows.length} executions · head {blockNo(data.head.latest)} · safe {blockNo(data.head.safe)} · final {blockNo(data.head.finalized)}</span>
              <button type="button" className="btn btn-sm btn-quiet" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>← Prev</button>
              <span>{data.page} / {data.pages}</span>
              <button type="button" className="btn btn-sm btn-quiet" disabled={page >= data.pages || loading} onClick={() => setPage((p) => p + 1)}>Next →</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
