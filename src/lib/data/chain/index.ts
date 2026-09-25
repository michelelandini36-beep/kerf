import "server-only";
import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  decodeEventLog,
  encodeFunctionData,
  formatUnits,
  getAddress,
  parseAbiItem,
  parseUnits,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { REGISTRY } from "@/config/registry";
import type {
  ActivityPage,
  Asset,
  BlockMeta,
  DataProvider,
  Execution,
  Hop,
  MarketRow,
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
  Verdict,
} from "../types";
import { erc20Abi, executorAbi, factoryAbi, feedAbi, quoterAbi, v2PairAbi, v3PoolAbi } from "./abi";
import { discoveredPools } from "./discovery";
import v4Json from "@/config/v4-pools.json";

const V4 = v4Json as unknown as { block: number; generatedAt: string; rows: [string, string, string, number, number, string, number][] };
// 0x800000 marks a dynamic fee (set by the hook); anything above 10 % is treated as extreme
const isExtreme = (fee: number) => fee !== 0x800000 && fee > 100_000;
import { EXECUTOR, EXECUTOR_DEPLOY_BLOCK, RPC_KIND, RPC_URL, SNAPSHOT, TOKENS, USDG, WETH, cached, client, token, type SnapshotPool } from "./client";

const DUST_USD = 25;
const QUOTE_TTL_MS = 20_000;
const MAX_QUOTED = 48;
const MAX_SIZE_USD = 25_000;
const LADDER = [0.05, 0.15, 0.4, 1, 2.5];
const SQRT_101_MINUS_1 = Math.sqrt(1.01) - 1;
const GAS_UNITS = [0, 0, 250_000, 361_162, 472_300];
const PLACEHOLDER_SENDER = "0x000000000000000000000000000000000000dEaD" as Address;

const human = (raw: bigint, dec: number) => Number(formatUnits(raw, dec));
const toRaw = (x: number, dec: number) => parseUnits(Math.max(0, x).toFixed(dec), dec);

// ------------------------------------------------------------------ pool state

interface LivePool extends Pool {
  snap: SnapshotPool;
  sqrtPriceX96?: bigint;
  liquidity?: bigint;
  reserve0?: bigint;
  reserve1?: bigint;
}

interface MarketState {
  meta: BlockMeta;
  blockNumber: bigint;
  pools: LivePool[];
  ethUsd: number;
  gasPriceWei: bigint;
  gasConversion: { credible: boolean; note: string };
}

function orient(p: SnapshotPool): { base: Asset; quote: Asset; pairType: Pool["pairType"] } {
  const t0 = token(p.token0)!;
  const t1 = token(p.token1)!;
  const isQuote = (t: Asset) => t.address === USDG.address || t.address === WETH.address;
  if (isQuote(t0) && isQuote(t1)) return { base: WETH, quote: USDG, pairType: "connector" };
  if (isQuote(t0)) return { base: t1, quote: t0, pairType: "stock-quote" };
  if (isQuote(t1)) return { base: t0, quote: t1, pairType: "stock-quote" };
  return { base: t0, quote: t1, pairType: "stock-stock" };
}

async function readPools(snaps: SnapshotPool[], blockNumber: bigint) {
  const calls = snaps.flatMap((p): { address: Address; abi: Abi; functionName: string }[] =>
    p.kind === "v3"
      ? [
          { address: p.address, abi: v3PoolAbi, functionName: "slot0" },
          { address: p.address, abi: v3PoolAbi, functionName: "liquidity" },
        ]
      : [{ address: p.address, abi: v2PairAbi, functionName: "getReserves" }],
  );
  const results: { status: string; result?: unknown }[] = [];
  for (let i = 0; i < calls.length; i += 300) {
    const r = await client.multicall({ contracts: calls.slice(i, i + 300) as never, blockNumber, allowFailure: true });
    results.push(...(r as unknown as { status: string; result?: unknown }[]));
  }
  let k = 0;
  return snaps.map((p) => {
    if (p.kind === "v3") {
      const s0 = results[k++];
      const liq = results[k++];
      return {
        snap: p,
        sqrtPriceX96: s0.status === "success" ? (s0.result as readonly [bigint])[0] : 0n,
        liquidity: liq.status === "success" ? (liq.result as bigint) : 0n,
      };
    }
    const r = results[k++];
    const [r0, r1] = r.status === "success" ? (r.result as readonly [bigint, bigint]) : [0n, 0n];
    return { snap: p, reserve0: r0, reserve1: r1 };
  });
}

function priceOf(raw: Awaited<ReturnType<typeof readPools>>[number]) {
  const p = raw.snap;
  const t0 = token(p.token0)!;
  const t1 = token(p.token1)!;
  if (p.kind === "v3") {
    const s = Number(raw.sqrtPriceX96 ?? 0n) / 2 ** 96;
    const L = Number(raw.liquidity ?? 0n);
    const p01 = s * s * 10 ** (t0.decimals - t1.decimals);
    return { p01, active: L > 0 && s > 0, depth0: s > 0 ? ((L / s) * SQRT_101_MINUS_1) / 10 ** t0.decimals : 0, depth1: (L * s * SQRT_101_MINUS_1) / 10 ** t1.decimals };
  }
  const r0 = human(raw.reserve0 ?? 0n, t0.decimals);
  const r1 = human(raw.reserve1 ?? 0n, t1.decimals);
  return { p01: r0 > 0 ? r1 / r0 : 0, active: r0 > 0 && r1 > 0, depth0: r0 * SQRT_101_MINUS_1, depth1: r1 * SQRT_101_MINUS_1 };
}

