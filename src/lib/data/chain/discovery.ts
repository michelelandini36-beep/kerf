import "server-only";
import { getAddress, zeroAddress, type Address } from "viem";
import { REGISTRY } from "@/config/registry";
import type { Asset } from "../types";
import { erc20Abi, factoryAbi } from "./abi";
import { SNAPSHOT, TOKENS, USDG, WETH, cached, client, registerToken, type SnapshotPool } from "./client";

// Keeps the asset list and the pool set current without redeploying:
// every 6 h the issuer registry is re-read (new tokens must prove they are beacon
// proxies of the issuer beacon), then every token × {USDG, WETH} × tier is asked
// of the canonical factories. The committed snapshot is the fallback.

const SIX_HOURS = 6 * 60 * 60 * 1000;
const ERC1967_BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

interface IssuerAsset {
  tokenSymbol: string;
  tokenName: string;
  status: string;
  deployments: { contractAddress: string; chainId: number }[];
}

export function discoverTokens() {
  return cached("tokens", SIX_HOURS, async () => {
    try {
      const res = await fetch(REGISTRY.assetsApi, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return 0;
      const body = (await res.json()) as { assets?: IssuerAsset[] };
      const candidates = (body.assets ?? [])
        .filter((a) => a.status === "ASSET_STATUS_ACTIVE")
        .flatMap((a) => a.deployments.filter((d) => d.chainId === REGISTRY.chainId).map((d) => ({ a, address: getAddress(d.contractAddress) })))
        .filter((c) => !TOKENS.some((t) => t.address.toLowerCase() === c.address.toLowerCase()));
      let added = 0;
      for (const c of candidates.slice(0, 50)) {
        const slot = await client.getStorageAt({ address: c.address, slot: ERC1967_BEACON_SLOT }).catch(() => null);
        const beacon = slot ? ("0x" + slot.slice(-40)).toLowerCase() : "";
        if (beacon !== REGISTRY.stockBeacon.toLowerCase()) continue; // a ticker proves nothing
        const [symbol, decimals] = await client.multicall({
          contracts: [
            { address: c.address, abi: erc20Abi, functionName: "symbol" },
            { address: c.address, abi: erc20Abi, functionName: "decimals" },
          ],
          allowFailure: false,
        });
        if (String(symbol) !== c.a.tokenSymbol) continue;
        const t: Asset = { address: c.address, symbol: String(symbol), name: c.a.tokenName.replace(/\s*•.*$/, ""), decimals: Number(decimals), kind: "stock" };
        if (registerToken(t)) added++;
      }
      return added;
    } catch {
      return 0;
    }
  });
}

export function discoveredPools(): Promise<SnapshotPool[]> {
  return cached("pools", SIX_HOURS, async () => {
    await discoverTokens();
    try {
      const stocks = TOKENS.filter((t) => t.kind === "stock");
      const pairs: [Address, Address][] = [...stocks.flatMap((s) => [[s.address, USDG.address], [s.address, WETH.address]] as [Address, Address][]), [WETH.address, USDG.address]];
      const jobs = pairs.flatMap(([a, b]) => [
        { kind: "v2" as const, a, b, fee: 3000, call: { address: REGISTRY.uniswapV2Factory as Address, abi: factoryAbi, functionName: "getPair" as const, args: [a, b] as const } },
        ...REGISTRY.v3FeeTiers.map((fee) => ({ kind: "v3" as const, a, b, fee, call: { address: REGISTRY.uniswapV3Factory as Address, abi: factoryAbi, functionName: "getPool" as const, args: [a, b, fee] as const } })),
      ]);
      const found: SnapshotPool[] = [];
      for (let i = 0; i < jobs.length; i += 400) {
        const slice = jobs.slice(i, i + 400);
        const res = (await client.multicall({ contracts: slice.map((j) => j.call) as never, allowFailure: true })) as unknown as { status: string; result?: Address }[];
        res.forEach((r, k) => {
          if (r.status !== "success" || !r.result || r.result === zeroAddress) return;
          const j = slice[k];
          const [t0, t1] = BigInt(j.a) < BigInt(j.b) ? [j.a, j.b] : [j.b, j.a];
          found.push({ address: getAddress(r.result), kind: j.kind, fee: j.fee, token0: getAddress(t0), token1: getAddress(t1) });
        });
      }
      // stock/stock pools come from the committed snapshot (a bounded PoolCreated scan offline)
      const stockStock = SNAPSHOT.pools.filter((p) => !found.some((f) => f.address === p.address));
      const all = [...found, ...stockStock];
      return all.length >= SNAPSHOT.pools.length * 0.9 ? all : SNAPSHOT.pools;
    } catch {
      return SNAPSHOT.pools;
    }
  });
}
