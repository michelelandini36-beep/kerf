"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { xUrl, BRAND } from "@/lib/brand";
import { Logo } from "./Logo";
import { TokenPill } from "./TokenPill";
import { XIcon } from "./XIcon";

const NAV = [
  { href: "/#product", label: "Product" },
  { href: "/#method", label: "Method" },
  { href: "/#transparency", label: "Transparency" },
  { href: "/#token", label: "Token" },
  { href: "/docs", label: "Docs" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("hashchange", close);
    return () => window.removeEventListener("hashchange", close);
  }, []);
  return (
    <header className="hdr">
      <div className="wrap">
        <div className="hdr-row">
          <Logo />
          <nav className="main" aria-label="Primary">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="hdr-end">
            <TokenPill />
            <a className="xlink" href={xUrl()} target="_blank" rel="noreferrer" aria-label={`${BRAND.name} on X`}>
              <XIcon />
            </a>
            <Link href="/app" className="btn btn-signal btn-sm cta-desk">
              Open the bench <span className="arrow">→</span>
            </Link>
            <button type="button" className="btn btn-sm btn-quiet menu-btn" aria-expanded={open} aria-controls="mnav" onClick={() => setOpen((o) => !o)}>
              {open ? "Close" : "Menu"}
            </button>
          </div>
        </div>
        {open && (
          <nav id="mnav" className="mobile-nav" aria-label="Mobile">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)}>
                {n.label}
              </Link>
            ))}
            <div className="row">
              <Link href="/app" className="btn btn-signal" onClick={() => setOpen(false)}>
                Open the bench →
              </Link>
              <TokenPill />
              <a className="pill" href={xUrl()} target="_blank" rel="noreferrer">
                @{BRAND.xHandle} ↗
              </a>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