async function oracleEthUsdg() {
  try {
    const [eth, usdg] = await client.multicall({
      contracts: [
        { address: REGISTRY.chainlinkEthUsd as Address, abi: feedAbi, functionName: "latestRoundData" },
        { address: REGISTRY.chainlinkUsdgUsd as Address, abi: feedAbi, functionName: "latestRoundData" },
      ],
      allowFailure: false,
    });
    return { value: Number(eth[1]) / Number(usdg[1]), ageS: Math.floor(Date.now() / 1000) - Number(eth[3]) };
  } catch {
    return null;
  }
}

async function buildState(snaps: SnapshotPool[], blockNumber?: bigint, probe = false): Promise<MarketState> {
  const t0 = Date.now();
  const block = await client.getBlock(blockNumber ? { blockNumber } : { blockTag: "latest" });
  const [raws, gasPriceWei, oracle] = await Promise.all([readPools(snaps, block.number), client.getGasPrice(), oracleEthUsdg()]);
  const latency = Date.now() - t0;

  // Pass 1: prices and depth in quote units.
  const pre = raws.map((raw) => {
    const { base, quote, pairType } = orient(raw.snap);
    const pr = priceOf(raw);
    const baseIs0 = base.address === raw.snap.token0;
    return { raw, base, quote, pairType, active: pr.active, price: baseIs0 ? pr.p01 : pr.p01 > 0 ? 1 / pr.p01 : 0, depthQuote: baseIs0 ? pr.depth1 : pr.depth0 };
  });

  // Reference ETH price: deepest active WETH/USDG pool, cross-checked against Chainlink.
  const conn = pre.filter((p) => p.pairType === "connector" && p.active).sort((a, b) => b.depthQuote - a.depthQuote)[0];
  const ethUsd = conn?.price ?? oracle?.value ?? 0;
  const deviation = oracle && conn ? (conn.price / oracle.value - 1) * 100 : null;
  const credible = Boolean(conn && conn.depthQuote >= 10_000 && (deviation === null || Math.abs(deviation) <= 2));
  const gasConversion = {
    credible,
    note: conn
      ? `Same-block ${conn.raw.snap.kind.toUpperCase()} ${(conn.raw.snap.fee / 10_000).toFixed(2)} % WETH/USDG pool rate` +
        (deviation === null ? ", no oracle cross-check available." : `, ${deviation >= 0 ? "+" : "−"}${Math.abs(deviation).toFixed(2)} % vs Chainlink (limit ±2 %).`)
      : "No active WETH/USDG pool: gas stays in ETH.",
  };

  // Pass 2: USD value of each stock from its pools against USDG/WETH (depth-weighted).
  const usdOfQuote = (a: Asset) => (a.address === USDG.address ? 1 : a.address === WETH.address ? ethUsd : null);
  const stockUsd = new Map<string, number>();
  const acc = new Map<string, { w: number; v: number }>();
  for (const p of pre) {
    if (p.pairType !== "stock-quote" || !p.active) continue;
    const qUsd = usdOfQuote(p.quote);
    if (!qUsd) continue;
    const w = p.depthQuote * qUsd;
    const a = acc.get(p.base.address) ?? { w: 0, v: 0 };
    acc.set(p.base.address, { w: a.w + w, v: a.v + w * p.price * qUsd });
  }
  acc.forEach((a, k) => a.w > 0 && stockUsd.set(k, a.v / a.w));
  const usdOf = (a: Asset) => usdOfQuote(a) ?? stockUsd.get(a.address) ?? null;

  const pools: LivePool[] = pre.map((p) => {
    const qUsd = usdOf(p.quote);
    const depthUsd = qUsd ? p.depthQuote * qUsd : 0;
    let state: PoolState = "routable";
    if (!p.active) state = "inactive";
    else if (qUsd === null) state = "no-usd";
    else if (depthUsd < DUST_USD) state = "dust";
    return {
      snap: p.raw.snap,
      sqrtPriceX96: p.raw.sqrtPriceX96,
      liquidity: p.raw.liquidity,
      reserve0: p.raw.reserve0,
      reserve1: p.raw.reserve1,
      address: p.raw.snap.address,
      venue: p.raw.snap.kind,
      feePips: p.raw.snap.fee,
      pairType: p.pairType,
      base: p.base,
      quote: p.quote,
      state,
      probeImpactBps: null,
      price: p.price,
      priceUsd: p.active && qUsd ? p.price * qUsd : null,
      depthUsd,
    };
  });

  if (probe) await probePools(pools, block.number, usdOf);

  return {
    meta: {
      network: "Robinhood Chain",
      chainId: REGISTRY.chainId,
      block: Number(block.number),
      blockTimestamp: Number(block.timestamp),
      fetchedAt: new Date().toISOString(),
      rpcLatencyMs: latency,
    },
    blockNumber: block.number,
    pools,
    ethUsd,
    gasPriceWei,
    gasConversion,
  };
}

const marketState = () => cached("state", 15_000, async () => buildState(await discoveredPools(), undefined, true));


/** QuoterV2 calls in multicall chunks of 20 (the RPC caps eth_call gas), four chunks in flight. */
async function quoterBatch(jobs: { tokenIn: Address; tokenOut: Address; amountIn: bigint; fee: number }[], blockNumber: bigint) {
  const chunks: (typeof jobs)[] = [];
  for (let k = 0; k < jobs.length; k += 20) chunks.push(jobs.slice(k, k + 20));
  const out: { status: string; result?: unknown }[][] = new Array(chunks.length);
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const i = next++;
      out[i] = (await client.multicall({
        contracts: chunks[i].map((j) => ({
          address: REGISTRY.quoterV2 as Address,
          abi: quoterAbi,
          functionName: "quoteExactInputSingle",
          args: [{ tokenIn: j.tokenIn, tokenOut: j.tokenOut, amountIn: j.amountIn, fee: j.fee, sqrtPriceLimitX96: 0n }],
        })),
        blockNumber,
        allowFailure: true,
      })) as unknown as { status: string; result?: unknown }[];
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return out.flat();
}

