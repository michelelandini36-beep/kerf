import "server-only";
import { chainProvider } from "./chain";
import { httpProvider } from "./http";
import { mockProvider } from "./mock";
import type { DataProvider } from "./types";

// The single switch between live chain reads, an external backend and demo data.
//   chain (default) — read Robinhood Chain directly (KERF_RPC_URL or the public RPC)
//   http            — forward to KERF_API_BASE_URL
//   mock            — deterministic demo data, no network
const src = process.env.KERF_DATA_SOURCE;
export const dataSource: "chain" | "http" | "mock" = src === "mock" ? "mock" : src === "http" ? "http" : "chain";

export const provider: DataProvider = dataSource === "mock" ? mockProvider : dataSource === "http" ? httpProvider : chainProvider;
