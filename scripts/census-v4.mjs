// Rebuilds src/config/v4-pools.json: every Uniswap v4 pool initialised between two
// registry assets, read from the PoolManager's Initialize events. Listed only —
// Kerf never prices or routes v4 (hooks can change fees and curves).
//   node scripts/census-v4.mjs          (uses KERF_RPC_URL or the public RPC)
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, http, parseAbiItem, getAddress } from "viem";

const RPC = process.env.KERF_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const client = createPublicClient({ transport: http(RPC, { retryCount: 5, timeout: 60_000 }) });
const event = parseAbiItem("event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)");

const tokens = JSON.parse(readFileSync("src/config/tokens.json", "utf8"));
const sym = new Map(tokens.map((t) => [t.address.toLowerCase(), t.symbol]));
sym.set("0x0000000000000000000000000000000000000000", "ETH");

// the public RPC is not archival (getCode on old blocks fails), so scan logs from genesis
const head = await client.getBlockNumber();
const lo = BigInt(process.env.V4_FROM_BLOCK || 0);

// halve the range whenever the RPC's 10 000-log cap is hit
async function fetchLogs(from, to) {
  try {
    return await client.getLogs({ address: MANAGER, event, fromBlock: from, toBlock: to });
  } catch (e) {
    if (!String(e?.cause?.message ?? e?.message).includes("exceeds limit") || to <= from) throw e;
    const mid = (from + to) / 2n;
    return [...(await fetchLogs(from, mid)), ...(await fetchLogs(mid + 1n, to))];
  }
}

const rows = [];
const STEP = BigInt(process.env.V4_STEP || 2_000_000);
for (let from = lo; from <= head; from += STEP) {
  const to = from + STEP - 1n > head ? head : from + STEP - 1n;
  const logs = await fetchLogs(from, to);
  for (const l of logs) {
    const a = l.args;
    const s0 = sym.get(a.currency0.toLowerCase());
    const s1 = sym.get(a.currency1.toLowerCase());
    if (!s0 || !s1) continue;
    rows.push({ id: a.id, symbols: [s0, s1], feePips: Number(a.fee), tickSpacing: Number(a.tickSpacing), hooks: getAddress(a.hooks), createdBlock: Number(l.blockNumber) });
  }
  process.stdout.write(`\r${to - lo}/${head - lo} blocks · ${rows.length} pools`);
}
rows.sort((x, y) => y.createdBlock - x.createdBlock);
const cols = ["id", "s0", "s1", "fee", "tickSpacing", "hooks", "createdBlock"];
writeFileSync("src/config/v4-pools.json", JSON.stringify({ block: Number(head), generatedAt: new Date().toISOString(), cols, rows: rows.map((r) => [r.id, r.symbols[0], r.symbols[1], r.feePips, r.tickSpacing, r.hooks, r.createdBlock]) }));
console.log(`\n${rows.length} v4 pools between registry assets at block ${head}`);