// ------------------------------------------------------------------ depth probes

const PROBE_MAX_USD = 1_000;
const PROBE_MAX_IMPACT_BPS = 300;
const probeCache = new Map<string, { at: number; impactBps: number | null }>();

/** A V3 position one tick wide reports large liquidity and fills almost nothing: send each pool a real quote. */
async function probePools(pools: LivePool[], blockNumber: bigint, usdOf: (a: Asset) => number | null) {
  const now = Date.now();
  const todo = pools.filter((p) => p.state === "routable" && p.venue === "v3" && (probeCache.get(p.address)?.at ?? 0) < now - 5 * 60_000);
  if (todo.length) {
    const jobs = todo.map((p) => {
      const qUsd = usdOf(p.quote) ?? 1;
      const amountQuote = Math.min(PROBE_MAX_USD, p.depthUsd) / qUsd;
      return { p, amountQuote, job: { tokenIn: p.quote.address, tokenOut: p.base.address, amountIn: toRaw(amountQuote, p.quote.decimals), fee: p.feePips } };
    });
    const res = await quoterBatch(jobs.map((j) => j.job), blockNumber);
    jobs.forEach(({ p, amountQuote }, k) => {
      const r = res[k];
      let impactBps: number | null = null;
      if (r?.status === "success") {
        const out = human((r.result as readonly [bigint])[0], p.base.decimals);
        const expected = (amountQuote / p.price) * (1 - p.feePips / 1e6);
        impactBps = expected > 0 ? Math.max(0, (1 - out / expected) * 10_000) : null;
      }
      probeCache.set(p.address, { at: now, impactBps });
    });
  }
  for (const p of pools) {
    if (p.state !== "routable") continue;
    if (p.venue === "v2") {
      p.probeImpactBps = 0;
      continue;
    }
    const c = probeCache.get(p.address);
    if (!c) continue;
    p.probeImpactBps = c.impactBps;
    if (c.impactBps === null || c.impactBps > PROBE_MAX_IMPACT_BPS) p.state = "hollow";
  }
}

// ------------------------------------------------------------------ routing

const other = (p: Pool, t: Asset) => (p.base.address === t.address ? p.quote : p.base);
const spotRate = (p: Pool, tIn: Asset) => (p.base.address === tIn.address ? p.price : 1 / p.price);
const usdOfAsset = (s: MarketState, a: Asset) =>
  a.address === USDG.address ? 1 : a.address === WETH.address ? s.ethUsd : (s.pools.find((p) => p.base.address === a.address && p.priceUsd)?.priceUsd ?? 0);

function enumerateCycles(pools: LivePool[], settlement: Asset, maxHops: number) {
  const byToken = new Map<string, LivePool[]>();
  for (const p of pools) {
    if (p.state !== "routable") continue;
    for (const t of [p.base, p.quote]) byToken.set(t.address, [...(byToken.get(t.address) ?? []), p]);
  }
  const cycles: LivePool[][] = [];
  const walk = (tok: Asset, path: LivePool[], seen: Set<string>) => {
    if (cycles.length > 20_000) return;
    for (const p of byToken.get(tok.address) ?? []) {
      if (path.includes(p)) continue;
      const next = other(p, tok);
      const np = [...path, p];
      if (next.address === settlement.address) {
        if (np.length >= 2) cycles.push(np);
        continue;
      }
      if (np.length >= maxHops || seen.has(next.address)) continue;
      walk(next, np, new Set([...seen, next.address]));
    }
  };
  walk(settlement, [], new Set([settlement.address]));
  return cycles;
}

function pathTokens(path: Pool[], settlement: Asset) {
  const toks = [settlement];
  for (const p of path) toks.push(other(p, toks[toks.length - 1]));
  return toks;
}

function v2Out(p: LivePool, tIn: Asset, amountIn: bigint) {
  const inIs0 = tIn.address === p.snap.token0;
  const rIn = inIs0 ? p.reserve0! : p.reserve1!;
  const rOut = inIs0 ? p.reserve1! : p.reserve0!;
  const withFee = amountIn * 997n;
  return (withFee * rOut) / (rIn * 1000n + withFee);
}

