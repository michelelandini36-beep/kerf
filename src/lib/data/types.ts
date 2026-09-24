// Shared data contracts between the UI and whatever backend feeds it.
// Amounts are human units (already divided by decimals). A real adapter
// reading base-unit bigints converts at the boundary — see http.ts.

export type Address = `0x${string}`;
export type Venue = "v2" | "v3";
export type Settlement = "USDG" | "WETH";

export interface Asset {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  kind: "stock" | "quote";
}

export interface BlockMeta {
  network: string;
  chainId: number;
  block: number;
  blockTimestamp: number; // unix seconds
  fetchedAt: string; // ISO
  rpcLatencyMs: number;
}

export type ProbeStatus = "verified" | "hollow" | "unprobed";
export type PoolState = "routable" | "inactive" | "dust" | "hollow" | "unprobed" | "no-usd";
export type PairType = "stock-quote" | "stock-stock" | "connector";

export interface Pool {
  address: Address;
  venue: Venue;
  feePips: number; // 100 = 0.01 %
  pairType: PairType;
  base: Asset;
  quote: Asset;
  state: PoolState;
  probeImpactBps: number | null;
  price: number; // quote per base
  priceUsd: number | null;
  depthUsd: number; // +1 % depth
}

export interface MarketRow {
  stock: Asset;
  pools: Pool[];
  rawSpreadBps: number | null;
  totalDepthUsd: number;
}

export interface MarketsSnapshot {
  meta: BlockMeta;
  ethUsd: number;
  gasConversion: { credible: boolean; note: string };
  gasPriceGwei: number;
  markets: MarketRow[];
  connectors: Pool[];
  stockStock: Pool[];
  counts: {
    stocksListed: number;
    stocksWithPools: number;
    poolsDiscovered: number;
    poolsRoutable: number;
    v2: number;
    v3: number;
    v4Listed: number;
  };
}

export interface Hop {
  pool: Address;
  venue: Venue;
  feePips: number;
  tokenIn: Asset;
  tokenOut: Asset;
  amountIn: number;
  amountOut: number;
  ticksCrossed: number;
}

export type Verdict = "eligible" | "no-profit" | "gas-exceeds" | "incomplete";

export interface RouteQuote {
  id: string;
  settlement: Asset;
  block: number;
  quotedAt: number; // ms
  expiresAt: number; // ms
  amountIn: number;
  cycleOutput: number;
  hops: Hop[];
  rawEdgeBps: number;
  impactBps: number;
  grossResult: number;
  protocolFeeBps: number;
  protocolFee: number;
  gasUnits: number;
  gasPriceGwei: number;
  gasEth: number;
  gasSettlement: number | null;
  netResult: number | null;
  verdict: Verdict;
}

export interface RoutesSnapshot {
  meta: BlockMeta;
  settlement: Asset;
  candidatesRanked: number;
  quoted: RouteQuote[];
  eligible: number;
  rejection: { reason: Verdict; count: number }[];
  excluded: { inactive: number; dust: number; hollow: number; unprobed: number; v4: number };
  gasConversion: { credible: boolean; note: string };
  routablePools: number;
  note: string;
}

export interface QuoteRequest {
  routeId: string;
  amountIn: number;
  simulate?: boolean;
  from?: Address | null;
  minProfit?: number;
  deadlineSec?: number;
}

export interface Simulation {
  ok: boolean;
  mode: "deployed" | "preview";
  simulatedAt: string;
  block: number;
  revertName: string | null;
  revertReason: string | null;
  gasUnits: number | null;
  minProfit: number;
  deadlineAt: number; // unix seconds
  calldata: `0x${string}`;
}

export interface QuoteResponse {
  quote: RouteQuote;
  simulation: Simulation | null;
}

export type Confirmation = "l2" | "safe" | "finalized";

export interface Execution {
  txHash: `0x${string}`;
  block: number;
  timestamp: number;
  caller: Address;
  settlement: Asset;
  pools: Address[];
  path: string[];
  amountIn: number;
  grossProfit: number;
  userProfit: number;
  protocolFee: number;
  gasEth: number;
  confirmation: Confirmation;
}

export interface ActivityPage {
  available: boolean;
  head: { latest: number; safe: number; finalized: number };
  rows: Execution[];
  total: number;
  page: number;
  pages: number;
  limit: number;
  caller: Address | null;
}

export interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

export interface StatusSnapshot {
  network: { name: string; chainId: number; explorer: string; rpcHost: string; rpcKind: "public" | "provider" };
  head: { block: number; timestamp: number; latencyMs: number };
  safe: { block: number; timestamp: number };
  finalized: { block: number; timestamp: number };
  gasPriceGwei: number;
  adapters: { id: string; label: string; address: Address; status: "supported" | "unsupported"; detail: string }[];
  simulation: { mode: "deployed" | "preview"; label: string };
  executor: {
    address: Address | null;
    verified: boolean;
    version: string;
    protocolFeeBps: number;
    paused: boolean;
    owner: Address;
    feeRecipient: Address;
    checks: Check[];
  };
  registry: { label: string; source: string; verifiedAt: string; method: string }[];
  fetchedAt: string;
}

export interface TokenInfo {
  status: "soon" | "live";
  symbol: string;
  address: Address | null;
  block: number;
  name: string;
  decimals: number;
  totalSupply: number;
  market: null | { venue: string; price: number; depthUsd: number };
  marketReason: string;
}

export interface V4Pool {
  id: `0x${string}`;
  symbols: [string, string];
  feePips: number;
  tickSpacing: number;
  hooks: Address;
  createdBlock: number;
}

export interface V4Page {
  total: number;
  hiddenExtreme: number;
  page: number;
  pages: number;
  rows: V4Pool[];
  snapshotBlock: number;
}

export interface DataProvider {
  markets(): Promise<MarketsSnapshot>;
  routes(opts: { settlement: Settlement; maxHops: number; token?: string | null }): Promise<RoutesSnapshot>;
  quote(req: QuoteRequest): Promise<QuoteResponse>;
  activity(opts: { caller?: string | null; page: number; limit: number }): Promise<ActivityPage>;
  status(): Promise<StatusSnapshot>;
  token(): Promise<TokenInfo>;
  v4Pools(opts: { page: number; includeExtreme: boolean }): Promise<V4Page>;
}
