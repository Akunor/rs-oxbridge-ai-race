import Link from "next/link";

export default function Home() {
  return (
    <div className="home">
      <section className="hero home-hero">
        <span className="eyebrow">PayeeGuard · Confirmation of Payee for AI agents</span>
        <h1 className="display home-brand">PayeeGuard</h1>
        <p className="home-headline">
          AI agents can now send money. Nobody checks who they&apos;re paying.
        </p>
        <p className="lead home-stat">
          £450 million was lost in the UK last year to authorised push payment (APP) fraud, where people are
          tricked into paying a scammer&apos;s account.
        </p>
        <div className="hero-ctas">
          <Link className="btn btn--primary" href="/demo">
            See it stop a scam
          </Link>
          <Link className="btn btn--secondary" href="/developers">
            Add it to your agent
          </Link>
        </div>
        <p className="small muted home-source">
          Source:{" "}
          <a
            href="https://www.ukfinance.org.uk/policy-and-guidance/reports-and-publications/annual-fraud-report-2025"
            target="_blank"
            rel="noopener noreferrer"
          >
            UK Finance Annual Fraud Report 2025
          </a>
          , figures for 2024.
        </p>
      </section>

      <section className="home-section reveal">
        <h2 className="home-section-title">What we do</h2>
        <p className="home-section-body">
          PayeeGuard checks the payee before an AI agent pays. If the wallet isn&apos;t the one the business really
          uses, the payment is blocked.
        </p>
      </section>

      <section className="home-section reveal">
        <h2 className="home-section-title">Why it&apos;s different</h2>
        <ol className="home-reasons">
          <li>
            <h3>We protect the payer</h3>
            <p>
              Fraud tools usually protect merchants from scammers. APP fraud is the reverse: the payer is tricked into
              paying the wrong person. Nobody protects agents that pay out.
            </p>
          </li>
          <li>
            <h3>Built for agents</h3>
            <p>
              Banks check the name on an account before you pay. AI agents get no such check, and scammers can hide
              instructions on a page telling them to pay someone else. A person might stop and call to check, but an
              agent won&apos;t.
            </p>
          </li>
          <li>
            <h3>Proof, not lists</h3>
            <p>
              Scam lists only catch addresses that are already reported. PayeeGuard checks whether a wallet belongs to
              the business, and the owner proves it with a wallet signature.
            </p>
          </li>
        </ol>
      </section>

      <section className="home-pitch reveal-late">
        <p>
          Push payment fraud is a £450 million a year problem that banks solved for people with Confirmation of Payee.
          AI agents now make payments with none of that protection. PayeeGuard is Confirmation of Payee for agents.
        </p>
        <div className="hero-ctas">
          <Link className="btn btn--primary" href="/demo">
            See it stop a scam
          </Link>
          <Link className="btn btn--secondary" href="/developers">
            Add it to your agent
          </Link>
        </div>
        <p className="small muted home-source">
          Sources:{" "}
          <a
            href="https://www.ukfinance.org.uk/policy-and-guidance/reports-and-publications/annual-fraud-report-2025"
            target="_blank"
            rel="noopener noreferrer"
          >
            UK Finance Annual Fraud Report 2025
          </a>
          {" · "}
          <a
            href="https://www.tlt.com/insights-and-events/insight/uk-finance-annual-fraud-report-2025"
            target="_blank"
            rel="noopener noreferrer"
          >
            TLT summary (APP fraud losses just over £450m in 2024)
          </a>
        </p>
      </section>
    </div>
  );
}
