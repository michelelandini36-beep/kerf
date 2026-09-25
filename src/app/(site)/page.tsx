import Link from "next/link";
import { CapabilityGrid, ExecutorLine, IntegrationsTable, LivePreview, ProductCards, TokenCard } from "@/components/home/Live";
import { BRAND } from "@/lib/brand";
import pools from "@/config/pools.json";
import tokens from "@/config/tokens.json";

const STEPS = [
  {
    id: "measure",
    n: "01",
    name: "Measure",
    title: "Read every verified pool at a single block.",
    body: "Kerf asks the canonical Uniswap V2 and V3 factories for each pool holding an issuer-verified stock token, pulls all of their state in one multicall pinned to one block, and sends every pool a real test quote before it may carry a route.",
    points: [
      "An asset is its contract address. A ticker alone proves nothing.",
      "A pool that cannot fill the test quote is dropped — and listed with the reason.",
      "Uniswap v4 pools are shown as unsupported instead of priced with the wrong maths.",
    ],
    explain: [
      ["Factories asked", "V2 + V3"],
      ["Fee tiers", "0.01 · 0.05 · 0.30 · 1 %"],
      ["Reads per scan", "1 multicall, 1 block"],
      ["Depth probe", "≤ 1,000 USDG, ≤ 3 % impact"],
    ],
  },
  {
    id: "rehearse",
    n: "02",
    name: "Rehearse",
    title: "Quote the loop, then dry-run the exact call.",
    body: "A candidate starts and ends in the same settlement asset. Each hop is priced by the on-chain quoter at a size scaled to the shallowest pool, every cost gets its own line, and the executor call you would sign is replayed in an eth_call from your own address.",
    points: [
      "Pool fees already live inside the quote; they are never taken off twice.",
      "Gas is converted only with a credible same-block rate — otherwise the net is flagged incomplete.",
      "Touch the route, size, minimum, deadline or wallet and the rehearsal is void.",
    ],
    explain: [
      ["Candidates quoted", "top 48 by spot edge"],
      ["Size ladder", "5 · 15 · 40 · 100 · 250 %"],
      ["Quote lifetime", "20 s"],
      ["Simulation lifetime", "30 s"],
    ],
  },
  {
    id: "cut",
    n: "03",
    name: "Cut",
    title: "Borrow, swap, repay — one transaction or nothing.",
    body: "The executor flash-swaps from the first pool, runs the remaining hops, repays that pool and enforces your minimum profit, all inside one transaction. If any piece fails, none of it happened.",
    points: [
      "Callbacks are accepted only from the one pool expected next.",
      "Your profit is the contract’s measured balance increase, paid to whoever signed.",
      "A clean rehearsal is not a promise; a reverted transaction still burns gas.",
    ],
    explain: [
      ["Hops", "2 – 4"],
      ["Your capital", "none — flash-funded"],
      ["Allowances", "none"],
      ["Fee cap", "10 %, immutable"],
    ],
    live: true,
  },
  {
    id: "check",
    n: "04",
    name: "Check",
    title: "Read the outcome from the receipt, not from hope.",
    body: "History is built from the executor’s CycleExecuted events and their receipts: what was actually paid out, the protocol fee, the gas you really spent, and whether the block is only on L2 or already final on Ethereum.",
    points: [
      "Only a receipt with status success counts. A revert emits no event and shows as a failed transaction.",
      "Finality comes from the node’s safe and finalized tags — never assumed.",
      "Net after gas appears only when proceeds and gas are in the same asset.",
    ],
    explain: [
      ["Source", "CycleExecuted + receipt"],
      ["Reorg re-scan", "last 256 blocks"],
      ["States", "L2 · safe · finalized"],
      ["Export", "CSV, exact units"],
    ],
  },
];

const d = (s: number) => ({ "--d": `${s}s` }) as React.CSSProperties;
const POOL_COUNT = pools.pools.length;
const STOCK_COUNT = tokens.filter((t) => t.kind === "stock").length;

