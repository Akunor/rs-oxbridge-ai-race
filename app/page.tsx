import Link from "next/link";
import { Led, Module, PageHeader } from "@/components/ui";
import { modules } from "@/lib/modules";
import { SCENARIOS, type Scenario } from "@/lib/shop/scenarios";

const has = (id: string) => modules.some((m) => m.id === id);

const TAG = { PAY: "tag--ok", HOLD: "tag--warn", BLOCK: "tag--fault" } as const;

export default function Home() {
  return (
    <>
      <PageHeader eyebrow="Confirmation of Payee · for AI agents" title={<>Check the payee<br />before the agent pays.</>}>
        Banks check who you&apos;re paying before money moves. AI agents don&apos;t. PayeeGuard stops agents being tricked into paying scammers: lookalike
        addresses, &quot;we changed our wallet&quot; messages and hidden instructions planted for AI.
      </PageHeader>

      <Module label="Try it · four checkouts" right={<><Led tone="signal" /> live on Solana devnet</>}>
        <div className="scenario-grid">
          {(Object.keys(SCENARIOS) as Scenario[]).map((s, i) => (
            <Link key={s} href={`/checkout/${s}`} className="key">
              <Led tone={SCENARIOS[s].expect === "PAY" ? "ok" : SCENARIOS[s].expect === "BLOCK" ? "fault" : "signal"} />
              <span className="label">Scenario {i + 1}</span>
              <b>{SCENARIOS[s].title}</b>
              <p>{SCENARIOS[s].blurb}</p>
              <span className="row">
                <span className={`tag ${TAG[SCENARIOS[s].expect]}`}>Expect {SCENARIOS[s].expect}</span>
                <span className="go">Open checkout ▸</span>
              </span>
            </Link>
          ))}
        </div>
      </Module>

      <Module label="How it works">
        <div className="flow">
          <div><b>1 · Spot the scam</b>A payment request arrives: an invoice, a checkout page, a message. Scammers imitate the payee.</div>
          <div><b>2 · Risk check</b>Rules plus AI: lookalike address, payee mismatch, brand-new wallet, unusual amount, hidden instructions.</div>
          <div><b>3 · Confirmation of Payee</b>Unknown payee? They sign a one-time code with their wallet. Only the real owner can.</div>
          <div><b>4 · Verdict and receipt</b>PAY, HOLD or BLOCK, with reasons and a tamper-evident receipt.</div>
          <div><b>5 · Any agent</b>One API call before paying, like a card fraud check at checkout.</div>
        </div>
      </Module>

      <div className="cols">
        <Module label="Why now">
          <ul className="steps">
            <li><span>01</span><span>Push-payment fraud (APP fraud) tricks the payer into sending money themselves, so there&apos;s nothing to charge back.</span></li>
            <li><span>02</span><span>AI agents are starting to pay for things on their own. They read every page and email, including text written to manipulate them.</span></li>
            <li><span>03</span><span>Crypto addresses are unreadable. People and agents check the first and last few characters, and that is exactly what address poisoning fakes.</span></li>
          </ul>
        </Module>
        <Module label="Risk score" right="0–100">
          <table className="table">
            <thead><tr><th>Signal</th><th>Points</th></tr></thead>
            <tbody>
              <tr><td>Lookalike of a verified wallet</td><td>+60 · always block</td></tr>
              <tr><td>Name doesn&apos;t match the registered wallet</td><td>+50</td></tr>
              <tr><td>Hidden instructions aimed at the AI</td><td>+50</td></tr>
              <tr><td>Wallet ownership not proven</td><td>+30</td></tr>
              <tr><td>&quot;Our details changed&quot;, urgency, secrecy</td><td>+15 to +25</td></tr>
              <tr><td>Brand-new wallet · unusual amount</td><td>+20 each</td></tr>
            </tbody>
          </table>
          <span className="small muted">0–29 PAY · 30–59 HOLD · 60+ BLOCK</span>
        </Module>
      </div>
      <Module label="What's plugged in" right={<><Led tone="ok" /> {modules.length} {modules.length === 1 ? "module" : "modules"}</>}>
        {modules.length === 0 ? (
          <div className="empty">Nothing plugged in yet. This is a clean Next.js app: build anything.</div>
        ) : (
          <div className="keys">
            {modules.map((m) =>
              m.href ? (
                <Link key={m.id} href={m.href} className="key">
                  <Led tone="signal" />
                  <b>{m.name}</b>
                  <p>{m.summary}</p>
                  <span className="go">Open ▸</span>
                </Link>
              ) : (
                <div key={m.id} className="key">
                  <Led tone="ok" />
                  <b>{m.name}</b>
                  <p>{m.summary}</p>
                </div>
              ),
            )}
          </div>
        )}
      </Module>

      <Module label="Next steps">
        <ol className="steps">
          {nextSteps().map((step, i) => (
            <li key={i}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Module>
    </>
  );
}

/** What to do next, depending on which modules this app was generated with. */
function nextSteps() {
  const steps = [];
  if (has("gemini") || has("payments")) {
    steps.push(
      <>
        Copy <code>.env.example</code> to <code>.env.local</code> and fill it in. Keys stay on your server and are never sent
        to the browser.
      </>,
    );
  }
  if (has("payments")) {
    steps.push(
      <>
        Run <code>npm run keygen -- --pay-to</code> for a devnet address, then get free test USDC at{" "}
        <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">faucet.circle.com ↗</a>. No real money.
      </>,
    );
  }
  if (has("paysh")) {
    steps.push(
      <>
        Install the Pay.sh CLI with <code>brew install pay</code>, then run <code>npm run paysh</code> to pay your own API from
        your Pay.sh wallet, or <code>pay claude</code> to let Claude Code pay for it.
      </>,
    );
  }
  steps.push(
    <>
      Read <code>README.md</code>: every module explains what it does and which files are its own.
    </>,
    <>
      Make it yours: edit <code>app/page.tsx</code>, add pages under <code>app/</code>, and change the look in{" "}
      <code>app/globals.css</code>.
    </>,
  );
  return steps;
}
