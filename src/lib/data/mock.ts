import {
  ALL_ASSETS,
  CHAIN,
  CONTRACTS,
  DEMO_WALLET,
  ETH_USD,
  STOCK_ASSETS,
  USDG,
  WETH,
  assetByAddress,
  fakeAddress,
  fakeHex,
  hash,
  rng,
  usdOf,
} from "./catalog";
import type {
  ActivityPage,
  Address,
  Asset,
  BlockMeta,
  DataProvider,
  Execution,
  Hop,
  MarketsSnapshot,
  Pool,
  PoolState,
  QuoteRequest,
  QuoteResponse,
  RouteQuote,
  RoutesSnapshot,
  Simulation,
  StatusSnapshot,
  TokenInfo,
  V4Page,
  V4Pool,
  Verdict,
} from "./types";

// Deterministic fake chain. Pool topology is fixed; prices drift every
// SCAN_MS so refreshes show movement, and a dislocation is injected in some
// windows so the full "eligible → simulate → execute" path can be exercised.

const BASE_BLOCK = 71_500_000;
const BASE_TS = Date.UTC(2026, 8, 24, 12, 0, 0);
const SCAN_MS = 15_000;
const QUOTE_TTL_MS = 20_000;
const GAS_GWEI = 0.0421;
const DUST_USD = 25;

const TIERS = [
  { venue: "v3", fee: 500, quote: "USDG" },
  { venue: "v3", fee: 3000, quote: "USDG" },
  { venue: "v3", fee: 500, quote: "WETH" },
  { venue: "v3", fee: 3000, quote: "WETH" },
  { venue: "v2", fee: 3000, quote: "USDG" },
  { venue: "v3", fee: 10000, quote: "USDG" },
  { venue: "v3", fee: 100, quote: "USDG" },
] as const;

function blockAt(ms: number) {
  return BASE_BLOCK + Math.floor((ms - BASE_TS) / 100);
}

function meta(now = Date.now()): BlockMeta {
  const r = rng(Math.floor(now / 1000));
  return {
    network: CHAIN.name,
    chainId: CHAIN.chainId,
    block: blockAt(now),
    blockTimestamp: Math.floor(now / 1000),
    fetchedAt: new Date(now).toISOString(),
    rpcLatencyMs: Math.round(90 + r() * 260),
  };
}

type PoolSeed = Omit<Pool, "price" | "priceUsd"> & { trueRate: number };

// ---------- topology (static) ----------

let topology: PoolSeed[] | null = null;

function buildTopology(): PoolSeed[] {
  const out: PoolSeed[] = [];
  let hollowUsed = false;
  for (const s of STOCK_ASSETS) {
    const r = rng(hash("topo:" + s.symbol));
    const count = 1 + Math.floor(r() * 4);
    const picks = [...TIERS].sort(() => r() - 0.5).slice(0, count);
    for (const t of picks) {
      const quote = t.quote === "USDG" ? USDG : WETH;
      const roll = r();
      let depthUsd = Math.round(Math.exp(Math.log(40) + r() * (Math.log(420_000) - Math.log(40))));
      let state: PoolState = "routable";
      if (roll < 0.18) {
        state = "inactive";
        depthUsd = 0;
      } else if (depthUsd < DUST_USD * 4 && roll < 0.4) {
        state = "dust";
        depthUsd = Math.round(r() * DUST_USD);
      } else if (!hollowUsed && depthUsd > 5000 && roll > 0.93) {
        state = "hollow";
        hollowUsed = true;
      }
      out.push({
        address: fakeAddress(`pool:${s.symbol}:${t.venue}:${t.fee}:${quote.symbol}`),
        venue: t.venue,
        feePips: t.fee,
        pairType: "stock-quote",
        base: s,
        quote,
        state,
        probeImpactBps: state === "routable" ? Math.round(r() * 40) / 100 : null,
        depthUsd,
        trueRate: usdOf(s) / usdOf(quote),
      });
    }
  }
  // WETH/USDG connectors
  for (const [venue, fee, depth] of [
    ["v3", 100, 1_223_209],
    ["v3", 500, 412_880],
    ["v3", 3000, 96_410],
    ["v2", 3000, 38_200],
    ["v3", 10000, 1_900],
  ] as const) {
    out.push({
      address: fakeAddress(`pool:WETH:${venue}:${fee}:USDG`),
      venue,
      feePips: fee,
      pairType: "connector",
      base: WETH,
      quote: USDG,
      state: depth < 5000 ? "dust" : "routable",
      probeImpactBps: 0.04,
      depthUsd: depth,
      trueRate: ETH_USD,
    });
  }
  // stock/stock pools
  const pairs = [
    ["SPY", "NVDA"], ["SPY", "QQQ"], ["SLV", "GLD"], ["AAPL", "SPY"], ["COST", "AAPL"],
    ["SPY", "TSLA"], ["MSFT", "GOOGL"], ["QQQ", "NVDA"], ["META", "NFLX"], ["AMD", "NVDA"],
  ];
  for (const [a, b] of pairs) {
    const A = STOCK_ASSETS.find((x) => x.symbol === a)!;
    const B = STOCK_ASSETS.find((x) => x.symbol === b)!;
    const r = rng(hash("ss:" + a + b));
    const inactive = r() < 0.3;
    out.push({
      address: fakeAddress(`pool:${a}:${b}`),
      venue: "v3",
      feePips: 500,
      pairType: "stock-stock",
      base: A,
      quote: B,
      state: inactive ? "inactive" : "routable",
      probeImpactBps: inactive ? null : 0.1,
      depthUsd: inactive ? 0 : Math.round(2000 + r() * 30000),
      trueRate: A.usd / B.usd,
    });
  }
  return out;
}

