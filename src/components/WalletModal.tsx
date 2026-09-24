"use client";
import { useEffect } from "react";
import { BRAND, explorerAddress } from "@/lib/brand";
import { useWallet } from "@/lib/wallet";

export function WalletModal() {
  const w = useWallet();
  useEffect(() => {
    if (!w.pickerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && w.closePicker();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [w]);
  if (!w.pickerOpen) return null;
  const wrongChain = w.address && w.chainId !== BRAND.chainId;
  return (
    <>
      <div className="scrim" onClick={w.closePicker} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="wm-t">
        <div className="panel-head">
          <strong id="wm-t">{w.address ? "Wallet" : "Connect a wallet"}</strong>
          <button type="button" className="btn btn-sm btn-quiet" style={{ marginLeft: "auto" }} onClick={w.closePicker}>
            Close ✕
          </button>
        </div>
        {w.address ? (
          <div className="panel-body" style={{ display: "grid", gap: 14 }}>
            <dl className="kv">
              <dt>Account</dt>
              <dd>
                <a href={explorerAddress(w.address)} target="_blank" rel="noreferrer" className="addr">
                  {w.address.slice(0, 10)}…{w.address.slice(-6)}
                </a>
              </dd>
              <dt>Connector</dt>
              <dd>{w.kind === "demo" ? "Demo wallet" : "Browser wallet"}</dd>
              <dt>Network</dt>
              <dd className={wrongChain ? "sig" : ""}>{w.chainId === BRAND.chainId ? `${BRAND.chainName} (${BRAND.chainId})` : `chain ${w.chainId ?? "?"}`}</dd>
              <dt>Gas balance</dt>
              <dd>{w.balanceEth === null ? "—" : `${w.balanceEth.toFixed(5)} ETH`}</dd>
            </dl>
            {wrongChain && (
              <button type="button" className="btn btn-signal" onClick={w.switchChain}>
                Switch to {BRAND.chainName}
              </button>
            )}
            <button type="button" className="btn btn-quiet" onClick={w.disconnect}>
              Disconnect
            </button>
          </div>
        ) : (
          <div>
            <button type="button" className="opt" disabled={!w.hasInjected} onClick={() => w.connect("injected")}>
              <strong>Browser wallet</strong>
              <span className="label">{w.hasInjected ? "detected" : "not found"}</span>
              <small>Any EIP-1193 wallet in this browser. Your account, network and ETH balance are read from it.</small>
            </button>
            <button type="button" className="opt" onClick={() => w.connect("demo")}>
              <strong>Demo wallet</strong>
              <span className="label">no install</span>
              <small>A funded placeholder account so you can walk through simulation and execution. Nothing is signed.</small>
            </button>
            {w.error && <p className="err" style={{ padding: "0 16px" }}>{w.error}</p>}
            <p className="faint" style={{ fontSize: 12, padding: "12px 16px", margin: 0 }}>
              Browsing, quoting and simulating never need a wallet. Connect one only to execute.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
