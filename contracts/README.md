# KerfExecutor

Atomic 2–4 hop Uniswap V2/V3 loops on Robinhood Chain (4663), funded by a flash swap on the first pool. The caller supplies no tokens and grants no allowance; profit is the measured increase of the contract's settlement balance, paid to the caller in the same transaction.

**Not independently audited.**

## Guarantees enforced on-chain

- Every hop must be the pool the immutable V2/V3 factory returns for its tokens (and fee tier) — no arbitrary targets or calldata.
- Path is a closed loop (`hops[0].tokenIn == hops[n-1].tokenOut`), 2–4 distinct pools, allow-listed tokens only.
- Callbacks accepted only during an execution, only from the one pool expected next, once; the flash payload is hash-pinned.
- Exact-input fills only (partial fills revert); received amounts must equal what the pool reported (rejects fee-on-transfer / rebasing tokens).
- The loop's own output must exceed the flash debt — balances already in the contract can never subsidise it.
- `minProfit` checked after the protocol fee; `deadline` in chain time.
- Protocol fee is immutable, capped at 10 % (`MAX_FEE_BPS = 1000`).
- Owner can: allow/disallow tokens, change the fee recipient, pause, sweep stray balances, transfer ownership. Owner cannot: change the fee or factories, redirect a caller's profit, or upgrade (not a proxy).

## Develop

```bash
forge install foundry-rs/forge-std --no-git   # lib/ is not committed
forge test                                    # forks the public RPC; set KERF_RPC_URL for a provider
```

The suite runs against live pools on a fork: unprofitable loops revert with `CycleNotProfitable`, and profitable ones are created by moving a real pool first (V3→V3, V2 flash→V3, V3 flash→V2, a 3-hop loop through a real stock token), plus fee split, min-profit, subsidy and every guard.

## Deploy

```bash
cast wallet import kerf-deployer --interactive      # paste the deployer key into the local keystore once
export KERF_RPC_URL=https://...                     # provider RPC (public RPC also works)
export KERF_OWNER=0xYourOwnerAddress                # ideally a hardware wallet or multisig
# optional: KERF_FEE_RECIPIENT, KERF_FEE_BPS (default 0)
forge script script/Deploy.s.sol --rpc-url robinhood --account kerf-deployer --broadcast --verify
```

Simulated cost: ~6.7M gas ≈ 0.0006 ETH (deploy + allow-listing the 196 tokens in `tokens.json`). The deployer needs a little ETH on Robinhood Chain. Put the printed address in `NEXT_PUBLIC_EXECUTOR_ADDRESS`.