/** Quotes many loops hop by hop: one multicall of QuoterV2 calls per hop level. */
async function quoteLoops(state: MarketState, loops: { path: LivePool[]; settlement: Asset; amountIn: number }[], blockNumber: bigint) {
  const n = loops.length;
  const toks = loops.map((l) => pathTokens(l.path, l.settlement));
  const amounts: (bigint | null)[] = loops.map((l) => toRaw(l.amountIn, l.settlement.decimals));
  const hopsOut: Hop[][] = loops.map(() => []);
  const maxLen = Math.max(0, ...loops.map((l) => l.path.length));
  for (let level = 0; level < maxLen; level++) {
    const v3Jobs: { i: number; p: LivePool; tIn: Asset; tOut: Asset; amt: bigint }[] = [];
    for (let i = 0; i < n; i++) {
      const p = loops[i].path[level];
      const amt = amounts[i];
      if (!p || amt === null) continue;
      const tIn = toks[i][level];
      const tOut = toks[i][level + 1];
      if (p.venue === "v2") {
        const out = v2Out(p, tIn, amt);
        amounts[i] = out > 0n ? out : null;
        hopsOut[i].push({ pool: p.address, venue: "v2", feePips: p.feePips, tokenIn: tIn, tokenOut: tOut, amountIn: human(amt, tIn.decimals), amountOut: human(out, tOut.decimals), ticksCrossed: 0 });
      } else v3Jobs.push({ i, p, tIn, tOut, amt });
    }
    if (!v3Jobs.length) continue;
    const res = await quoterBatch(
      v3Jobs.map((j) => ({ tokenIn: j.tIn.address, tokenOut: j.tOut.address, amountIn: j.amt, fee: j.p.feePips })),
      blockNumber,
    );
    v3Jobs.forEach((j, k) => {
      const r = res[k];
      if (r.status !== "success") {
        amounts[j.i] = null;
        return;
      }
      const [out, , ticks] = r.result as readonly [bigint, bigint, number, bigint];
      amounts[j.i] = out > 0n ? out : null;
      hopsOut[j.i].push({ pool: j.p.address, venue: "v3", feePips: j.p.feePips, tokenIn: j.tIn, tokenOut: j.tOut, amountIn: human(j.amt, j.tIn.decimals), amountOut: human(out, j.tOut.decimals), ticksCrossed: Number(ticks) });
    });
  }

  const now = Date.now();
  return loops.map((l, i): RouteQuote | null => {
    const out = amounts[i];
    if (out === null) return null;
    const s = l.settlement;
    const cycleOutput = human(out, s.decimals);
    const edge = l.path.reduce((acc, p, k) => acc * spotRate(p, toks[i][k]) * (1 - p.feePips / 1e6), 1);
    const gross = cycleOutput - l.amountIn;
    const protocolFeeBps = 0;
    const protocolFee = gross > 0 ? (gross * protocolFeeBps) / 10_000 : 0;
    const gasUnits = GAS_UNITS[l.path.length] ?? 472_300;
    const gasEth = (gasUnits * Number(state.gasPriceWei)) / 1e18;
    const gasSettlement = s.address === WETH.address ? gasEth : state.gasConversion.credible ? gasEth * state.ethUsd : null;
    const net = gasSettlement === null ? null : gross - protocolFee - gasSettlement;
    const verdict: Verdict = net === null ? "incomplete" : net > 0 ? "eligible" : gross > 0 ? "gas-exceeds" : "no-profit";
    return {
      id: routeId(s, l.path),
      settlement: s,
      block: Number(blockNumber),
      quotedAt: now,
      expiresAt: now + QUOTE_TTL_MS,
      amountIn: l.amountIn,
      cycleOutput,
      hops: hopsOut[i],
      rawEdgeBps: (edge - 1) * 10_000,
      impactBps: edge > 0 ? Math.max(0, (1 - cycleOutput / (l.amountIn * edge)) * 10_000) : 0,
      grossResult: gross,
      protocolFeeBps,
      protocolFee,
      gasUnits,
      gasPriceGwei: Number(state.gasPriceWei) / 1e9,
      gasEth,
      gasSettlement,
      netResult: net,
      verdict,
    };
  });
}

const routeId = (s: Asset, path: Pool[]) => `${s.symbol}:${path.map((p) => p.address.slice(2).toLowerCase()).join("-")}`;

async function resolveRoute(id: string) {
  const known = await discoveredPools();
  const [sym, rest] = id.split(":");
  const settlement = sym === "WETH" ? WETH : sym === "USDG" ? USDG : null;
  if (!settlement || !rest) return null;
  const snaps = rest.split("-").map((a) => known.find((p) => p.address.slice(2).toLowerCase() === a.toLowerCase()));
  if (snaps.length < 2 || snaps.length > 4 || snaps.some((s) => !s)) return null;
  return { settlement, snaps: snaps as SnapshotPool[] };
}

// ------------------------------------------------------------------ simulation

function explainRevert(name: string, args: readonly unknown[] | undefined, sym: string, dec: number) {
  const a = (i: number) => (args?.[i] !== undefined ? human(args[i] as bigint, dec).toFixed(dec) : "?");
  switch (name) {
    case "CycleNotProfitable":
      return `The loop returns ${a(1)} ${sym} but owes ${a(0)} to the first pool, so it would lose money at this block.`;
    case "MinProfitNotMet":
      return `Profit ${a(0)} ${sym} is below the required minimum ${a(1)} ${sym}.`;
    case "DeadlineExpired":
      return "The deadline passed before the call would land.";
    case "Paused":
      return "The executor is paused by its owner.";
    case "TokenNotAllowed":
      return "A token in this route is not on the executor's allow-list.";
    case "PoolNotCanonical":
      return "A hop is not the canonical factory pool for its tokens.";
    case "PartialFill":
      return "A pool could not fill the full amount.";
    default:
      return `The executor reverted with ${name}.`;
  }
}