function pools(): PoolSeed[] {
  return (topology ??= buildTopology());
}

// ---------- prices (drift per scan window) ----------

function priced(now = Date.now()): Pool[] {
  const bucket = Math.floor(now / SCAN_MS);
  // Dislocations last a minute so a user can open, rehearse and execute one.
  const disloc = rng(hash("disloc:" + Math.floor(now / 60_000)));
  const live = pools().filter((p) => p.state === "routable");
  // only pools whose asset has a second routable pool can form a paying loop
  const routableStockPools = live.filter(
    (p) => p.pairType === "stock-quote" && p.depthUsd > 2_000 && live.some((o) => o !== p && (o.base === p.base || o.quote === p.base)),
  );
  // ~40 % of windows carry one pool mispriced enough to pay for gas
  const target = disloc() < 0.45 ? routableStockPools[Math.floor(disloc() * routableStockPools.length)]?.address : null;
  const shock = 0.006 + disloc() * 0.006;
  return pools().map((p) => {
    const r = rng(hash(p.address + ":" + bucket));
    const noise = (r() - 0.5) * 0.0012;
    const dev = p.address === target ? shock : noise;
    const price = p.trueRate * (1 + dev);
    const priceUsd = p.state === "inactive" ? null : price * usdOf(p.quote);
    const { trueRate: _unused, ...rest } = p;
    void _unused;
    return { ...rest, price, priceUsd };
  });
}

// ---------- routing ----------

function hopRate(p: Pool, tokenIn: Asset) {
  return p.base.address === tokenIn.address ? p.price : 1 / p.price;
}

function other(p: Pool, t: Asset) {
  return p.base.address === t.address ? p.quote : p.base;
}

function enumerateCycles(all: Pool[], settlement: Asset, maxHops: number) {
  const routable = all.filter((p) => p.state === "routable");
  const byToken = new Map<string, Pool[]>();
  for (const p of routable) {
    for (const t of [p.base, p.quote]) {
      const list = byToken.get(t.address) ?? [];
      list.push(p);
      byToken.set(t.address, list);
    }
  }
  const cycles: Pool[][] = [];
  const walk = (token: Asset, path: Pool[], seenTokens: Set<string>) => {
    if (cycles.length > 8000) return;
    for (const p of byToken.get(token.address) ?? []) {
      if (path.includes(p)) continue;
      const next = other(p, token);
      const newPath = [...path, p];
      if (next.address === settlement.address) {
        if (newPath.length >= 2) cycles.push(newPath);
        continue;
      }
      if (newPath.length >= maxHops || seenTokens.has(next.address)) continue;
      walk(next, newPath, new Set([...seenTokens, next.address]));
    }
  };
  walk(settlement, [], new Set([settlement.address]));
  return cycles;
}

