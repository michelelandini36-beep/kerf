export const BRAND = {
  name: "Kerf",
  token: "KERF",
  tagline: "Measure the gap. Cut it clean.",
  xHandle: process.env.NEXT_PUBLIC_X_HANDLE || "Kerfworld",
  explorer: process.env.NEXT_PUBLIC_EXPLORER_URL || "https://robinhoodchain.blockscout.com",
  chainName: "Robinhood Chain",
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 4663),
};

export const xUrl = () => `https://x.com/${BRAND.xHandle}`;
export const explorerAddress = (a: string) => `${BRAND.explorer}/address/${a}`;
export const explorerTx = (h: string) => `${BRAND.explorer}/tx/${h}`;
export const explorerBlock = (b: number) => `${BRAND.explorer}/block/${b}`;