async function simulate(q: RouteQuote, snaps: SnapshotPool[], req: QuoteRequest, blockTimestamp: bigint): Promise<Simulation> {
  const s = q.settlement;
  const toks = [s];
  const hops = snaps.map((p) => {
    const tIn = toks[toks.length - 1];
    const tOut = token(p.token0)!.address === tIn.address ? token(p.token1)! : token(p.token0)!;
    toks.push(tOut);
    return { pool: p.address, tokenIn: tIn.address, tokenOut: tOut.address, fee: p.kind === "v3" ? p.fee : 0, kind: p.kind === "v3" ? 1 : 0 };
  });
  const minProfit = req.minProfit ?? q.gasSettlement ?? 0;
  const deadlineAt = Number(blockTimestamp) + (req.deadlineSec ?? 120);
  const data = encodeFunctionData({
    abi: executorAbi,
    functionName: "execute",
    args: [hops, toRaw(q.amountIn, s.decimals), toRaw(minProfit, s.decimals), BigInt(deadlineAt)],
  });
  const account = (req.from && /^0x[0-9a-fA-F]{40}$/.test(req.from) ? getAddress(req.from) : PLACEHOLDER_SENDER) as Address;
  const base = { mode: "deployed" as const, simulatedAt: new Date().toISOString(), block: q.block, minProfit, deadlineAt, calldata: data, to: EXECUTOR, live: true };
  try {
    await client.call({ account, to: EXECUTOR, data });
    let gasUnits: number | null = null;
    try {
      gasUnits = Number(await client.estimateGas({ account, to: EXECUTOR, data }));
    } catch {}
    return { ...base, ok: true, revertName: null, revertReason: null, gasUnits };
  } catch (err) {
    let name = "Reverted";
    let args: readonly unknown[] | undefined;
    if (err instanceof BaseError) {
      const raw = err.walk((e) => typeof (e as { data?: unknown }).data === "string") as { data?: Hex } | null;
      const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
      const hex = raw?.data ?? (reverted?.raw as Hex | undefined);
      if (hex && hex.length >= 10) {
        try {
          const d = decodeErrorResult({ abi: executorAbi, data: hex });
          name = d.errorName;
          args = d.args as readonly unknown[] | undefined;
        } catch {
          name = "UnknownRevert";
        }
      }
    }
    return { ...base, ok: false, revertName: name, revertReason: explainRevert(name, args, s.symbol, s.decimals), gasUnits: null };
  }
}

// ------------------------------------------------------------------ history

const historyState: { scannedTo: bigint; rows: Execution[] } = { scannedTo: EXECUTOR_DEPLOY_BLOCK - 1n, rows: [] };
const REORG_DEPTH = 256n;
const CYCLE_EVENT = parseAbiItem("event CycleExecuted(address indexed caller, address indexed settlementToken, uint256 amountIn, uint256 grossProfit, uint256 userProfit, uint256 protocolFee, address[] pools)");

function pathFromPools(settlement: Asset, pools: Address[]) {
  const syms = [settlement.symbol];
  let cur = settlement;
  for (const a of pools) {
    const sp = SNAPSHOT.pools.find((p) => p.address.toLowerCase() === a.toLowerCase());
    if (!sp) {
      syms.push("?");
      continue;
    }
    cur = (token(sp.token0)!.address === cur.address ? token(sp.token1) : token(sp.token0)) ?? cur;
    syms.push(cur.symbol);
  }
  return syms;
}

async function syncHistory() {
  const head = await client.getBlockNumber();
  const from = historyState.scannedTo - REORG_DEPTH > EXECUTOR_DEPLOY_BLOCK ? historyState.scannedTo - REORG_DEPTH : EXECUTOR_DEPLOY_BLOCK;
  historyState.rows = historyState.rows.filter((r) => BigInt(r.block) < from);
  for (let start = from; start <= head; start += 400_000n) {
    const end = start + 399_999n > head ? head : start + 399_999n;
    const logs = await client.getLogs({ address: EXECUTOR, event: CYCLE_EVENT, fromBlock: start, toBlock: end });
    for (const log of logs) {
      const ev = decodeEventLog({ abi: executorAbi, data: log.data, topics: log.topics, eventName: "CycleExecuted" });
      const a = ev.args as { caller: Address; settlementToken: Address; amountIn: bigint; grossProfit: bigint; userProfit: bigint; protocolFee: bigint; pools: readonly Address[] };
      const s = token(a.settlementToken) ?? USDG;
      const [blk, rcpt] = await Promise.all([client.getBlock({ blockNumber: log.blockNumber! }), client.getTransactionReceipt({ hash: log.transactionHash! })]);
      historyState.rows.push({
        txHash: log.transactionHash!,
        block: Number(log.blockNumber),
        timestamp: Number(blk.timestamp),
        caller: a.caller,
        settlement: s,
        pools: [...a.pools],
        path: pathFromPools(s, [...a.pools]),
        amountIn: human(a.amountIn, s.decimals),
        grossProfit: human(a.grossProfit, s.decimals),
        userProfit: human(a.userProfit, s.decimals),
        protocolFee: human(a.protocolFee, s.decimals),
        gasEth: human(rcpt.gasUsed * rcpt.effectiveGasPrice, 18),
        confirmation: "l2",
      });
    }
  }
  historyState.scannedTo = head;
  const [safe, fin] = await Promise.all([client.getBlock({ blockTag: "safe" }), client.getBlock({ blockTag: "finalized" })]);
  for (const r of historyState.rows) r.confirmation = BigInt(r.block) <= fin.number ? "finalized" : BigInt(r.block) <= safe.number ? "safe" : "l2";
  historyState.rows.sort((x, y) => y.block - x.block);
  return { head, safe: safe.number, finalized: fin.number };
}

// ------------------------------------------------------------------ provider

