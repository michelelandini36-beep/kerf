"use client";
import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import type { TokenInfo } from "@/lib/data/types";
import { short } from "@/lib/format";

// Before launch: links to the token section. After launch: one click copies the full CA.
export function TokenPill({ className = "" }: { className?: string }) {
  const { data } = useApi<TokenInfo>("/api/token");
  const [copied, setCopied] = useState(false);
  const addr = data?.address ?? null;

  if (!addr) {
    return (
      <Link href="/#token" className={`pill ca ${className}`} title="Token contract address">
        <b>${BRAND.token}</b>
        <span className="faint">CA</span>
        <span>{data ? "soon" : "…"}</span>
      </Link>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };
  return (
    <button type="button" onClick={copy} className={`pill ca ${className}`} title={`Copy ${addr}`}>
      <b>${BRAND.token}</b>
      <span className="faint">CA</span>
      <span>{copied ? "Copied" : short(addr, 6, 4)}</span>
    </button>
  );
}