function gasUnitsFor(hops: number) {
  return [0, 0, 250_000, 361_162, 472_300][hops] ?? 472_300;
}

function quoteCycle(path: Pool[], settlement: Asset, amountIn: number | null, now: number, block: number): RouteQuote {
  const minDepthUsd = Math.min(...path.map((p) => p.depthUsd));
  const settleUsd = usdOf(settlement);
  const size = amountIn ?? (minDepthUsd * 0.4) / settleUsd;
  let token = settlement;
  let amt = size;
  let spot = 1;
  let impactTotal = 0;
  const hops: Hop[] = [];
  for (const p of path) {
    const rate = hopRate(p, token);
    const fee = p.feePips / 1_000_000;
    const sizeUsd = amt * usdOf(token);
    const impact = Math.min(0.2, (sizeUsd / Math.max(p.depthUsd, 1)) * 0.01 * 0.3);
    impactTotal += impact;
    spot *= rate * (1 - fee);
    const out = amt * rate * (1 - fee) * (1 - impact);
    const next = other(p, token);
    hops.push({
      pool: p.address,
      venue: p.venue,
      feePips: p.feePips,
      tokenIn: token,
      tokenOut: next,
      amountIn: amt,
      amountOut: out,
      ticksCrossed: p.venue === "v3" ? Math.floor(impact * 10_000 / 3) : 0,
    });
    amt = out;
    token = next;
  }
  const gross = amt - size;
  const protocolFeeBps = 0;
  const protocolFee = gross > 0 ? (gross * protocolFeeBps) / 10_000 : 0;
  const gasUnits = gasUnitsFor(path.length);
  const gasEth = gasUnits * GAS_GWEI * 1e-9;
  const gasSettlement = settlement.symbol === "WETH" ? gasEth : gasEth * ETH_USD;
  const net = gross - protocolFee - gasSettlement;
  const verdict: Verdict = net > 0 ? "eligible" : gross > 0 ? "gas-exceeds" : "no-profit";
  const quotedAt = now;
  return {
    id: settlement.symbol + ":" + path.map((p) => p.address.slice(2, 10)).join("-"),
    settlement,
    block,
    quotedAt,
    expiresAt: quotedAt + QUOTE_TTL_MS,
    amountIn: size,
    cycleOutput: amt,
    hops,
    rawEdgeBps: (spot - 1) * 10_000,
    impactBps: impactTotal * 10_000,
    grossResult: gross,
    protocolFeeBps,
    protocolFee,
    gasUnits,
    gasPriceGwei: GAS_GWEI,
    gasEth,
    gasSettlement,
    netResult: net,
    verdict,
  };
}

function resolveRoute(id: string, all: Pool[]) {
  const [sym, rest] = id.split(":");
  const settlement = sym === "WETH" ? WETH : USDG;
  const path = (rest ?? "").split("-").map((frag) => all.find((p) => p.address.slice(2, 10) === frag));
  if (!path.length || path.some((p) => !p)) return null;
  return { settlement, path: path as Pool[] };
}

// ---------- history ----------

function history(): Execution[] {
  const r = rng(hash("history-v1"));
  const all = priced(BASE_TS);
  const routable = all.filter((p) => p.state === "routable" && p.pairType === "stock-quote");
  const now = Date.now();
  const head = blockAt(now);
  const rows: Execution[] = [];
  const callers = [DEMO_WALLET, fakeAddress("trader-a"), fakeAddress("trader-b"), fakeAddress("trader-c")];
  for (let i = 0; i < 37; i++) {
    const ago = Math.floor(r() * 6 * 86400_000) + 30_000 * i;
    const ts = now - ago;
    const block = blockAt(ts);
    const settlement = r() < 0.7 ? USDG : WETH;
    const a = routable[Math.floor(r() * routable.length)];
    const b = routable[Math.floor(r() * routable.length)];
    const amountIn = settlement === USDG ? 20 + r() * 900 : 0.01 + r() * 0.3;
    const gross = amountIn * (0.0008 + r() * 0.006);
    const gasEth = gasUnitsFor(2 + Math.floor(r() * 2)) * GAS_GWEI * 1e-9;
    const lag = head - block;
    rows.push({
      txHash: fakeHex("tx:" + i, 32),
      block,
      timestamp: Math.floor(ts / 1000),
      caller: callers[Math.floor(r() * callers.length)],
      settlement,
      pools: [a.address, b.address],
      path: [settlement.symbol, a.base.symbol, settlement.symbol],
      amountIn,
      grossProfit: gross,
      userProfit: gross,
      protocolFee: 0,
      gasEth,
      confirmation: lag > 12_000 ? "finalized" : lag > 6_000 ? "safe" : "l2",
    });
  }
  return rows.sort((x, y) => y.block - x.block);
}

