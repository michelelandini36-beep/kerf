"use client";
import { fakeHex } from "./data/catalog";
import type { Execution, QuoteResponse } from "./data/types";

// Transaction lifecycle for "Review and execute".
// DEMO IMPLEMENTATION: it walks the same states a real submission goes
// through, with timers instead of a chain. To go live, replace `submitCycle`
// with: re-quote + simulate on the server → eth_sendTransaction with the
// returned calldata to NEXT_PUBLIC_EXECUTOR_ADDRESS → poll the receipt and
// decode CycleExecuted. The UI only depends on the TxPhase callbacks.

export type TxPhase = "resimulating" | "awaiting-wallet" | "submitted" | "pending" | "confirmed" | "reverted" | "rejected";

export interface TxUpdate {
  phase: TxPhase;
  txHash?: `0x${string}`;
  detail?: string;
  execution?: Execution;
}

const LOCAL = "kerf.local-executions";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function submitCycle(
  res: QuoteResponse,
  wallet: { address: string; kind: "injected" | "demo" },
  onUpdate: (u: TxUpdate) => void,
  signal: { cancelled: boolean },
) {
  onUpdate({ phase: "resimulating", detail: "Re-quoting at the newest block and re-running the exact call." });
  await wait(900);
  if (signal.cancelled) return;
  onUpdate({ phase: "awaiting-wallet", detail: wallet.kind === "demo" ? "Demo wallet: approving automatically." : "Confirm the transaction in your wallet." });
  await wait(1300);
  if (signal.cancelled) return onUpdate({ phase: "rejected", detail: "You rejected the request in the wallet." });
  const txHash = fakeHex("local-tx:" + Date.now(), 32);
  onUpdate({ phase: "submitted", txHash, detail: "Broadcast to the sequencer." });
  await wait(700);
  onUpdate({ phase: "pending", txHash, detail: "Waiting for a receipt." });
  await wait(1200);
  const q = res.quote;
  // Other traders see the same pools: roughly one in five demo fills loses the race.
  const lostRace = Math.random() < 0.2;
  if (!res.simulation?.ok || lostRace) {
    onUpdate({ phase: "reverted", txHash, detail: lostRace ? "Reverted with CycleNotProfitable: the pools moved before inclusion. Gas was still spent." : "Reverted: the simulated call did not clear its minimum." });
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
  onUpdate({ phase: "confirmed", txHash, execution, detail: "Receipt status success · CycleExecuted decoded." });
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
