import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { TerminalHeader } from "@/components/TerminalHeader";
import { dataSource } from "@/lib/data";
import { WalletProvider } from "@/lib/wallet";

export const metadata: Metadata = { title: "Bench" };

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <TerminalHeader demo={dataSource === "mock"} />
      <main id="main">{children}</main>
      <Footer />
    </WalletProvider>
  );
}
