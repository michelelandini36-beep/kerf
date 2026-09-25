import type { Metadata } from "next";
import Link from "next/link";
import { BRAND, xUrl } from "@/lib/brand";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <div className="wrap docs" style={{ gridTemplateColumns: "1fr" }}>
      <article className="prose">
        <span className="label">Legal · last updated 25 September 2026</span>
        <h1>
          <em>Privacy</em> notice
        </h1>
        <p>{BRAND.name} has no accounts, no sign-up and no marketing cookies. This page lists everything that is processed when you use kerf.world.</p>

        <section>
          <h2>What stays in your browser</h2>
          <ul>
            <li>Which wallet connector you used last, so it can reconnect.</li>
            <li>Transactions you sent from this browser, so History can show them before they are indexed.</li>
          </ul>
          <p>Both live in your browser’s local storage, never leave your device and can be cleared at any time from the browser settings.</p>
        </section>

        <section>
          <h2>What reaches our servers</h2>
          <ul>
            <li>
              When you simulate a route, your <strong>public wallet address</strong> (if connected) is sent with the request so the call can be simulated from
              it. It is not stored.
            </li>
            <li>
              Our hosting provider, Vercel, keeps standard technical logs (IP address, time, requested page) for security and operations, and provides
              privacy-friendly, cookieless page analytics in aggregate.
            </li>
            <li>Blockchain reads are made from our servers to an RPC node provider; they contain no personal data beyond public on-chain addresses.</li>
          </ul>
        </section>

        <section>
          <h2>What is public by nature</h2>
          <p>
            Transactions you sign are recorded permanently on {BRAND.chainName} and visible to anyone, including on the History page. This is how public
            blockchains work and cannot be undone.
          </p>
        </section>

        <section>
          <h2>Your rights and contact</h2>
          <p>
            You can ask what we hold about you or request deletion of anything that is not on-chain by writing to <a href={xUrl()}>@{BRAND.xHandle}</a> on X.
            See also the <Link href="/terms">terms of use</Link>.
          </p>
        </section>
      </article>
    </div>
  );
}
