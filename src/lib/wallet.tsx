"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { BRAND } from "./brand";
import { DEMO_WALLET } from "./data/catalog";

// Wallet state for the whole terminal. Two connectors:
//  - "injected": any EIP-1193 browser wallet (real account, chain and balance)
//  - "demo": a fake funded account so every flow can be tried without one
// Signing/sending lives in execution.ts, never here.

type Eip1193 = { request(args: { method: string; params?: unknown[] }): Promise<unknown>; on?(e: string, cb: (...a: unknown[]) => void): void; removeListener?(e: string, cb: (...a: unknown[]) => void): void };

declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

export type WalletKind = "injected" | "demo";

interface WalletState {
  address: string | null;
  chainId: number | null;
  balanceEth: number | null;
  kind: WalletKind | null;
  status: "idle" | "connecting" | "connected" | "error";
  error: string | null;
  hasInjected: boolean;
  allowDemo: boolean;
  pickerOpen: boolean;
  openPicker(): void;
  closePicker(): void;
  connect(kind: WalletKind): Promise<void>;
  disconnect(): void;
  switchChain(): Promise<void>;
}

const Ctx = createContext<WalletState | null>(null);
const STORE = "kerf.wallet";

export function WalletProvider({ children, allowDemo = false }: { children: React.ReactNode; allowDemo?: boolean }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [balanceEth, setBalance] = useState<number | null>(null);
  const [kind, setKind] = useState<WalletKind | null>(null);
  const [status, setStatus] = useState<WalletState["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hasInjected, setHasInjected] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const readInjected = useCallback(async (eth: Eip1193, acct: string) => {
    const cid = parseInt(String(await eth.request({ method: "eth_chainId" })), 16);
    setChainId(cid);
    try {
      const wei = BigInt(String(await eth.request({ method: "eth_getBalance", params: [acct, "latest"] })));
      setBalance(Number(wei) / 1e18);
    } catch {
      setBalance(null);
    }
  }, []);

  const connect = useCallback(
    async (k: WalletKind) => {
      setError(null);
      setStatus("connecting");
      try {
        if (k === "demo") {
          if (!allowDemo) throw new Error("The demo wallet is only available on demo data.");
          setAddress(DEMO_WALLET);
          setChainId(BRAND.chainId);
          setBalance(0.0184);
        } else {
          const eth = window.ethereum;
          if (!eth) throw new Error("No browser wallet detected.");
          const accts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
          if (!accts?.[0]) throw new Error("The wallet returned no account.");
          setAddress(accts[0]);
          await readInjected(eth, accts[0]);
        }
        setKind(k);
        setStatus("connected");
        setPickerOpen(false);
        try {
          localStorage.setItem(STORE, k);
        } catch {}
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : "Connection rejected.");
      }
    },
    [readInjected, allowDemo],
  );

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setBalance(null);
    setKind(null);
    setStatus("idle");
    try {
      localStorage.removeItem(STORE);
    } catch {}
  }, []);

  const switchChain = useCallback(async () => {
    if (kind === "demo") {
      setChainId(BRAND.chainId);
      return;
    }
    const eth = window.ethereum;
    if (!eth) return;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x" + BRAND.chainId.toString(16) }] });
      if (address) await readInjected(eth, address);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network switch rejected.");
    }
  }, [kind, address, readInjected]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasInjected(typeof window !== "undefined" && Boolean(window.ethereum));
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORE);
    } catch {}
    if (saved === "demo" && allowDemo) connect("demo");
    else if (saved === "demo") {
      try {
        localStorage.removeItem(STORE);
      } catch {}
    }
    else if (saved === "injected" && window.ethereum) {
      window.ethereum
        .request({ method: "eth_accounts" })
        .then((a) => {
          const list = a as string[];
          if (list?.[0]) connect("injected");
        })
        .catch(() => {});
    }
  }, [connect, allowDemo]);

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth?.on || kind !== "injected") return;
    const onAcct = (...a: unknown[]) => {
      const list = a[0] as string[];
      if (!list?.length) disconnect();
      else setAddress(list[0]);
    };
    const onChain = (...a: unknown[]) => setChainId(parseInt(String(a[0]), 16));
    eth.on("accountsChanged", onAcct);
    eth.on("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAcct);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [kind, disconnect]);

  const value = useMemo<WalletState>(
    () => ({
      address,
      chainId,
      balanceEth,
      kind,
      status,
      error,
      hasInjected,
      allowDemo,
      pickerOpen,
      openPicker: () => setPickerOpen(true),
      closePicker: () => setPickerOpen(false),
      connect,
      disconnect,
      switchChain,
    }),
    [address, chainId, balanceEth, kind, status, error, hasInjected, allowDemo, pickerOpen, connect, disconnect, switchChain],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}