// ---------- v4 census ----------

function v4Census(): V4Pool[] {
  const r = rng(hash("v4"));
  const rows: V4Pool[] = [];
  for (let i = 0; i < 612; i++) {
    const a = ALL_ASSETS[Math.floor(r() * ALL_ASSETS.length)];
    let b = ALL_ASSETS[Math.floor(r() * ALL_ASSETS.length)];
    if (b === a) b = USDG;
    const extreme = r() < 0.45;
    const feePips = extreme ? 100_000 + Math.floor(r() * 900_000) : [100, 500, 2510, 3000, 10000][Math.floor(r() * 5)];
    rows.push({
      id: fakeHex("v4:" + i, 32),
      symbols: [a.symbol, b.symbol],
      feePips,
      tickSpacing: [1, 10, 25, 60, 200][Math.floor(r() * 5)],
      hooks: r() < 0.3 ? fakeAddress("hook:" + i) : ("0x" + "0".repeat(40)) as Address,
      createdBlock: BASE_BLOCK - Math.floor(r() * 400_000),
    });
  }
  return rows;
}

// ---------- provider ----------

export const mockProvider: DataProvider = {
  async markets(): Promise<MarketsSnapshot> {
    const now = Date.now();
    const all = priced(now);
    const stockPools = all.filter((p) => p.pairType === "stock-quote");
    const markets = STOCK_ASSETS.map((stock) => {
      const ps = stockPools.filter((p) => p.base.address === stock.address);
      const live = ps.filter((p) => p.state === "routable" && p.priceUsd);
      const usd = live.map((p) => p.priceUsd!);
      const spread = usd.length > 1 ? ((Math.max(...usd) - Math.min(...usd)) / Math.min(...usd)) * 10_000 : null;
      return { stock, pools: ps, rawSpreadBps: spread, totalDepthUsd: ps.reduce((s, p) => s + p.depthUsd, 0) };
    });
    return {
      meta: meta(now),
      ethUsd: ETH_USD,
      gasPriceGwei: GAS_GWEI,
      gasConversion: { credible: true, note: "Same-block WETH/USDG 0.01 % pool rate, within 2 % of the oracle reference." },
      markets,
      connectors: all.filter((p) => p.pairType === "connector"),
      stockStock: all.filter((p) => p.pairType === "stock-stock"),
      counts: {
        stocksListed: 195,
        stocksWithPools: STOCK_ASSETS.length,
        poolsDiscovered: all.length,
        poolsRoutable: all.filter((p) => p.state === "routable").length,
        v2: all.filter((p) => p.venue === "v2").length,
        v3: all.filter((p) => p.venue === "v3").length,
        v4Listed: 612,
      },
    };
  },

  async routes({ settlement, maxHops, token }): Promise<RoutesSnapshot> {
    const now = Date.now();
    const m = meta(now);
    const all = priced(Math.floor(now / SCAN_MS) * SCAN_MS);
    const settle = settlement === "WETH" ? WETH : USDG;
    let cycles = enumerateCycles(all, settle, Math.min(4, Math.max(2, maxHops)));
    if (token) cycles = cycles.filter((c) => c.some((p) => p.base.address === token || p.quote.address === token));
    const scanAt = Math.floor(now / SCAN_MS) * SCAN_MS;
    const ranked = cycles
      .map((c) => ({ c, edge: c.reduce((acc, p, i) => acc * hopRate(p, i === 0 ? settle : tokenAt(c, settle, i)) * (1 - p.feePips / 1e6), 1) }))
      .sort((a, b) => b.edge - a.edge)
      .slice(0, 48);
    const quoted = ranked.map(({ c }) => quoteCycle(c, settle, null, scanAt, blockAt(scanAt))).sort((a, b) => (b.netResult ?? -1e9) - (a.netResult ?? -1e9));
    const eligible = quoted.filter((q) => q.verdict === "eligible").length;
    const rejection = (["no-profit", "gas-exceeds"] as Verdict[])
      .map((reason) => ({ reason, count: quoted.filter((q) => q.verdict === reason).length }))
      .filter((x) => x.count > 0);
    const routablePools = all.filter((p) => p.state === "routable").length;
    return {
      meta: { ...m, block: blockAt(scanAt) },
      settlement: settle,
      candidatesRanked: cycles.length,
      quoted,
      eligible,
      rejection,
      excluded: {
        inactive: all.filter((p) => p.state === "inactive").length,
        dust: all.filter((p) => p.state === "dust").length,
        hollow: all.filter((p) => p.state === "hollow").length,
        unprobed: 0,
        v4: 612,
      },
      gasConversion: { credible: true, note: "Same-block WETH/USDG 0.01 % pool rate, within 2 % of the oracle reference." },
      routablePools,
      note: eligible
        ? `${eligible} cycle${eligible > 1 ? "s" : ""} clear every cost at block ${blockAt(scanAt).toLocaleString("en-US")}. Open one to re-quote at the newest block before trusting it.`
        : `Nothing clears costs at block ${blockAt(scanAt).toLocaleString("en-US")}: ${quoted.length} cycles quoted across ${routablePools} routable pools. That is what a well-arbitraged market looks like — the rows below show how far each one is from paying.`,
    };
  },

  async quote(req: QuoteRequest): Promise<QuoteResponse> {
    const now = Date.now();
    const all = priced(now);
    const resolved = resolveRoute(req.routeId, all);
    if (!resolved) throw new Error("Unknown route: its pools are not in the current pool set.");
    const q = quoteCycle(resolved.path, resolved.settlement, req.amountIn, now, blockAt(now));
    let simulation: Simulation | null = null;
    if (req.simulate) {
      const minProfit = req.minProfit ?? q.gasSettlement ?? 0;
      const deadlineSec = req.deadlineSec ?? 120;
      const clears = q.grossResult - q.protocolFee >= minProfit;
      simulation = {
        ok: q.grossResult > 0 && clears,
        mode: "deployed",
        simulatedAt: new Date(now).toISOString(),
        block: blockAt(now),
        revertName: q.grossResult <= 0 ? "CycleNotProfitable" : clears ? null : "MinProfitNotMet",
        revertReason:
          q.grossResult <= 0
            ? `The cycle returns ${q.cycleOutput.toFixed(6)} but owes ${q.amountIn.toFixed(6)} to the first pool, so it would lose money at this block.`
            : clears
              ? null
              : `Profit ${q.grossResult.toFixed(6)} is below the required minimum ${minProfit.toFixed(6)} ${q.settlement.symbol}.`,
        gasUnits: q.grossResult > 0 && clears ? Math.round(q.gasUnits * 0.93) : null,
        minProfit,
        deadlineAt: Math.floor(now / 1000) + deadlineSec,
        calldata: fakeHex("calldata:" + q.id + ":" + req.amountIn + ":" + minProfit + ":" + deadlineSec, 196),
        to: null,
        live: false,
      };
    }
    return { quote: q, simulation };
  },

  async activity({ caller, page, limit }): Promise<ActivityPage> {
    const head = blockAt(Date.now());
    let rows = history();
    if (caller) rows = rows.filter((r) => r.caller.toLowerCase() === caller.toLowerCase());
    const pages = Math.max(1, Math.ceil(rows.length / limit));
    const p = Math.min(Math.max(1, page), pages);
    return {
      available: true,
      head: { latest: head, safe: head - 7_681, finalized: head - 11_630 },
      rows: rows.slice((p - 1) * limit, p * limit),
      total: rows.length,
      page: p,
      pages,
      limit,
      caller: (caller as Address) ?? null,
    };
  },

  async status(): Promise<StatusSnapshot> {
    const m = meta();
    const now = m.blockTimestamp;
    return {
      network: { name: CHAIN.name, chainId: CHAIN.chainId, explorer: CHAIN.explorer, rpcHost: "rpc.example-provider.io", rpcKind: "public" },
      head: { block: m.block, timestamp: now, latencyMs: m.rpcLatencyMs },
      safe: { block: m.block - 7_681, timestamp: now - 772 },
      finalized: { block: m.block - 11_630, timestamp: now - 1_169 },
      gasPriceGwei: GAS_GWEI,
      adapters: [
        { id: "v2", label: "Uniswap V2 pairs", address: CONTRACTS.v2Factory, status: "supported", detail: "0.30 % fixed fee · flash swap via uniswapV2Call · constant-product quote on same-block reserves" },
        { id: "v3", label: "Uniswap V3 pools", address: CONTRACTS.v3Factory, status: "supported", detail: "Tiers 0.01 / 0.05 / 0.30 / 1 % · flash swap via uniswapV3SwapCallback · QuoterV2 per hop" },
        { id: "v4", label: "Uniswap v4 pools", address: CONTRACTS.v4Manager, status: "unsupported", detail: "612 pools between verified assets are listed from a census and never routed: hooks can rewrite fees and curves, and the executor has no v4 settlement path." },
      ],
      simulation: { mode: "deployed", label: "eth_call of the exact execute() call against the deployed executor" },
      executor: {
        address: CONTRACTS.executor,
        verified: true,
        version: "1.0.0",
        protocolFeeBps: 0,
        paused: false,
        owner: CONTRACTS.owner,
        feeRecipient: CONTRACTS.owner,
        checks: [
          { label: "Bytecode present", ok: true, detail: "11,208 bytes" },
          { label: "Answers as KerfExecutor", ok: true, detail: "VERSION 1.0.0" },
          { label: "V2 factory matches registry", ok: true, detail: CONTRACTS.v2Factory },
          { label: "V3 factory matches registry", ok: true, detail: CONTRACTS.v3Factory },
          { label: "Protocol fee under the 10 % cap", ok: true, detail: "0 bps (cap 1000)" },
        ],
      },
      registry: [
        { label: "Network", source: "Chain operator documentation + live eth_chainId", verifiedAt: "2026-09-23", method: "Chain ids, gas token, explorer, public RPC limits" },
        { label: "DEX deployments", source: "Uniswap deployments registry (chain 4663)", verifiedAt: "2026-09-23", method: "Registry lookup + eth_getCode + QuoterV2.factory() / WETH9()" },
        { label: "Stock tokens", source: "Issuer asset registry, each checked against the issuer beacon", verifiedAt: "2026-09-24", method: "195 tokens · ERC-1967 beacon proxy + symbol() / decimals()" },
        { label: "Pool snapshot", source: "factory.getPool / getPair + PoolCreated scan", verifiedAt: "2026-09-24", method: "Re-validated with getPool on every run" },
        { label: "v4 census", source: "PoolManager Initialize events", verifiedAt: "2026-09-24", method: "Listed only; never priced" },
        { label: "Oracles", source: "Chainlink ETH/USD and USDG/USD proxies", verifiedAt: "2026-09-23", method: "description() / decimals() / latestRoundData()" },
      ],
      fetchedAt: m.fetchedAt,
    };
  },

  async token(): Promise<TokenInfo> {
    return {
      status: CONTRACTS.token ? "live" : "soon",
      symbol: "KERF",
      address: CONTRACTS.token,
      block: blockAt(Date.now()),
      name: "Kerf",
      decimals: 18,
      totalSupply: 1_000_000_000,
      market: null,
      marketReason: "No canonical V2 or V3 pool against USDG or WETH exists yet, so there is no price to show.",
    };
  },

  async v4Pools({ page, includeExtreme }): Promise<V4Page> {
    const all = v4Census();
    const shown = includeExtreme ? all : all.filter((p) => p.feePips <= 100_000);
    const limit = 25;
    const pages = Math.max(1, Math.ceil(shown.length / limit));
    const p = Math.min(Math.max(1, page), pages);
    return {
      total: shown.length,
      hiddenExtreme: all.length - shown.length,
      page: p,
      pages,
      rows: shown.slice((p - 1) * limit, p * limit),
      snapshotBlock: BASE_BLOCK - 1_200,
    };
  },
};

function tokenAt(path: Pool[], settle: Asset, i: number): Asset {
  let t = settle;
  for (let k = 0; k < i; k++) t = other(path[k], t);
  return t;
}

export { assetByAddress };
