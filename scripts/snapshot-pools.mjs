// Rebuilds src/config/pools.json: every canonical Uniswap V2 pair / V3 pool for the
// registry tokens against USDG and WETH, the WETH/USDG connectors, and the known
// stock/stock pools — each one confirmed by asking the factory.
//   node scripts/snapshot-pools.mjs          (uses KERF_RPC_URL or the public RPC)
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, http, getAddress, zeroAddress } from "viem";

const RPC = process.env.KERF_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const V2 = "0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f";
const V3 = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA";
const MULTICALL = "0xcA11bde05977b3631167028862bE2a173976CA11";
const TIERS = [100, 500, 3000, 10000];

const chain = { id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } }, contracts: { multicall3: { address: MULTICALL } } };
const client = createPublicClient({ chain, transport: http(RPC, { batch: false, retryCount: 5 }) });

const getPool = [{ name: "getPool", type: "function", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }], outputs: [{ type: "address" }] }];
const getPair = [{ name: "getPair", type: "function", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "address" }] }];

const tokens = JSON.parse(readFileSync("src/config/tokens.json", "utf8"));
const USDG = tokens.find((t) => t.symbol === "USDG").address;
const WETH = tokens.find((t) => t.symbol === "WETH").address;
const stocks = tokens.filter((t) => t.kind === "stock");

const jobs = [];
const pairs = [...stocks.flatMap((s) => [[s.address, USDG], [s.address, WETH]]), [WETH, USDG]];
for (const [a, b] of pairs) {
  jobs.push({ kind: "v2", a, b, fee: 3000, call: { address: V2, abi: getPair, functionName: "getPair", args: [a, b] } });
  for (const fee of TIERS) jobs.push({ kind: "v3", a, b, fee, call: { address: V3, abi: getPool, functionName: "getPool", args: [a, b, fee] } });
}
for (const c of JSON.parse(readFileSync("scripts/stock-stock-candidates.json", "utf8"))) {
  jobs.push({ kind: "v3", a: c.base, b: c.quote, fee: c.fee, call: { address: V3, abi: getPool, functionName: "getPool", args: [c.base, c.quote, c.fee] } });
}

const block = await client.getBlockNumber();
const out = [];
for (let i = 0; i < jobs.length; i += 300) {
  const slice = jobs.slice(i, i + 300);
  const res = await client.multicall({ contracts: slice.map((j) => j.call), blockNumber: block, allowFailure: true });
  res.forEach((r, k) => {
    if (r.status !== "success" || r.result === zeroAddress) return;
    const j = slice[k];
    const [t0, t1] = BigInt(j.a) < BigInt(j.b) ? [j.a, j.b] : [j.b, j.a];
    out.push({ address: getAddress(r.result), kind: j.kind, fee: j.fee, token0: getAddress(t0), token1: getAddress(t1) });
  });
  process.stdout.write(`\r${Math.min(i + 300, jobs.length)}/${jobs.length}`);
}
const unique = [...new Map(out.map((p) => [p.address, p])).values()];
writeFileSync("src/config/pools.json", JSON.stringify({ block: Number(block), generatedAt: new Date().toISOString(), pools: unique }, null, 1));
console.log(`\n${unique.length} pools at block ${block}`);
