import Link from "next/link";
import { Module } from "@/components/ui";

export default function Home() {
  return (
    <>
      <section className="hero">
        <span className="eyebrow">Payment gate · for autonomous agents</span>
        <h1 className="display">PayeeGuard</h1>
        <p className="lead">
          A shopping or AP agent acting for a user or organisation must clear PayeeGuard before it can send money.
          Directory trust is out-of-band — a site badge cannot authorize a lookalike payee.
        </p>
        <div className="hero-ctas">
          <Link className="btn btn--primary" href="/demo">
            Open agent demo
          </Link>
          <Link className="btn btn--secondary" href="/developers">
            Agent API
          </Link>
        </div>
      </section>

      <Module label="What you are watching in the demo" className="reveal">
        <div className="flow">
          <div>
            <b>Left · agent journey</b>
            The agent moves through a coffee shop or invoice flow. Visualized as a website so humans can follow.
          </div>
          <div>
            <b>Right · payment gate</b>
            PayeeGuard consumes what the agent observed and scores lookalikes, name mismatches, and injection.
          </div>
          <div>
            <b>Outcome</b>
            The agent pays only on PAY. HOLD or BLOCK means no signature.
          </div>
          <div>
            <b>Not the product</b>
            Merchant self-verify on a page is not trust. Fraudulent sites can badge themselves.
          </div>
        </div>
      </Module>

      <div className="demo-grid reveal-late">
        <Link href="/demo" className="demo-card">
          <span className="demo-kicker">Primary</span>
          <b>Agent demo cockpit</b>
          <p>Side-by-side agent journey and live PayeeGuard evaluation across coffee and invoice attack scenarios.</p>
          <span className="go">Open demo →</span>
        </Link>
        <Link href="/shop" className="demo-card">
          <span className="demo-kicker">Standalone</span>
          <b>Coffee & invoices</b>
          <p>Full storefront and AP pages if you want to poke around outside the cockpit.</p>
          <span className="go">Browse sites →</span>
        </Link>
      </div>
    </>
  );
}
