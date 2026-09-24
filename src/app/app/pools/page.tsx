import type { Metadata } from "next";
import { PoolsView } from "./PoolsView";

export const metadata: Metadata = { title: "Pools" };

export default function PoolsPage() {
  return <PoolsView />;
}
