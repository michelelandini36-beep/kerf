"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApi } from "@/lib/api";
import { BRAND, xUrl } from "@/lib/brand";
import type { StatusSnapshot } from "@/lib/data/types";
import { blockNo, short } from "@/lib/format";
import { useWallet } from "@/lib/wallet";
import { Logo } from "./Logo";
import { TokenPill } from "./TokenPill";
import { WalletModal } from "./WalletModal";
import { XIcon } from "./XIcon";

const NAV = [
  { href: "/app", label: "Scanner" },
  { href: "/app/pools", label: "Pools" },
  { href: "/app/history", label: "History" },
  { href: "/app/status", label: "Status" },
  { href: "/docs", label: "Docs" },
];

export function TerminalHeader({ demo }: { demo: boolean }) {
  const path = usePathname();
  const w = useWallet();
  const { data: st, error } = useApi<StatusSnapshot>("/api/status", 15_000);
  const wrongChain = w.address && w.chainId !== BRAND.chainId;
  return (
    <>
      <header className="hdr">
        <div className="wrap">
          <div className="hdr-row">
            <Logo />
            <nav className="main" aria-label="Terminal">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="metal metal-sm" aria-current={path === n.href ? "page" : undefined}>
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="hdr-end">
              <TokenPill />
              <a className="xlink" href={xUrl()} target="_blank" rel="noreferrer" aria-label={`${BRAND.name} on X`}>
                <XIcon />
              </a>
              {w.address ? (
                <button type="button" className={`btn btn-sm ${wrongChain ? "btn-signal" : "btn-quiet"}`} onClick={w.openPicker}>
                  {wrongChain ? "Wrong network" : <span className="num">{short(w.address)}</span>}
                </button>
              ) : (
                <button type="button" className="btn btn-sm btn-signal" onClick={w.openPicker} disabled={w.status === "connecting"}>
                  {w.status === "connecting" ? "Connecting…" : "Connect wallet"}
                </button>
              )}
            </div>
          </div>
        </div>
        <nav className="wrap tnav-m" aria-label="Terminal sections">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="term-strip">
        <div className="wrap">
          <span className="tag ok">{BRAND.chainName}</span>
          {st ? (
            <>
              <span>head {blockNo(st.head.block)}</span>
              <span>gas {st.gasPriceGwei.toFixed(4)} gwei</span>
              <span>rpc {st.head.latencyMs} ms</span>
              <span className={`tag ${st.executor.verified ? "ok" : "warn"}`}>{st.executor.verified ? "executor verified" : "executor unverified"}</span>
            </>
          ) : error ? (
            <span className="err">status read failed: {error}</span>
          ) : (
            <span>reading network…</span>
          )}
        </div>
      </div>
      {demo && (
        <div className="demo-note">
          <div className="wrap">Demo data — every figure on this bench is generated locally. Set KERF_DATA_SOURCE=http to read a real backend.</div>
        </div>
      )}
      <WalletModal />
    </>
  );
}
