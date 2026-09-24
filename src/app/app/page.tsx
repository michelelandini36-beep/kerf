import type { Metadata } from "next";
import { Suspense } from "react";
import { Scanner } from "@/components/scanner/Scanner";

export const metadata: Metadata = { title: "Scanner" };

export default function ScannerPage() {
  return (
    <Suspense fallback={<div className="wrap tpage"><p className="loading">Loading the scanner…</p></div>}>
      <Scanner />
    </Suspense>
  );
}
