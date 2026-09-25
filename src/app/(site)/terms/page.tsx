import type { Metadata } from "next";
import Link from "next/link";
import { BRAND, explorerAddress, xUrl } from "@/lib/brand";
import { REGISTRY } from "@/config/registry";

export const metadata: Metadata = { title: "Terms of use" };

export default function Terms() {
  return (
    <div className="wrap docs" style={{ gridTemplateColumns: "1fr" }}>
      <article className="prose">
        <span className="label">Legal · last updated 25 September 2026</span>
        <h1>
          Terms of <em>use</em>
        </h1>
        <p>
          These terms cover your use of the {BRAND.name} website and interface at kerf.world (the “Interface”). By using the Interface you accept them. If you
          do not, do not use it.
        </p>

        <section>
          <h2>What Kerf is</h2>
          <p>
            The Interface is software that reads public blockchain data from {BRAND.chainName}, estimates price differences between Uniswap pools, simulates a
            call to a public smart contract (the <strong>KerfExecutor</strong>, <a href={explorerAddress(REGISTRY.kerfExecutor)}>{REGISTRY.kerfExecutor}</a>), and — only
            if you choose to — prepares a transaction that <strong>your own wallet</strong> signs and sends.
          </p>
          <p>
            Kerf never holds your funds or keys, cannot move assets on your behalf, and has no account system. Every transaction is created, signed and
            broadcast by you.
          </p>
        </section>

        <section>
          <h2>No advice, no promise of profit</h2>
          <p>
            Nothing on the Interface is investment, financial, legal or tax advice, or an offer or solicitation to buy or sell any asset. Figures are estimates
            read at a stated block. Most of the time no route is profitable. A successful simulation is not a guarantee: prices move between simulation and
            inclusion, other traders compete for the same opportunity, and a transaction that reverts still costs gas.
          </p>
        </section>

        <section>
          <h2>Risks you accept</h2>
          <ul>
            <li>
              <strong>Smart-contract risk.</strong> The executor is tested but has <strong>not been independently audited</strong>. Bugs in it, in Uniswap
              contracts or in token contracts can cause losses.
            </li>
            <li>
              <strong>Market and execution risk.</strong> Loops can fail or lose money; you always pay the gas of the transactions you send.
            </li>
            <li>
              <strong>Third-party assets.</strong> Tokenized stocks are issued by a third party under its own terms. They may be restricted in some
              jurisdictions, paused, block-listed or changed by their issuer. The Interface does not make you eligible to hold or trade them.
            </li>
            <li>
              <strong>Infrastructure.</strong> Data comes from public RPC nodes and may be delayed, throttled or wrong. The Interface may be unavailable at any
              time.
            </li>
          </ul>
        </section>

        <section>
          <h2>Your responsibilities</h2>
          <p>
            You are responsible for complying with the laws that apply to you, including any restrictions on tokenized securities where you live, and for
            the security of your wallet. Do not use the Interface if doing so is unlawful for you.
          </p>
        </section>

        <section>
          <h2>The $KERF token</h2>
          <p>
            The Interface does not use ${BRAND.token} for anything. Holding it gives no right, feature, fee discount, share of revenue or governance. Its
            address is published only on this site.
          </p>
        </section>

        <section>
          <h2>Liability</h2>
          <p>
            The Interface and the executor are provided “as is”, without warranties of any kind. To the maximum extent permitted by law, the people behind
            {" "}{BRAND.name} are not liable for any loss arising from your use of the Interface, the executor or any transaction you send.
          </p>
        </section>

        <section>
          <h2>Changes and contact</h2>
          <p>
            These terms may change; the date at the top shows the latest version. Questions: <a href={xUrl()}>@{BRAND.xHandle}</a> on X. See also the{" "}
            <Link href="/privacy">privacy notice</Link>.
          </p>
        </section>
      </article>
    </div>
  );
}
