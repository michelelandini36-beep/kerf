import type { Metadata } from "next";
import { BRAND, explorerAddress } from "@/lib/brand";
import { REGISTRY as R } from "@/config/registry";

export const metadata: Metadata = { title: "Docs" };

const TOC = [
  ["overview", "Overview"],
  ["network", "Network"],
  ["pools", "Assets and pools"],
  ["pricing", "Prices and quotes"],
  ["costs", "Cost accounting"],
  ["simulation", "Simulation"],
  ["executor", "Executor"],
  ["transactions", "Transactions and history"],
  ["integrations", "Integrations"],
  ["token", "Token"],
  ["limits", "Limitations"],
  ["developers", "Developer interface"],
];

const A = ({ a }: { a: string }) => (
  <a href={explorerAddress(a)} target="_blank" rel="noreferrer">
    <code>{a}</code>
  </a>
);

function Sec({ id, n, title, children }: { id: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>
        <span className="n">{String(n).padStart(2, "0")}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function Docs() {
  return (
    <div className="wrap docs">
      <nav className="toc" aria-label="Documentation">
        <span className="label" style={{ padding: "6px 10px 6px 0" }}>Docs</span>
        {TOC.map(([id, l]) => (
          <a key={id} href={`#${id}`}>{l}</a>
        ))}
      </nav>
      <article className="prose">
        <span className="label">Documentation</span>
        <h1>How {BRAND.name} works</h1>
        <p>Short, and precise about what is live, what is a preview and what is not connected. Every number the product shows traces back to a chain read at a stated block.</p>

        <Sec id="overview" n={1} title="Overview">
          <p>
            {BRAND.name} looks for price differences in the <strong>same verified stock token</strong> across Uniswap pools on {BRAND.chainName}. It assembles
            closed loops that begin and end in one settlement asset (USDG or WETH), prices them with the on-chain quoter, lists every cost on its own line, and
            replays the exact executor call from your address. When a verified executor is deployed you can run an eligible loop atomically from your own wallet.
          </p>
          <p>
            There is a token, <strong>${BRAND.token}</strong>, whose address is published on this site once it exists — and the app does not use it for anything.
            Most of the time no loop is eligible. An efficiently arbitraged market is the normal state, and the scanner tells you so.
          </p>
        </Sec>

        <Sec id="network" n={2} title="Network">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Fact</th><th>Value</th><th>Where it comes from</th></tr></thead>
              <tbody>
                <tr><td>Chain</td><td>{BRAND.chainName} · {R.chainId}</td><td>Operator docs + live <code>eth_chainId</code></td></tr>
                <tr><td>Type</td><td>Arbitrum Orbit L2, Ethereum blobs for data</td><td>Operator docs</td></tr>
                <tr><td>Gas token</td><td>ETH</td><td>Operator docs</td></tr>
                <tr><td>Explorer</td><td><a href={R.explorer}>{R.explorer.replace("https://", "")}</a></td><td>Operator docs</td></tr>
                <tr><td>Public RPC</td><td><code>{R.publicRpc}</code></td><td>Rate-limited, not for production — put a provider URL in <code>KERF_RPC_URL</code> (server-side)</td></tr>
                <tr><td>Testnet</td><td>46630 — unused</td><td>No Uniswap deployment is listed there, so nothing can be verified</td></tr>
              </tbody>
            </table>
          </div>
          <p>Blocks land roughly every 0.1 s. Cross-chain loops are out of scope: a cycle spread across two chains can never be atomic.</p>
        </Sec>

        <Sec id="pools" n={3} title="Assets and pools">
          <p>
            <strong>Assets.</strong> The asset list is the issuer’s stock-token registry (<code>{R.assetsApi}</code>). A ticker proves nothing — look-alike
            tokens exist — so each address must also be an ERC-1967 beacon proxy of the issuer beacon <A a={R.stockBeacon} /> with matching <code>symbol()</code>{" "}
            and <code>decimals()</code>. Settlement assets are USDG <A a={R.usdg} /> (6 decimals) and WETH <A a={R.weth} /> (18 decimals).
          </p>
          <p>
            <strong>Pools.</strong> For every stock token × {"{USDG, WETH}"} × fee tier (0.01, 0.05, 0.30, 1 %) we call <code>factory.getPool</code>, plus{" "}
            <code>factory.getPair</code> for V2 and the WETH/USDG connectors. Asking the canonical factory <em>is</em> the membership proof. Stock/stock pools come
            from a committed snapshot, each confirmed by the factory. Tokens and pools are re-read from the issuer registry and the factories every six
            hours, so new listings appear without a redeploy — and a new token must first prove it is a beacon proxy of the issuer beacon.
          </p>
          <p>
            <strong>Depth probes.</strong> A V3 position one tick wide can report huge liquidity and fill almost nothing. Every pool above the dust floor (25 USDG
            of +1 % depth) is sent a real quote of up to 1,000 USDG that must fill within 3 % impact beyond its fee. Pools that fail are marked <em>hollow</em> and
            excluded from spreads and routing.
          </p>
          <p>
            <strong>Uniswap v4.</strong> v4 pools between verified assets are listed from a PoolManager census as an <em>unsupported venue</em>. They are never
            priced or routed: hooks can change fees and pricing, and the executor cannot settle v4 swaps.
          </p>
        </Sec>

        <Sec id="pricing" n={4} title="Prices and quotes">
          <ul>
            <li>All pool state in one comparison is read in <strong>a single multicall pinned to one block</strong>; that block number travels with the data to the screen.</li>
            <li>Spot prices (V3 from <code>sqrtPriceX96</code>, V2 from reserves) are indicative: before impact, not an exchange price, not an oracle.</li>
            <li>The raw spread — dearest minus cheapest verified pool of an asset — is a signal and never a result.</li>
            <li>
              Candidate loops of 2–4 distinct pools are ranked by spot edge; the best 48 are quoted hop by hop with QuoterV2 (<A a={R.quoterV2} />), batched in
              gas-capped <code>eth_call</code>s, at 5, 15, 40, 100 and 250 % of the loop’s shallowest depth. V2 hops use constant-product maths on same-block reserves.
            </li>
            <li>Quotes expire after 20 s. The scanner may show a scan up to 90 s old while it refreshes — every row shows its age — and the route panel always re-quotes at the newest block.</li>
          </ul>
        </Sec>

        <Sec id="costs" n={5} title="Cost accounting">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Line</th><th>How it is obtained</th></tr></thead>
              <tbody>
                <tr><td>Raw price spread</td><td>Product of spot rates after pool fees, minus 1. Used only for ranking.</td></tr>
                <tr><td>Quoted route output</td><td>QuoterV2 or V2 formula, hop by hop. Pool fees and impact are already inside it.</td></tr>
                <tr><td>Trading fees</td><td>Inside the quote; never subtracted a second time.</td></tr>
                <tr><td>Flash-liquidity fee</td><td>None on top: the flash swap repays the first pool in the settlement asset, and that pool’s swap fee is the whole borrowing cost.</td></tr>
                <tr><td>Protocol fee</td><td>0 % by default, and only of a positive result. Fixed per deployment, capped at 10 %; the live value is read from the contract.</td></tr>
                <tr><td>Gas</td><td><code>eth_estimateGas</code> of the real call when you simulate (a per-hop model from fork measurements in the scan), times the current gas price.</td></tr>
                <tr><td>Gas in the settlement asset</td><td>Only via a credible same-block rate: the deepest depth-verified WETH/USDG pool (≥ 10,000 USDG deep), vetoed if Chainlink ETH/USD ÷ USDG/USD disagrees by more than 2 %. Otherwise gas stays in ETH and the net is flagged incomplete.</td></tr>
                <tr><td>Estimated result after costs</td><td>Quoted result − protocol fee − gas, when gas could be converted.</td></tr>
                <tr><td>Required minimum result</td><td><code>max(floor, estimate × accepted share)</code>, enforced on-chain after the protocol fee. The floor defaults to the estimated gas.</td></tr>
              </tbody>
            </table>
          </div>
          <p>On the backend every amount is an integer in base units with the token’s own decimals. Amounts you receive round down; costs round up.</p>
        </Sec>

        <Sec id="simulation" n={6} title="Simulation">
          <p>
            “Simulate exact call” runs <code>execute(hops, amountIn, minProfit, deadline)</code> in an <code>eth_call</code> at the latest block, from your address
            (a placeholder before you connect), and estimates its gas. The response echoes the exact calldata. A simulation is bound to the route, amount,
            minimum rule, deadline, wallet, chain and contract: change any of them, let it age past 30 s, or get within 20 s of its deadline, and it no longer counts.
            Deadlines (30–600 s) are measured in chain time.
          </p>
          <p>
            While no executor is deployed, the same compiled bytecode is injected at a scratch address through an <code>eth_call</code> state override and run
            against live state — labelled <em>preview</em>. It shows what the contract would do; there is nothing to sign.
          </p>
          <p>A passing simulation is not a guarantee. State changes about ten times a second, other traders watch the same pools, and a reverted transaction still costs gas.</p>
        </Sec>

        <Sec id="executor" n={7} title="Executor">
          <p>
            <strong>Mechanics.</strong> The executor calls <code>swap</code> on the first pool; Uniswap sends the output first and then calls back
            (<code>uniswapV3SwapCallback</code> / <code>uniswapV2Call</code>). Inside the callback the other hops run exact-input on the amounts actually received,
            the first pool is repaid, and profit is the rise in the contract’s settlement balance over the whole call. Your minimum is checked after the protocol
            fee and the rest is sent to you — in one transaction or not at all. You supply no tokens and grant no allowance.
          </p>
          <ul>
            <li>Every hop must be the pool the immutable V2/V3 factory returns for its tokens and fee: no arbitrary call targets, no caller-supplied calldata.</li>
            <li>Callbacks are accepted only during an execution, only from the single pool expected next, and only once; the flash payload is hash-pinned.</li>
            <li>Balances already sitting in the contract can neither subsidise a loop nor leak: payout is the measured increase, and no increase means revert.</li>
            <li>Received amounts must equal what the pool reported (rejecting fee-on-transfer and rebasing tokens); partial fills revert; tokens are allow-listed; 2–4 hops; deadline; immutable fee cap.</li>
          </ul>
          <p>
            <strong>The owner can</strong> allow or block tokens, change the fee recipient, pause new executions and sweep non-fee balances. <strong>The owner cannot</strong>{" "}
            change the fee or the factories, redirect a caller’s profit, take user tokens, or upgrade the contract (it is not a proxy).
          </p>
          <p>Covered by unit tests on real Uniswap V2/V3 bytecode and mainnet-fork tests on real stock-token pools. <strong>Not independently audited.</strong></p>
        </Sec>

        <Sec id="transactions" n={8} title="Transactions and history">
          <p>
            Before your wallet opens, the call is re-quoted and simulated again, on the server and in your browser; the wallet receives exactly those bytes. States
            move only on real events: <em>re-simulated → awaiting wallet → submitted → pending → confirmed</em> or <em>reverted</em> (plus rejected, replaced and
            cancelled). Success exists only after a receipt with status success; proceeds are decoded from its <code>CycleExecuted</code> event.
          </p>
          <p>
            History rows come from <code>CycleExecuted</code> events and receipts. Each carries a confirmation state from the node’s block tags — on L2, batch posted to
            L1 (<code>safe</code>), or finalized on L1 — and the last 256 blocks are re-scanned on every pass so a reorganised execution disappears. Proceeds and gas
            are shown apart unless both are in ETH. Transactions this browser submitted are tracked by receipt. CSV export writes exact units.
          </p>
        </Sec>

        <Sec id="integrations" n={9} title="Integrations">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Integration</th><th>Status</th><th>Source / reason</th></tr></thead>
              <tbody>
                <tr><td>Uniswap V2 factory</td><td><span className="tag ok">supported</span></td><td><A a={R.uniswapV2Factory} /> · Uniswap deployments registry</td></tr>
                <tr><td>Uniswap V3 factory · QuoterV2</td><td><span className="tag ok">supported</span></td><td><A a={R.uniswapV3Factory} /> · <A a={R.quoterV2} /> · <code>factory()</code> and <code>WETH9()</code> cross-checked</td></tr>
                <tr><td>Multicall3</td><td><span className="tag ok">used for reads</span></td><td><A a={R.multicall3} /></td></tr>
                <tr><td>Stock token registry + beacon</td><td><span className="tag ok">supported</span></td><td><code>{R.assetsApi}</code> · <A a={R.stockBeacon} /></td></tr>
                <tr><td>Chainlink ETH/USD, USDG/USD</td><td><span className="tag off">cross-check only</span></td><td><A a={R.chainlinkEthUsd} /> · <A a={R.chainlinkUsdgUsd} /></td></tr>
                <tr><td>Chainlink sequencer-uptime feed</td><td><span className="tag bad">not available</span></td><td>Recommended by the chain docs; none is listed for chain 4663.</td></tr>
                <tr><td>Uniswap v4 PoolManager</td><td><span className="tag warn">listed, not routed</span></td><td><A a={R.v4PoolManager} /> · hooks can change pricing; no v4 settlement adapter</td></tr>
                <tr><td>Morpho Blue flash loans</td><td><span className="tag off">available, unused</span></td><td>Uniswap flash swaps already fund every supported loop at no extra fee; a second funding path would add attack surface and change nothing.</td></tr>
                <tr><td>Order-book / perps venues, aggregators</td><td><span className="tag off">not integrated</span></td><td>No verified on-chain quote interface for spot loops; nothing is inferred from them.</td></tr>
              </tbody>
            </table>
          </div>
          <p>The typed registry lives in <code>src/config/registry.ts</code>; the backend should re-check it against its sources and the live chain on start-up.</p>
        </Sec>

        <Sec id="token" n={10} title="Token">
          <p>
            ${BRAND.token} is the {BRAND.name} token. Its contract address is published in exactly two places: the token section of the home page and the pill in
            the header. Anything else claiming to be ${BRAND.token} is not.
          </p>
          <p>
            The app does not use the token. Scanning, quoting, simulation and execution never read a ${BRAND.token} balance: no staking, no treasury, no yield, no fee
            discount, no reward, no governance, no promised value. Once live, the site shows only what the chain reports at a stated block — the contract facts
            and, if a canonical V2/V3 pool against USDG or WETH holds liquidity in range, its spot price and +1 % depth. If there is no such pool, it says so.
          </p>
        </Sec>

        <Sec id="limits" n={11} title="Limitations">
          <ul>
            <li>A web interface is slow next to a co-located bot. Expect gaps to close before inclusion; reverts cost gas.</li>
            <li>The +1 % depth figure is an indicator; probes only verify up to 1,000 USDG.</li>
            <li>Sizes come from a five-step ladder, not a continuous optimiser.</li>
            <li>The public RPC throttles and is not archival; the last good read stays on screen, marked stale, next to the real error.</li>
            <li>Stock tokens can be paused, block-listed or upgraded by their issuer; a loop touching one then reverts.</li>
          </ul>
        </Sec>

        <Sec id="developers" n={12} title="Developer interface">
          <pre>{`struct Hop { address pool; address tokenIn; address tokenOut; uint24 fee; uint8 kind; } // kind 0 = V2, 1 = V3

function execute(Hop[] calldata hops, uint256 amountIn, uint256 minProfit, uint256 deadline)
  external returns (uint256 userProfit, uint256 protocolFee);

event CycleExecuted(address indexed caller, address indexed settlementToken, uint256 amountIn,
  uint256 grossProfit, uint256 userProfit, uint256 protocolFee, address[] pools);`}</pre>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Endpoint</th><th>Returns</th></tr></thead>
              <tbody>
                <tr><td><code>GET /api/markets</code></td><td>Pools, prices, depth, probes and gas reference at one block.</td></tr>
                <tr><td><code>GET /api/pools/v4?page=&amp;includeExtreme=</code></td><td>Uniswap v4 pools between verified assets (listed, unsupported), paginated.</td></tr>
                <tr><td><code>GET /api/routes?settlement=USDG|WETH&amp;maxHops=2..4&amp;token=0x…</code></td><td>Quoted loops with accounting, rejection reasons and excluded pools.</td></tr>
                <tr><td><code>POST /api/quote</code></td><td>Fresh quote for one route; with <code>simulate: true</code>, the exact-call simulation and its calldata.</td></tr>
                <tr><td><code>GET /api/activity?caller=0x…&amp;page=1&amp;limit=25</code></td><td>Receipt-derived history with confirmation state.</td></tr>
                <tr><td><code>GET /api/status</code></td><td>Network, finality tags, adapters, freshness, registry provenance, executor checks.</td></tr>
                <tr><td><code>GET /api/token</code></td><td>${BRAND.token}: “soon”, or the address with name, symbol, decimals, supply and market at one block.</td></tr>
              </tbody>
            </table>
          </div>
        </Sec>
      </article>
    </div>
  );
}