export const chainProvider: DataProvider = {
  async markets(): Promise<MarketsSnapshot> {
    const s = await marketState();
    const stockPools = s.pools.filter((p) => p.pairType === "stock-quote");
    const bases = [...new Set(stockPools.map((p) => p.base.address))];
    const markets: MarketRow[] = bases
      .map((addr) => {
        const ps = stockPools.filter((p) => p.base.address === addr);
        const usd = ps.filter((p) => p.state === "routable" && p.priceUsd).map((p) => p.priceUsd!);
        return {
          stock: ps[0].base,
          pools: ps.map(strip),
          rawSpreadBps: usd.length > 1 ? ((Math.max(...usd) - Math.min(...usd)) / Math.min(...usd)) * 10_000 : null,
          totalDepthUsd: ps.reduce((a, p) => a + p.depthUsd, 0),
        };
      })
      .sort((a, b) => a.stock.symbol.localeCompare(b.stock.symbol));
    return {
      meta: s.meta,
      ethUsd: s.ethUsd,
      gasPriceGwei: Number(s.gasPriceWei) / 1e9,
      gasConversion: s.gasConversion,
      markets,
      connectors: s.pools.filter((p) => p.pairType === "connector").map(strip),
      stockStock: s.pools.filter((p) => p.pairType === "stock-stock").map(strip),
      counts: {
        stocksListed: TOKENS.filter((t) => t.kind === "stock").length,
        stocksWithPools: bases.length,
        poolsDiscovered: s.pools.length,
        poolsRoutable: s.pools.filter((p) => p.state === "routable").length,
        v2: s.pools.filter((p) => p.venue === "v2").length,
        v3: s.pools.filter((p) => p.venue === "v3").length,
        v4Listed: V4.rows.length,
      },
    };
  },

  routes({ settlement, maxHops, token: tokenFilter }) {
    return cached(`routes:${settlement}:${maxHops}:${tokenFilter ?? ""}`, 20_000, async (): Promise<RoutesSnapshot> => {
      const s = await marketState();
      const settle = settlement === "WETH" ? WETH : USDG;
      const settleUsd = usdOfAsset(s, settle);
      let cycles = enumerateCycles(s.pools, settle, Math.min(4, Math.max(2, maxHops)));
      if (tokenFilter) cycles = cycles.filter((c) => c.some((p) => p.base.address.toLowerCase() === tokenFilter.toLowerCase() || p.quote.address.toLowerCase() === tokenFilter.toLowerCase()));
      const ranked = cycles
        .map((path) => {
          const toks = pathTokens(path, settle);
          return { path, edge: path.reduce((acc, p, k) => acc * spotRate(p, toks[k]) * (1 - p.feePips / 1e6), 1) };
        })
        .sort((a, b) => b.edge - a.edge)
        .slice(0, MAX_QUOTED);
      // Each candidate is quoted at five sizes scaled to its shallowest pool; the best one is kept.
      const loops = ranked.flatMap(({ path }) => {
        const shallow = Math.min(...path.map((p) => p.depthUsd));
        return LADDER.map((f) => ({ path, settlement: settle, amountIn: Math.min(MAX_SIZE_USD, f * shallow) / (settleUsd || 1) }));
      });
      const quotedAll = await quoteLoops(s, loops, s.blockNumber);
      const score = (q: RouteQuote) => q.netResult ?? q.grossResult - 1e9;
      const best: RouteQuote[] = [];
      let failed = 0;
      for (let i = 0; i < ranked.length; i++) {
        const tries = quotedAll.slice(i * LADDER.length, (i + 1) * LADDER.length).filter((q): q is RouteQuote => q !== null);
        if (!tries.length) failed++;
        else best.push(tries.reduce((a, b) => (score(b) > score(a) ? b : a)));
      }
      const quoted = best.sort((a, b) => score(b) - score(a));
      const eligible = quoted.filter((q) => q.verdict === "eligible").length;
      const rejection = (["no-profit", "gas-exceeds", "incomplete"] as Verdict[])
        .map((reason) => ({ reason, count: quoted.filter((q) => q.verdict === reason).length + (reason === "incomplete" ? failed : 0) }))
        .filter((x) => x.count > 0);
      const routablePools = s.pools.filter((p) => p.state === "routable").length;
      const b = s.meta.block.toLocaleString("en-US");
      return {
        meta: s.meta,
        settlement: settle,
        candidatesRanked: cycles.length,
        quoted,
        eligible,
        rejection,
        excluded: {
          inactive: s.pools.filter((p) => p.state === "inactive").length,
          dust: s.pools.filter((p) => p.state === "dust").length,
          hollow: s.pools.filter((p) => p.state === "hollow").length,
          unprobed: s.pools.filter((p) => p.state === "no-usd").length,
          v4: V4.rows.length,
        },
        gasConversion: s.gasConversion,
        routablePools,
        note: eligible
          ? `${eligible} loop${eligible > 1 ? "s" : ""} clear every cost at block ${b}. Open one to re-quote at the newest block before trusting it.`
          : `Nothing clears costs at block ${b}: ${quoted.length} loops quoted across ${routablePools} routable pools. That is what a well-arbitraged market looks like — the rows below show how far each one is from paying.`,
      };
    });
  },

  async quote(req: QuoteRequest): Promise<QuoteResponse> {
    const r = await resolveRoute(req.routeId);
    if (!r) throw new Error("Unknown route: its pools are not in the verified pool set.");
    const ref = await marketState();
    const fresh = await buildState(r.snaps);
    // keep the reference ETH price and gas rate from the full market read
    const state: MarketState = { ...fresh, ethUsd: ref.ethUsd || fresh.ethUsd, gasConversion: ref.gasConversion };
    const path = r.snaps.map((sp) => state.pools.find((p) => p.address === sp.address)!);
    if (path.some((p) => p.state === "inactive")) throw new Error("A pool in this route has no active liquidity right now.");
    const [q] = await quoteLoops(state, [{ path, settlement: r.settlement, amountIn: req.amountIn }], state.blockNumber);
    if (!q) throw new Error("The on-chain quoter could not fill this route at this size.");
    const simulation = req.simulate ? await simulate(q, r.snaps, req, BigInt(state.meta.blockTimestamp)) : null;
    return { quote: q, simulation };
  },

  async activity({ caller, page, limit }): Promise<ActivityPage> {
    const head = await cached("history", 15_000, syncHistory);
    let rows = historyState.rows;
    if (caller) rows = rows.filter((r) => r.caller.toLowerCase() === caller.toLowerCase());
    const pages = Math.max(1, Math.ceil(rows.length / limit));
    const p = Math.min(Math.max(1, page), pages);
    return {
      available: true,
      head: { latest: Number(head.head), safe: Number(head.safe), finalized: Number(head.finalized) },
      rows: rows.slice((p - 1) * limit, p * limit),
      total: rows.length,
      page: p,
      pages,
      limit,
      caller: (caller as Address) ?? null,
    };
  },

  status() {
    return cached("status", 10_000, async (): Promise<StatusSnapshot> => {
      const t0 = Date.now();
      const [latest, safe, fin, gasPrice, chainId] = await Promise.all([
        client.getBlock({ blockTag: "latest" }),
        client.getBlock({ blockTag: "safe" }),
        client.getBlock({ blockTag: "finalized" }),
        client.getGasPrice(),
        client.getChainId(),
      ]);
      const latency = Date.now() - t0;
      const code = await client.getCode({ address: EXECUTOR });
      const reads = code
        ? await client.multicall({
            contracts: (["VERSION", "owner", "feeRecipient", "paused", "protocolFeeBps", "v2Factory", "v3Factory"] as const).map((fn) => ({ address: EXECUTOR, abi: executorAbi, functionName: fn })),
            allowFailure: true,
          })
        : [];
      const val = <T,>(i: number, d: T) => (reads[i]?.status === "success" ? (reads[i].result as T) : d);
      const version = val<string>(0, "");
      const owner = val<Address>(1, "0x0000000000000000000000000000000000000000");
      const feeRecipient = val<Address>(2, owner);
      const paused = val(3, false);
      const feeBps = Number(val<bigint>(4, 0n));
      const v2f = val<Address>(5, "0x");
      const v3f = val<Address>(6, "0x");
      const checks = [
        { label: "Bytecode present", ok: Boolean(code), detail: code ? `${(code.length - 2) / 2} bytes` : "no code at this address" },
        { label: "Answers as KerfExecutor", ok: version !== "", detail: version ? `VERSION ${version}` : "VERSION() failed" },
        { label: "V2 factory matches registry", ok: v2f.toLowerCase() === REGISTRY.uniswapV2Factory.toLowerCase(), detail: v2f },
        { label: "V3 factory matches registry", ok: v3f.toLowerCase() === REGISTRY.uniswapV3Factory.toLowerCase(), detail: v3f },
        { label: "Protocol fee under the 10 % cap", ok: feeBps <= 1000, detail: `${feeBps} bps (cap 1000)` },
        { label: "Chain id is 4663", ok: chainId === REGISTRY.chainId, detail: String(chainId) },
      ];
      return {
        network: { name: "Robinhood Chain", chainId, explorer: REGISTRY.explorer, rpcHost: new URL(RPC_URL).host, rpcKind: RPC_KIND },
        head: { block: Number(latest.number), timestamp: Number(latest.timestamp), latencyMs: latency },
        safe: { block: Number(safe.number), timestamp: Number(safe.timestamp) },
        finalized: { block: Number(fin.number), timestamp: Number(fin.timestamp) },
        gasPriceGwei: Number(gasPrice) / 1e9,
        adapters: [
          { id: "v2", label: "Uniswap V2 pairs", address: REGISTRY.uniswapV2Factory as Address, status: "supported", detail: "0.30 % fixed fee · flash swap via uniswapV2Call · constant-product quote on same-block reserves" },
          { id: "v3", label: "Uniswap V3 pools", address: REGISTRY.uniswapV3Factory as Address, status: "supported", detail: `Tiers 0.01 / 0.05 / 0.30 / 1 % · flash swap via uniswapV3SwapCallback · QuoterV2 ${REGISTRY.quoterV2}` },
          { id: "v4", label: "Uniswap v4 pools", address: REGISTRY.v4PoolManager as Address, status: "unsupported", detail: `${V4.rows.length.toLocaleString("en-US")} pools between verified assets initialised (census block ${V4.block.toLocaleString("en-US")}) · listed, never routed: hooks can rewrite fees and curves, and the executor has no v4 settlement path.` },
        ],
        simulation: { mode: "deployed", label: "eth_call of the exact execute() call against the deployed executor" },
        executor: { address: EXECUTOR, verified: checks.every((c) => c.ok), version: version || "?", protocolFeeBps: feeBps, paused, owner, feeRecipient, checks },
        registry: [
          { label: "Network", source: "docs.robinhood.com/chain + live eth_chainId", verifiedAt: "2026-09-24", method: `chain id ${chainId}, ${RPC_KIND} RPC` },
          { label: "DEX deployments", source: "Uniswap deployments registry (chain 4663)", verifiedAt: "2026-09-24", method: "factory addresses checked against the executor's immutables" },
          { label: "Stock tokens", source: REGISTRY.assetsApi, verifiedAt: "2026-09-24", method: `${TOKENS.length - 2} tokens · issuer beacon ${REGISTRY.stockBeacon}` },
          { label: "Pool snapshot", source: "factory.getPool / getPair for every token × {USDG, WETH} × tier", verifiedAt: SNAPSHOT.generatedAt.slice(0, 10), method: `${SNAPSHOT.pools.length} pools at block ${SNAPSHOT.block.toLocaleString("en-US")} · npm run snapshot:pools` },
          { label: "v4 census", source: "PoolManager Initialize events", verifiedAt: V4.generatedAt.slice(0, 10), method: `${V4.rows.length} pools · listed only, never priced · npm run census:v4` },
          { label: "Oracles", source: "Chainlink ETH/USD and USDG/USD", verifiedAt: "2026-09-24", method: "cross-check of the gas conversion rate only" },
        ],
        fetchedAt: new Date().toISOString(),
      };
    });
  },

  async token(): Promise<TokenInfo> {
    const addr = process.env.NEXT_PUBLIC_TOKEN_ADDRESS as Address | undefined;
    const block = Number(await client.getBlockNumber());
    if (!addr) {
      return { status: "soon", symbol: "KERF", address: null, block, name: "Kerf", decimals: 18, totalSupply: 0, market: null, marketReason: "The token has not launched yet. Its address will be published here first." };
    }
    const [name, symbol, decimals, supply] = await client.multicall({
      contracts: (["name", "symbol", "decimals", "totalSupply"] as const).map((fn) => ({ address: addr, abi: erc20Abi, functionName: fn })),
      allowFailure: false,
    });
    const dec = Number(decimals);
    // canonical pools against USDG / WETH
    const probes = [USDG, WETH].flatMap((q) => [
      { q, kind: "v2" as const, fee: 3000, call: { address: REGISTRY.uniswapV2Factory as Address, abi: factoryAbi, functionName: "getPair" as const, args: [addr, q.address] as const } },
      ...REGISTRY.v3FeeTiers.map((fee) => ({ q, kind: "v3" as const, fee, call: { address: REGISTRY.uniswapV3Factory as Address, abi: factoryAbi, functionName: "getPool" as const, args: [addr, q.address, fee] as const } })),
    ]);
    const found = (await client.multicall({ contracts: probes.map((p) => p.call) as never, allowFailure: true })) as unknown as { status: string; result?: unknown }[];
    const snaps: SnapshotPool[] = [];
    found.forEach((f, i) => {
      const a = f.status === "success" ? (f.result as Address) : null;
      if (!a || /^0x0+$/.test(a)) return;
      const [t0, t1] = BigInt(addr) < BigInt(probes[i].q.address) ? [addr, probes[i].q.address] : [probes[i].q.address, addr];
      snaps.push({ address: a, kind: probes[i].kind, fee: probes[i].fee, token0: t0, token1: t1 });
    });
    let market: TokenInfo["market"] = null;
    if (snaps.length) {
      const ref = await marketState();
      const raws = await readPools(snaps, BigInt(block));
      const self = { address: addr, symbol: String(symbol), name: String(name), decimals: dec, kind: "stock" as const };
      const best = raws
        .map((raw) => {
          const t0 = raw.snap.token0 === addr ? self : token(raw.snap.token0)!;
          const t1 = raw.snap.token1 === addr ? self : token(raw.snap.token1)!;
          const pr = raw.snap.kind === "v3"
            ? (() => { const s = Number(raw.sqrtPriceX96) / 2 ** 96; const L = Number(raw.liquidity); return { p01: s * s * 10 ** (t0.decimals - t1.decimals), active: L > 0, d1: (L * s * SQRT_101_MINUS_1) / 10 ** t1.decimals, d0: s > 0 ? ((L / s) * SQRT_101_MINUS_1) / 10 ** t0.decimals : 0 }; })()
            : (() => { const r0 = human(raw.reserve0!, t0.decimals), r1 = human(raw.reserve1!, t1.decimals); return { p01: r0 ? r1 / r0 : 0, active: r0 > 0 && r1 > 0, d1: r1 * SQRT_101_MINUS_1, d0: r0 * SQRT_101_MINUS_1 }; })();
          const selfIs0 = raw.snap.token0 === addr;
          const q = selfIs0 ? t1 : t0;
          const qUsd = q.address === USDG.address ? 1 : ref.ethUsd;
          return { raw, active: pr.active, price: (selfIs0 ? pr.p01 : 1 / pr.p01) * qUsd, depthUsd: (selfIs0 ? pr.d1 : pr.d0) * qUsd, q };
        })
        .filter((x) => x.active)
        .sort((a, b) => b.depthUsd - a.depthUsd)[0];
      if (best) market = { venue: `${best.raw.snap.kind.toUpperCase()} ${(best.raw.snap.fee / 10_000).toFixed(2)} % vs ${best.q.symbol}`, price: best.price, depthUsd: best.depthUsd };
    }
    return {
      status: "live",
      symbol: String(symbol),
      address: addr,
      block,
      name: String(name),
      decimals: dec,
      totalSupply: human(supply as bigint, dec),
      market,
      marketReason: market ? "" : "No canonical Uniswap V2 / V3 pool against USDG or WETH holds liquidity yet (a launchpad curve is not a Uniswap pool).",
    };
  },

  async v4Pools({ page, includeExtreme }): Promise<V4Page> {
    const all = V4.rows;
    const shown = includeExtreme ? all : all.filter((r) => !isExtreme(r[3]));
    const limit = 25;
    const pages = Math.max(1, Math.ceil(shown.length / limit));
    const p = Math.min(Math.max(1, page), pages);
    return {
      total: shown.length,
      hiddenExtreme: all.length - shown.length,
      page: p,
      pages,
      rows: shown.slice((p - 1) * limit, p * limit).map((r) => ({ id: r[0] as `0x${string}`, symbols: [r[1], r[2]], feePips: r[3], tickSpacing: r[4], hooks: r[5] as Address, createdBlock: r[6] })),
      snapshotBlock: V4.block,
    };
  },
};

function strip(p: LivePool): Pool {
  return {
    address: p.address,
    venue: p.venue,
    feePips: p.feePips,
    pairType: p.pairType,
    base: p.base,
    quote: p.quote,
    state: p.state,
    probeImpactBps: p.probeImpactBps,
    price: p.price,
    priceUsd: p.priceUsd,
    depthUsd: p.depthUsd,
  };
}
