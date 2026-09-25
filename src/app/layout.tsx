import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import { Motion } from "@/components/Motion";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--f-inter", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: "italic", variable: "--f-serif", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--f-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: `${BRAND.name} — spreads in tokenized stocks, measured and executed`, template: `%s · ${BRAND.name}` },
  description:
    "Kerf finds price gaps between tokenized-stock pools, itemises every cost, simulates the exact call and executes eligible cycles atomically from your wallet.",
  openGraph: { title: BRAND.name, description: BRAND.tagline, type: "website" },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} ${mono.variable}`}>
      <body style={{ background: "#000", color: "#fff" }}>
        <div className="grain" aria-hidden="true" />
        <a href="#main" className="skip">
          Skip to content
        </a>
        {children}
        <Motion />
      </body>
    </html>
  );
}
