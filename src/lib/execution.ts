"use client";
import { decodeEventLog, parseAbi, type Hex } from "viem";
import { fakeHex } from "./data/catalog";
import type { Execution, QuoteResponse } from "./data/types";
import { getActiveProvider } from "./wallet";

// Transaction lifecycle for "Review and execute".
//  - Browser wallet + live simulation: re-simulate on the server, send exactly that
//    calldata to the executor with eth_sendTransaction, poll the receipt and decode
//    CycleExecuted. States change only on real events.
//  - Demo wallet (or demo data): the same states, driven by timers. Nothing is signed.

export type TxPhase = "resimulating" | "awaiting-wallet" | "submitted" | "pending" | "confirmed" | "reverted" | "rejected";

export interface TxUpdate {
  phase: TxPhase;
  txHash?: `0x${string}`;
  detail?: string;
  execution?: Execution;
}

const LOCAL = "kerf.local-executions";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cycleEvent = parseAbi([
  "event CycleExecuted(address indexed caller, address indexed settlementToken, uint256 amountIn, uint256 grossProfit, uint256 userProfit, uint256 protocolFee, address[] pools)",
]);

export async function submitCycle(
  res: QuoteResponse,
  wallet: { address: string; kind: "injected" | "demo" },
  onUpdate: (u: TxUpdate) => void,
  signal: { cancelled: boolean },
  resimulate: () => Promise<QuoteResponse>,
) {
  if (wallet.kind === "injected" && res.simulation?.live && res.simulation.to && getActiveProvider()) {
    return submitLive(wallet.address, onUpdate, resimulate);
  }
  return submitDemo(res, wallet, onUpdate, signal);
}

