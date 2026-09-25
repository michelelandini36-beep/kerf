import Link from "next/link";
import { BRAND, xUrl } from "@/lib/brand";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="ftr">
      <div className="wrap">
        <div className="top">
          <div>
            <Logo />
            <p className="tagline">
              Measure the <em>gap</em>. Cut it clean.
            </p>
          </div>
          <nav aria-label="Footer">
            <Link href="/app">Scanner</Link>
            <Link href="/app/pools">Pools</Link>
            <Link href="/app/history">History</Link>
            <Link href="/app/status">Status</Link>
            <Link href="/docs">Docs</Link>
            <Link href="/docs#integrations">Integrations</Link>
            <Link href="/#token">Token</Link>
            <a href={BRAND.explorer} target="_blank" rel="noreferrer">Explorer ↗</a>
            <a href={xUrl()} target="_blank" rel="noreferrer">@{BRAND.xHandle} ↗</a>
          </nav>
        </div>
        <p className="legal">
          {BRAND.name} is independent software with no affiliation to Robinhood Markets, Uniswap Labs or Chainlink. The executor contract has had no
          independent audit. Nothing on this site is financial advice or a promise of return. A transaction can revert and you still pay for its gas.
        </p>
        <div className="base">
          <span>{BRAND.chainName} · chain {BRAND.chainId}</span>
          <span>© 2026 {BRAND.name}</span>
        </div>
      </div>
    </footer>
  );
}
