import Link from "next/link";
import { Module } from "@/components/ui";

export default function Home() {
  return (
    <>
      <section className="hero">
        <span className="eyebrow">Confirmation of payee · for AI agents</span>
        <h1 className="display">PayeeGuard</h1>
        <p className="lead">
          Verify the payee before an agent can send money. Stops lookalike wallets, “we changed our details” swaps, and
          instructions planted for AI.
        </p>
        <div className="hero-ctas">
          <Link className="btn btn--primary" href="/shop">
            Try the coffee shop
          </Link>
          <Link className="btn btn--secondary" href="/invoice">
            Try a B2B invoice
          </Link>
        </div>
      </section>

      <div className="demo-grid reveal">
        <Link href="/shop" className="demo-card">
          <span className="demo-kicker">Demo · consumer</span>
          <b>Coffee shop</b>
          <p>
            A verified storefront, a copycat with a poisoned address, hidden agent instructions, and a new merchant that
            must prove wallet ownership.
          </p>
          <span className="go">Open storefront →</span>
        </Link>
        <Link href="/invoice" className="demo-card">
          <span className="demo-kicker">Demo · accounts payable</span>
          <b>Incoming invoices</b>
          <p>
            An agent pays a vendor invoice. Compare a genuine remittance with a changed-details scam that tries to reroute
            funds.
          </p>
          <span className="go">Open AP inbox →</span>
        </Link>
      </div>

      <Module label="How it works" className="reveal-late">
        <div className="flow">
          <div>
            <b>1 · Request</b>
            An invoice, checkout page, or message asks an agent to pay.
          </div>
          <div>
            <b>2 · Risk check</b>
            Rules plus AI: lookalike address, name mismatch, new wallet, unusual amount, hidden instructions.
          </div>
          <div>
            <b>3 · Confirm</b>
            Unknown payees prove ownership by signing a one-time code with their wallet.
          </div>
          <div>
            <b>4 · Verdict</b>
            PAY, HOLD, or BLOCK — with reasons and a tamper-evident receipt.
          </div>
        </div>
      </Module>
    </>
  );
}
