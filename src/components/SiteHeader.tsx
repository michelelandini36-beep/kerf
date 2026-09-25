"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BRAND, xUrl } from "@/lib/brand";
import { Logo } from "./Logo";
import { TokenPill } from "./TokenPill";
import { Burger, useMenu } from "./useMenu";
import { XIcon } from "./XIcon";

const NAV = [
  { href: "/#method", label: "Method" },
  { href: "/#product", label: "Product" },
  { href: "/#transparency", label: "Transparency" },
  { href: "/docs", label: "Docs" },
];

const d = (s: number) => ({ "--d": `${s}s` }) as React.CSSProperties;

export function SiteHeader() {
  const path = usePathname();
  const overlay = path === "/";
  const menu = useMenu();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!overlay) return;
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [overlay]);

  return (
    <>
      <div className="menu-backdrop" onClick={menu.close} />
      <header className={`hdr ${overlay ? "over" : ""} ${scrolled ? "scrolled" : ""}`}>
        <div className="wrap">
          <div className="hdr-row">
            <span className="appear appear--scale" style={d(0.08)}>
              <Logo />
            </span>
            <nav className="main" aria-label="Primary">
              {NAV.map((n, i) => (
                <Link key={n.href} href={n.href} className={`metal appear ${i % 2 ? "appear--soft" : "appear--scale"}`} style={d(0.16 + i * 0.12)}>
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="hdr-end appear appear--scale" style={d(0.34)}>
              <TokenPill />
              <a className="xlink" href={xUrl()} target="_blank" rel="noreferrer" aria-label={`${BRAND.name} on X`}>
                <XIcon />
              </a>
              <Link href="/app" className="btn btn-solid cta-desk">
                Open the bench
              </Link>
              <Burger open={menu.open} onClick={menu.toggle} />
            </div>
          </div>
        </div>
      </header>
      <nav id="mnav" className="mobile-nav" aria-label="Mobile" aria-hidden={!menu.open}>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="metal" onClick={menu.close} tabIndex={menu.open ? 0 : -1}>
            {n.label}
          </Link>
        ))}
        <Link href="/app" className="btn btn-solid" style={{ height: 56, fontSize: 17, borderRadius: 10 }} onClick={menu.close} tabIndex={menu.open ? 0 : -1}>
          Open the bench
        </Link>
        <div className="row">
          <TokenPill />
          <a className="pill" href={xUrl()} target="_blank" rel="noreferrer" tabIndex={menu.open ? 0 : -1}>
            @{BRAND.xHandle} ↗
          </a>
        </div>
      </nav>
    </>
  );
}
