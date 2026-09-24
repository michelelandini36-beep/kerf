import Link from "next/link";
import { CapabilityGrid, ExecutorLine, IntegrationsTable, LivePreview, ProductCards, TokenCard } from "@/components/home/Live";
import { BRAND } from "@/lib/brand";

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

function Caliper() {
  return (
    <figure className="caliper" aria-label="Illustration: the same stock priced in two pools, with the gap measured">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span className="label">Instrument · illustration</span>
        <span className="label">not live data</span>
      </div>
      <div className="bars">
        <div className="bar"><span>Pool A</span><span className="track"><span className="fill" style={{ width: "71%" }} /></span><span style={{ textAlign: "right" }}>231.18</span></div>
        <div className="gap">kerf 0.42 %</div>
        <div className="bar"><span>Pool B</span><span className="track"><span className="fill hi" style={{ width: "76%" }} /></span><span style={{ textAlign: "right" }}>232.15</span></div>
      </div>
      <div className="ruler" />
      <nav className="steps" aria-label="Method">
        {STEPS.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            {s.n}
            <b>{s.name}</b>
          </a>
        ))}
      </nav>
    </figure>
  );
}

export default function Home() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="wrap hero-grid">
          <div>
            <span className="label">Spread tooling for tokenized stocks · {BRAND.chainName}</span>
            <h1 id="hero-title">
              Measure the gap.
              <br />
              <em>Cut it clean.</em>
            </h1>
            <p className="lede">
              The same stock trades at slightly different prices in different pools. Kerf finds those gaps, shows you every cost that eats them,
              rehearses the exact call, and lets you execute the ones that still pay — straight from your wallet.
            </p>
            <div className="actions">
              <Link href="/app" className="btn btn-signal">Open the bench →</Link>
              <a href="#method" className="btn">See the method</a>
            </div>
            <p className="foot label">Chain {BRAND.chainId} · Uniswap V2 / V3 · browse without a wallet</p>
          </div>
          <Caliper />
        </div>
      </section>

      <section className="sec" id="method" aria-labelledby="method-title">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <span className="label">Method</span>
              <h2 id="method-title">Four moves. Nothing hidden between them.</h2>
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
              <h2 id="preview-title">The bench, reading the chain as you scroll.</h2>
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
              <h2 id="product-title">Three instruments, each honest about what it knows.</h2>
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
              <h2 id="tr-title">What is wired up, and what is not.</h2>
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
          <h2 id="cta-title">Measure the gap. Cut it clean.</h2>
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