async function submitLive(from: string, onUpdate: (u: TxUpdate) => void, resimulate: () => Promise<QuoteResponse>) {
  const eth = getActiveProvider()!;
  onUpdate({ phase: "resimulating", detail: "Re-quoting at the newest block and re-running the exact call on the server." });
  let fresh: QuoteResponse;
  try {
    fresh = await resimulate();
  } catch (e) {
    return onUpdate({ phase: "reverted", detail: `Nothing was sent: re-simulation failed (${e instanceof Error ? e.message : "error"}).` });
  }
  const sim = fresh.simulation;
  if (!sim?.ok || !sim.to) {
    return onUpdate({ phase: "reverted", detail: `Nothing was sent: the loop no longer clears at the newest block${sim?.revertReason ? ` — ${sim.revertReason}` : "."}` });
  }

  onUpdate({ phase: "awaiting-wallet", detail: "Confirm the transaction in your wallet. It carries exactly the simulated calldata." });
  let txHash: Hex;
  try {
    txHash = (await eth.request({
      method: "eth_sendTransaction",
      params: [{ from, to: sim.to, data: sim.calldata, value: "0x0", ...(sim.gasUnits ? { gas: "0x" + Math.ceil(sim.gasUnits * 1.25).toString(16) } : {}) }],
    })) as Hex;
  } catch (e) {
    const code = (e as { code?: number })?.code;
    return onUpdate({ phase: "rejected", detail: code === 4001 ? "You rejected the request in the wallet." : `The wallet did not send it: ${e instanceof Error ? e.message : "error"}.` });
  }

  onUpdate({ phase: "submitted", txHash, detail: "Broadcast to the sequencer." });
  onUpdate({ phase: "pending", txHash, detail: "Waiting for a receipt." });
  type Receipt = { status: Hex; blockNumber: Hex; gasUsed: Hex; effectiveGasPrice: Hex; logs: { address: string; data: Hex; topics: Hex[] }[] };
  let receipt: Receipt | null = null;
  for (let i = 0; i < 180 && !receipt; i++) {
    await wait(1000);
    receipt = (await eth.request({ method: "eth_getTransactionReceipt", params: [txHash] }).catch(() => null)) as Receipt | null;
  }
  if (!receipt) return onUpdate({ phase: "pending", txHash, detail: "No receipt after 3 minutes. Check the transaction on the explorer." });

  const gasEth = (Number(BigInt(receipt.gasUsed)) * Number(BigInt(receipt.effectiveGasPrice))) / 1e18;
  if (receipt.status !== "0x1") {
    return onUpdate({ phase: "reverted", txHash, detail: `Reverted on-chain: the pools moved before inclusion. Gas spent: ${gasEth.toFixed(9)} ETH.` });
  }
  const q = fresh.quote;
  const log = receipt.logs.find((l) => l.address.toLowerCase() === sim.to!.toLowerCase());
  let execution: Execution | undefined;
  if (log) {
    const ev = decodeEventLog({ abi: cycleEvent, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
    const a = ev.args;
    const d = 10 ** q.settlement.decimals;
    execution = {
      txHash,
      block: Number(BigInt(receipt.blockNumber)),
      timestamp: Math.floor(Date.now() / 1000),
      caller: a.caller,
      settlement: q.settlement,
      pools: [...a.pools],
      path: [q.settlement.symbol, ...q.hops.map((h) => h.tokenOut.symbol)],
      amountIn: Number(a.amountIn) / d,
      grossProfit: Number(a.grossProfit) / d,
      userProfit: Number(a.userProfit) / d,
      protocolFee: Number(a.protocolFee) / d,
      gasEth,
      confirmation: "l2",
    };
    saveLocal(execution);
  }
  onUpdate({ phase: "confirmed", txHash, execution, detail: "Receipt status success · CycleExecuted decoded." });
}

async function submitDemo(res: QuoteResponse, wallet: { address: string }, onUpdate: (u: TxUpdate) => void, signal: { cancelled: boolean }) {
  onUpdate({ phase: "resimulating", detail: "Re-quoting at the newest block and re-running the exact call." });
  await wait(900);
  if (signal.cancelled) return;
  onUpdate({ phase: "awaiting-wallet", detail: "Demo wallet: approving automatically. Nothing is signed." });
  await wait(1300);
  if (signal.cancelled) return onUpdate({ phase: "rejected", detail: "You rejected the request in the wallet." });
  const txHash = fakeHex("local-tx:" + Date.now(), 32);
  onUpdate({ phase: "submitted", txHash, detail: "Demo: pretending to broadcast." });
  await wait(700);
  onUpdate({ phase: "pending", txHash, detail: "Waiting for a receipt." });
  await wait(1200);
  const q = res.quote;
  const lostRace = Math.random() < 0.2;
  if (!res.simulation?.ok || lostRace) {
    onUpdate({ phase: "reverted", txHash, detail: lostRace ? "Demo: reverted with CycleNotProfitable — the pools moved before inclusion." : "Reverted: the simulated call did not clear its minimum." });
    return;
  }
  const execution: Execution = {
    txHash,
    block: q.block + 12,
    timestamp: Math.floor(Date.now() / 1000),
    caller: wallet.address as `0x${string}`,
    settlement: q.settlement,
    pools: q.hops.map((h) => h.pool),
    path: [q.settlement.symbol, ...q.hops.map((h) => h.tokenOut.symbol)],
    amountIn: q.amountIn,
    grossProfit: q.grossResult,
    userProfit: q.grossResult - q.protocolFee,
    protocolFee: q.protocolFee,
    gasEth: q.gasEth,
    confirmation: "l2",
  };
  saveLocal(execution);
  onUpdate({ phase: "confirmed", txHash, execution, detail: "Demo receipt · nothing happened on-chain." });
}

export function loadLocal(): Execution[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL) || "[]") as Execution[];
  } catch {
    return [];
  }
}

function saveLocal(e: Execution) {
  try {
    localStorage.setItem(LOCAL, JSON.stringify([e, ...loadLocal()].slice(0, 50)));
  } catch {}
}
