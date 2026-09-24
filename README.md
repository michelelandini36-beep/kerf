# Kerf

Spread tooling for tokenized stocks: find price gaps between Uniswap pools, itemise every cost, rehearse the exact executor call, execute eligible loops atomically.

Next.js 16 (App Router, Turbopack), no UI framework, two Google fonts (Bricolage Grotesque, JetBrains Mono).

## Run

```bash
npm install
cp .env.example .env.local   # optional — defaults to demo data
npm run dev                  # http://localhost:3000
npm run build && npm start
```

## Deploy on Vercel

Import the repository (root directory = repo root). Add the variables from `.env.example` in Project → Settings → Environment Variables. No other configuration is needed.

## Where things live

| Path | What |
| --- | --- |
| `src/app/(site)` | Home and docs (marketing header/footer) |
| `src/app/app` | The bench: scanner, pools, history, status (terminal header, wallet) |
| `src/app/api/*` | The public developer API; each handler calls `provider` |
| `src/lib/data/types.ts` | Data contracts shared by UI and backend |
| `src/lib/data/index.ts` | **The switch**: `KERF_DATA_SOURCE=chain` (default, reads Robinhood Chain), `mock` or `http` |
| `src/lib/data/chain/` | Live provider: pool state in one multicall per block, QuoterV2 per hop, exact-call simulation on the executor, CycleExecuted history |
| `src/config/pools.json` | Canonical pool snapshot — refresh with `npm run snapshot:pools` |
| `src/lib/data/mock.ts` | Deterministic demo chain (prices drift every 15 s, one dislocation some minutes) |
| `src/lib/data/http.ts` | Live adapter: forwards to `KERF_API_BASE_URL`, adds `KERF_API_KEY` |
| `src/lib/wallet.tsx` | Wallet state: real EIP-1193 browser wallet or demo wallet |
| `src/lib/execution.ts` | Transaction lifecycle: real `eth_sendTransaction` with a browser wallet, timers with the demo wallet |
| `src/config/registry.ts` | Public chain addresses (Uniswap, USDG, WETH, Chainlink…) |
| `CHECKLIST.md` | Feature checklist derived from the reference site |
| `contracts/` | `KerfExecutor` (Foundry): source, fork tests, deploy script — see `contracts/README.md` |

## Connecting a real backend

1. Serve the endpoints listed in `/docs#developers` in the shapes of `src/lib/data/types.ts` (human units; convert base units in `http.ts` if needed).
2. Set `KERF_DATA_SOURCE=http`, `KERF_API_BASE_URL`, optionally `KERF_API_KEY`.
3. Deploy the executor (`contracts/README.md`), set `NEXT_PUBLIC_EXECUTOR_ADDRESS`, and implement `submitCycle` in `src/lib/execution.ts` with `eth_sendTransaction` + receipt polling.

The yellow "Demo data" bar in the bench disappears automatically when the source is `http`.
