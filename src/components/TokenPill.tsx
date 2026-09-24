"use client";
import Link from "next/link";
import { useApi } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import type { TokenInfo } from "@/lib/data/types";
import { short } from "@/lib/format";

export function TokenPill({ className = "" }: { className?: string }) {
  const { data } = useApi<TokenInfo>("/api/token");
  return (
    <Link href="/#token" className={`pill ca ${className}`} title="Token contract address">
      <b>${BRAND.token}</b>
      <span className="faint">CA</span>
      <span>{data ? (data.address ? short(data.address, 6, 4) : "soon") : "…"}</span>
    </Link>
  );
}
