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

export interface DetectedWallet {
  id: string; // EIP-6963 rdns, or "injected" for the legacy window.ethereum
  name: string;
  icon: string | null;
  provider: Eip1193;
}

// The provider the user picked. execution.ts signs through the same one.
let activeProvider: Eip1193 | null = null;
export const getActiveProvider = () => activeProvider ?? (typeof window !== "undefined" ? (window.ethereum ?? null) : null);

function legacyName(eth: Eip1193 & Record<string, unknown>) {
  if (eth.isRabby) return "Rabby";
  if (eth.isCoinbaseWallet) return "Coinbase Wallet";
  if (eth.isPhantom) return "Phantom";
  if (eth.isBraveWallet) return "Brave Wallet";
  if (eth.isMetaMask) return "MetaMask";
  return "Browser wallet";
}

interface WalletState {
  address: string | null;
  chainId: number | null;
  balanceEth: number | null;
  kind: WalletKind | null;
  status: "idle" | "connecting" | "connected" | "error";
  error: string | null;
  hasInjected: boolean;
  wallets: DetectedWallet[];
  allowDemo: boolean;
  pickerOpen: boolean;
  openPicker(): void;
  closePicker(): void;
  connect(kind: WalletKind, walletId?: string): Promise<void>;
  walletName: string | null;
  disconnect(): void;
  switchChain(): Promise<void>;
}

const Ctx = createContext<WalletState | null>(null);
const walletsRef: { list: DetectedWallet[] } = { list: [] };
const findWallet = (id?: string) => (id ? walletsRef.list.find((w) => w.id === id) : undefined) ?? walletsRef.list[0];
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
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);
  const [walletName, setWalletName] = useState<string | null>(null);

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
    async (k: WalletKind, walletId?: string) => {
      setError(null);
      setStatus("connecting");
      try {
        if (k === "demo") {
          if (!allowDemo) throw new Error("The demo wallet is only available on demo data.");
          setAddress(DEMO_WALLET);
          setChainId(BRAND.chainId);
          setBalance(0.0184);
        } else {
          const pick = findWallet(walletId);
          const eth = pick?.provider ?? window.ethereum;
          if (!eth) throw new Error("No browser wallet detected.");
          activeProvider = eth;
          setWalletName(pick?.name ?? legacyName(eth as Eip1193 & Record<string, unknown>));
          const accts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
          if (!accts?.[0]) throw new Error("The wallet returned no account.");
          setAddress(accts[0]);
          await readInjected(eth, accts[0]);
        }
        setKind(k);
        setStatus("connected");
        setPickerOpen(false);
        try {
          localStorage.setItem(STORE, k === "demo" ? "demo" : `injected:${walletId ?? findWallet()?.id ?? "injected"}`);
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
    setWalletName(null);
    activeProvider = null;
    try {
      localStorage.removeItem(STORE);
    } catch {}
  }, []);

  const switchChain = useCallback(async () => {
    if (kind === "demo") {
      setChainId(BRAND.chainId);
      return;
    }
    const eth = getActiveProvider();
    if (!eth) return;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x" + BRAND.chainId.toString(16) }] });
      if (address) await readInjected(eth, address);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network switch rejected.");
    }
  }, [kind, address, readInjected]);

  // EIP-6963: every installed wallet announces itself with a name and icon.
  useEffect(() => {
    const found = new Map<string, DetectedWallet>();
    const publish = () => {
      const list = [...found.values()];
      if (!list.length && window.ethereum) list.push({ id: "injected", name: legacyName(window.ethereum as Eip1193 & Record<string, unknown>), icon: null, provider: window.ethereum });
      walletsRef.list = list;
      setWallets(list);
      setHasInjected(list.length > 0);
    };
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent<{ info: { uuid: string; name: string; icon: string; rdns: string }; provider: Eip1193 }>).detail;
      if (!d?.info || !d.provider) return;
      found.set(d.info.rdns || d.info.uuid, { id: d.info.rdns || d.info.uuid, name: d.info.name, icon: d.info.icon || null, provider: d.provider });
      publish();
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const t = setTimeout(publish, 300);
    return () => {
      clearTimeout(t);
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
    };
  }, []);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORE);
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "demo" && allowDemo) connect("demo");
    else if (saved === "demo") {
      try {
        localStorage.removeItem(STORE);
      } catch {}
    } else if (saved?.startsWith("injected")) {
      const id = saved.split(":")[1];
      const t = setTimeout(() => {
        const eth = findWallet(id)?.provider ?? window.ethereum;
        eth
          ?.request({ method: "eth_accounts" })
          .then((a) => {
            const list = a as string[];
            if (list?.[0]) connect("injected", id);
          })
          .catch(() => {});
      }, 400);
      return () => clearTimeout(t);
    }
  }, [connect, allowDemo]);

  useEffect(() => {
    const eth = getActiveProvider();
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
      wallets,
      walletName,
      allowDemo,
      pickerOpen,
      openPicker: () => setPickerOpen(true),
      closePicker: () => setPickerOpen(false),
      connect,
      disconnect,
      switchChain,
    }),
    [address, chainId, balanceEth, kind, status, error, hasInjected, wallets, walletName, allowDemo, pickerOpen, connect, disconnect, switchChain],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}
