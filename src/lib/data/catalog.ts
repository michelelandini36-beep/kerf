import type { Address, Asset } from "./types";

// Static reference data for the mock provider. Addresses are synthetic but
// stable, so URLs and CSV exports stay reproducible across reloads.

export function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fakeAddress(label: string): Address {
  let out = "";
  let seed = hash(label);
  while (out.length < 40) {
    seed = hash(out + seed.toString(16) + label);
    out += seed.toString(16).padStart(8, "0");
  }
  return `0x${out.slice(0, 40)}` as Address;
}

export function fakeHex(label: string, bytes: number): `0x${string}` {
  let out = "";
  let i = 0;
  while (out.length < bytes * 2) out += hash(label + ":" + i++).toString(16).padStart(8, "0");
  return `0x${out.slice(0, bytes * 2)}`;
}

export const USDG: Asset = { address: fakeAddress("USDG"), symbol: "USDG", name: "Global Dollar", decimals: 6, kind: "quote" };
export const WETH: Asset = { address: fakeAddress("WETH"), symbol: "WETH", name: "Wrapped Ether", decimals: 18, kind: "quote" };
export const ETH_USD = 2686.19;

const STOCKS: [string, string, number][] = [
  ["AAPL", "Apple", 231.4],
  ["AMD", "AMD", 162.8],
  ["AMZN", "Amazon", 198.2],
  ["ASML", "ASML Holding NV", 812.5],
  ["AVGO", "Broadcom", 176.3],
  ["BA", "Boeing", 171.9],
  ["BABA", "Alibaba", 97.4],
  ["COIN", "Coinbase", 244.6],
  ["COST", "Costco", 903.1],
  ["CRCL", "Circle Internet Group", 118.7],
  ["DDOG", "Datadog", 131.2],
  ["GLD", "SPDR Gold Trust", 248.9],
  ["GME", "GameStop", 23.8],
  ["GOOGL", "Alphabet Class A", 172.4],
  ["HIMS", "Hims & Hers Health", 41.6],
  ["IBM", "IBM", 226.3],
  ["INTC", "Intel", 22.1],
  ["LLY", "Eli Lilly", 781.2],
  ["META", "Meta Platforms", 588.4],
  ["MSFT", "Microsoft", 437.9],
  ["MSTR", "Strategy Inc.", 342.5],
  ["MU", "Micron Technology", 104.3],
  ["NET", "Cloudflare", 121.6],
  ["NFLX", "Netflix", 702.8],
  ["NVDA", "NVIDIA", 131.9],
  ["PLTR", "Palantir Technologies", 64.2],
  ["QQQ", "Invesco QQQ", 492.7],
  ["RBLX", "Roblox", 56.3],
  ["RDDT", "Reddit", 148.1],
  ["SGOV", "iShares 0-3 Month Treasury Bond", 100.97],
  ["SHOP", "Shopify", 104.9],
  ["SLV", "iShares Silver Trust", 29.4],
  ["SNOW", "Snowflake", 167.2],
  ["SPY", "SPDR S&P 500 ETF Trust", 571.3],
  ["TSLA", "Tesla", 262.5],
  ["TSM", "Taiwan Semiconductor", 188.4],
  ["UPS", "UPS", 131.8],
  ["USO", "United States Oil Fund", 74.6],
  ["VTI", "Vanguard Total Stock Market ETF", 283.1],
  ["WULF", "TeraWulf", 6.4],
];

export const STOCK_ASSETS: (Asset & { usd: number })[] = STOCKS.map(([symbol, name, usd]) => ({
  address: fakeAddress("stock:" + symbol),
  symbol,
  name,
  decimals: 18,
  kind: "stock",
  usd,
}));

export const ALL_ASSETS: Asset[] = [USDG, WETH, ...STOCK_ASSETS];

export function assetByAddress(addr: string): Asset | undefined {
  const a = addr.toLowerCase();
  return ALL_ASSETS.find((x) => x.address.toLowerCase() === a);
}

export function usdOf(asset: Asset): number {
  if (asset.symbol === "USDG") return 1;
  if (asset.symbol === "WETH") return ETH_USD;
  return (asset as Asset & { usd?: number }).usd ?? 0;
}

export const CHAIN = {
  name: "Robinhood Chain",
  chainId: 4663,
  explorer: "https://robinhoodchain.blockscout.com",
};

export const CONTRACTS = {
  v2Factory: fakeAddress("v2-factory"),
  v3Factory: fakeAddress("v3-factory"),
  quoter: fakeAddress("quoter-v2"),
  v4Manager: fakeAddress("v4-pool-manager"),
  executor: (process.env.NEXT_PUBLIC_EXECUTOR_ADDRESS as Address) || fakeAddress("kerf-executor"),
  owner: fakeAddress("kerf-owner"),
  token: (process.env.NEXT_PUBLIC_TOKEN_ADDRESS as Address) || null,
  multicall: fakeAddress("multicall3"),
  ethUsdFeed: fakeAddress("feed-eth-usd"),
  usdgUsdFeed: fakeAddress("feed-usdg-usd"),
  beacon: fakeAddress("stock-beacon"),
};

export const DEMO_WALLET = fakeAddress("demo-wallet");