function Sparkle() {
  return (
    <svg className="badge-star" width="18" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
      <path d="M12 2.6C12.55 2.6 12.88 3.15 13.08 4.7c.62 4.7 1.52 5.6 6.22 6.22 1.55.2 2.1.53 2.1 1.08s-.55.88-2.1 1.08c-4.7.62-5.6 1.52-6.22 6.22-.2 1.55-.53 2.1-1.08 2.1s-.88-.55-1.08-2.1c-.62-4.7-1.52-5.6-6.22-6.22C3.15 12.88 2.6 12.55 2.6 12s.55-.88 2.1-1.08c4.7-.62 5.6-1.52 6.22-6.22C11.12 3.15 11.45 2.6 12 2.6Z" />
    </svg>
  );
}

function PoolsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="pi-a" x1="3" y1="2" x2="14" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity="0.38" />
          <stop offset="1" stopColor="#3a3a3a" stopOpacity="0.62" />
        </linearGradient>
        <linearGradient id="pi-b" x1="13" y1="2" x2="24" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3a3a3a" stopOpacity="0.38" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.62" />
        </linearGradient>
      </defs>
      <rect x="3.4" y="2.6" width="7.2" height="18.8" rx="3.6" fill="url(#pi-a)" />
      <rect x="13.4" y="2.6" width="7.2" height="18.8" rx="3.6" fill="url(#pi-b)" />
      <rect x="9.2" y="10.9" width="5.6" height="2.2" rx="1.1" fill="#4a4a4a" />
    </svg>
  );
}

function TileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.4" y="2.4" width="19.2" height="19.2" rx="6.2" fill="#fff" />
      <path d="M7.5 15.5l3-3 2 2 4-5" fill="none" stroke="#111" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FlashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.6" fill="#2b2b2b" />
      <path d="M13.2 4.8L7.6 13.1h3.9l-.8 6.1 5.7-8.4h-4z" fill="#f4f4f4" />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <section className="vhero" aria-labelledby="hero-title">
        <div className="hero-photo" aria-hidden="true">
          <video autoPlay muted loop playsInline preload="auto" poster="/media/hero-poster.jpg">
            <source src="/media/hero-mobile.mp4" type="video/mp4" media="(max-width: 900px)" />
            <source src="/media/hero.mp4" type="video/mp4" />
          </video>
        </div>
        <div className="vhero-main" id="top">
          <div className="hero-copy">
            <span className="badge appear appear--pop" style={d(0.22)}>
              <Sparkle />
              Tokenized-equity arbitrage · {BRAND.chainName}
            </span>
            <h1 id="hero-title">
              <span className="headline-line">
                <span className="appear appear--mask" style={d(0.42)}>
                  Measure the <em>gap</em>.
                </span>
              </span>
              <span className="headline-line">
                <span className="appear appear--mask" style={d(0.62)}>
                  Cut it clean.
                </span>
              </span>
            </h1>
            <p className="lede appear appear--soft" style={{ ...d(0.82), animationDuration: "1.25s" }}>
              Kerf reads every verified pool at one block, prices each loop with every cost on its own line, rehearses the exact call — and executes the ones
              that still pay, straight from your wallet.
            </p>
            <div className="hero-actions">
              <Link href="/app" className="btn btn-solid appear appear--btn" style={d(0.96)}>
                Open the bench
              </Link>
              <a href="#method" className="btn btn-ghost appear appear--side" style={d(1.1)}>
                See the method
              </a>
            </div>
          </div>
        </div>
        <footer className="stats" aria-label="Kerf in numbers">
          <span className="stat appear appear--stat" style={d(1.12)}>
            <PoolsIcon />
            <span>
              <b>{POOL_COUNT}</b> canonical Uniswap pools, read at one block
            </span>
          </span>
          <span className="stat appear appear--stat" style={d(1.28)}>
            <TileIcon />
            <span>
              <b>{STOCK_COUNT}</b> issuer-verified tokenized stocks
            </span>
          </span>
          <span className="stat appear appear--stat" style={d(1.44)}>
            <FlashIcon />
            <span>
              <b>0</b> capital needed — every loop is flash-funded
            </span>
          </span>
        </footer>
      </section>

      <section className="sec" id="method" aria-labelledby="method-title">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <span className="label">Method</span>
              <h2 id="method-title">Four moves. <em>Nothing</em> hidden between them.</h2>
            </div>
            <p className="intro">Each step hands the next one a number it can trace back to a chain read at a stated block.</p>
          </div>
          {STEPS.map((s) => (
            <article key={s.id} id={s.id} className="proc" aria-labelledby={`${s.id}-t`}>
              <div>
                <div className="idx">{s.n} · {s.name}</div>
                <div className="big" aria-hidden="true">{s.n}</div>
              </div>
              <div>
                <h3 id={`${s.id}-t`}>{s.title}</h3>
                <p>{s.body}</p>
                <ul>
                  {s.points.map((p) => <li key={p}>{p}</li>)}
                </ul>
                {s.live && <ExecutorLine />}
              </div>
              <aside className="explain">
                <span className="label">Spec sheet · reference values</span>
                <dl>
                  {s.explain.map(([k, v]) => (
                    <div key={k} style={{ display: "contents" }}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </aside>
            </article>
          ))}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
            <Link href="/app" className="btn btn-signal">Open the bench →</Link>
            <Link href="/app/history" className="btn">See past executions</Link>
          </div>
        </div>
      </section>

      <section className="sec" id="preview" aria-labelledby="preview-title">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <span className="label">Live preview</span>
              <h2 id="preview-title">The bench, reading the chain <em>as you scroll</em>.</h2>
            </div>
            <div className="intro" style={{ display: "grid", gap: 12 }}>
              <p style={{ margin: 0 }}>Every figure here comes from the same reads the bench makes. If a read fails, the panel says so and leaves the space empty.</p>
              <p style={{ margin: 0, fontSize: 15 }}>
                A <b>raw spread</b> is just the distance between two spot prices — a hint, not a trade. Price impact, fees and gas usually swallow it.
                Only a quoted cycle that stays positive after <i>all</i> of them is marked eligible.
              </p>
            </div>
          </div>
          <LivePreview />
          <p style={{ marginTop: 16 }}><Link href="/app" className="btn btn-sm">Open the full scanner →</Link></p>
        </div>
      </section>

      <section className="sec" id="product" aria-labelledby="product-title">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <span className="label">Product</span>
              <h2 id="product-title">Three instruments, each <em>honest</em> about what it knows.</h2>
            </div>
            <p className="intro">Browse, quote and rehearse with no wallet at all. Connect one only when a route is eligible and you choose to cut.</p>
          </div>
          <ProductCards />
        </div>
      </section>

      <section className="sec" id="transparency" aria-labelledby="tr-title">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <span className="label">Transparency</span>
              <h2 id="tr-title">What is wired up, and what is <em>not</em>.</h2>
            </div>
            <p className="intro">Every state below is read live or taken from the verified registry, with its source. Nothing is called available because it is on a roadmap.</p>
          </div>
          <CapabilityGrid />
          <div style={{ height: 18 }} />
          <IntegrationsTable />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
            <Link href="/app/status" className="btn btn-sm">Live status and freshness →</Link>
            <Link href="/docs#integrations" className="btn btn-sm btn-quiet">Integration notes and sources →</Link>
          </div>
        </div>
      </section>

      <section className="sec" id="token" aria-labelledby="token-title">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <span className="label">Token</span>
              <h2 id="token-title">${BRAND.token}: an address, published when it exists.</h2>
            </div>
            <p className="intro">
              Kerf runs without it. Scanning, quoting, rehearsing and executing never touch ${BRAND.token}, and no fee, discount or reward depends on holding it.
            </p>
          </div>
          <TokenCard />
          <p className="muted" style={{ fontSize: 14, maxWidth: "48em", marginTop: 18 }}>
            What ${BRAND.token} does not do: unlock features, cut fees, pay rewards or dividends, fund a treasury or buybacks, or carry governance. Nothing in Kerf
            reads a ${BRAND.token} balance. The only facts published here are the ones read from the chain, at the block shown. None of it is a promise of value.
          </p>
        </div>
      </section>

      <section className="sec" aria-labelledby="cta-title" style={{ borderBottom: 0 }}>
        <div className="wrap" style={{ display: "grid", gap: 20 }}>
          <div className="ruler" />
          <h2 id="cta-title">Measure the <em>gap</em>. Cut it clean.</h2>
          <p className="intro">Open the bench to scan verified pools and rehearse routes. You will not need a wallet until you execute.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/app" className="btn btn-signal">Open the bench →</Link>
            <Link href="/docs" className="btn">Read the docs</Link>
          </div>
        </div>
      </section>
    </>
  );
}
