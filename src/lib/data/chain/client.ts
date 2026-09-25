import "server-only";
import { createPublicClient, defineChain, http, type Address } from "viem";
import { REGISTRY } from "@/config/registry";
import tokensJson from "@/config/tokens.json";
import poolsJson from "@/config/pools.json";
import type { Asset } from "../types";

// Server-side chain access. KERF_RPC_URL (a provider endpoint) is preferred;
// the public RPC works but is rate-limited.
export const RPC_URL = process.env.KERF_RPC_URL || REGISTRY.publicRpc;
export const RPC_KIND: "public" | "provider" = process.env.KERF_RPC_URL ? "provider" : "public";

export const robinhood = defineChain({
  id: REGISTRY.chainId,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Blockscout", url: REGISTRY.explorer } },
  contracts: { multicall3: { address: REGISTRY.multicall3 as Address } },
});

export const client = createPublicClient({ chain: robinhood, transport: http(RPC_URL, { retryCount: 3, timeout: 20_000 }) });

export const EXECUTOR = (process.env.NEXT_PUBLIC_EXECUTOR_ADDRESS || REGISTRY.kerfExecutor) as Address;
export const EXECUTOR_DEPLOY_BLOCK = BigInt(process.env.KERF_EXECUTOR_DEPLOY_BLOCK || 71_645_512);

export const TOKENS: Asset[] = (tokensJson as { symbol: string; name: string; address: string; decimals: number; kind: "stock" | "quote" }[]).map((t) => ({
  ...t,
  address: t.address as Address,
}));
const byAddr = new Map(TOKENS.map((t) => [t.address.toLowerCase(), t]));
export const token = (a: string) => byAddr.get(a.toLowerCase());
/** Tokens found at runtime in the issuer registry (and verified on-chain) join the static list. */
export function registerToken(t: Asset) {
  if (byAddr.has(t.address.toLowerCase())) return false;
  byAddr.set(t.address.toLowerCase(), t);
  TOKENS.push(t);
  return true;
}
export const USDG = token(REGISTRY.usdg)!;
export const WETH = token(REGISTRY.weth)!;

export interface SnapshotPool {
  address: Address;
  kind: "v2" | "v3";
  fee: number;
  token0: Address;
  token1: Address;
}
export const SNAPSHOT = poolsJson as { block: number; generatedAt: string; pools: SnapshotPool[] };

/** Tiny TTL cache that also de-duplicates concurrent requests for the same key. */
const cache = new Map<string, { at: number; value: Promise<unknown> }>();
export function cached<T>(key: string, ttlMs: number, work: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = work();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}
