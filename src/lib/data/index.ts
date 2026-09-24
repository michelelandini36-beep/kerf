import "server-only";
import { httpProvider } from "./http";
import { mockProvider } from "./mock";
import type { DataProvider } from "./types";

// The single switch between demo data and a real backend.
export const dataSource: "mock" | "http" = process.env.KERF_DATA_SOURCE === "http" ? "http" : "mock";

export const provider: DataProvider = dataSource === "http" ? httpProvider : mockProvider;
