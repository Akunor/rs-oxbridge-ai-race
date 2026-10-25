"use client";

import type { ReactNode } from "react";
import { AddressDiff } from "@/components/payeeguard/VerdictCard";
import type { CheckResultJson } from "@/components/payeeguard/VerdictCard";
import { ExplorerLink } from "@/components/ui";
import type { DemoExpect, ObserveKey, ObserveSignal } from "@/lib/demo/types";

const ICON: Record<string, string> = { pass: "✓", warn: "!", fail: "✕", skip: "–" };

export function GuardPanel({
  expect,
  revealed,
  signals,
  phase,
  result,
  revealedCheckCount,
  error,
  paying,
  paidSignature,
  verifyHref,
  onRecheckAfterVerify,
}: {
  expect: DemoExpect;
  revealed: Set<ObserveKey>;
  signals: ObserveSignal[];
  phase: "journey" | "checking" | "verdict" | "paid";
  result: CheckResultJson | null;
  revealedCheckCount: number;
  error: string | null;
  paying: boolean;
  paidSignature: string | null;
  /** When set on HOLD (coffee-new), link out for Phantom proof-of-control. */
  verifyHref?: string | null;
  onRecheckAfterVerify?: () => void;
}) {
  const visibleSignals = signals.filter((s) => revealed.has(s.key));
  const jev = result?.jev as JevView | undefined;
  const injection = result?.checks.find((c) => c.id === "injection" && (c.status === "fail" || c.status === "warn"));
  const quotes = (injection?.evidence?.quotes as string[] | undefined) ?? [];
  const topReasons = result?.topReasons?.length ? result.topReasons : result?.explanation ? [result.explanation] : [];

  return (
    <section className="guard-panel" aria-label="PayeeGuard payment gate">
      <div className="guard-panel-head">
        <div>
          <span className="eyebrow">PayeeGuard · payment gate</span>
          <h2 className="guard-panel-title">Evaluating for the agent</h2>
        </div>
        <span className={`tag tag--${expect === "PAY" ? "ok" : expect === "HOLD" ? "warn" : "fault"}`}>
          Expect {expect}
        </span>
      </div>

      <div className="guard-panel-body">
        <p className="small muted" style={{ margin: 0 }}>
          Hard gates (lookalike / directory mismatch) are high confidence. Soft text signals are scored heuristics
          {jev ? " plus Jev System-1 probabilities" : ""} — never enough alone to approve a blocked lookalike.
        </p>

        <div className="stack" style={{ gap: 8 }}>
          <span className="label">Observed payment signals</span>
          {visibleSignals.length === 0 ? (
            <div className="empty" style={{ padding: 16 }}>
              Waiting for the agent to read the site…
            </div>
          ) : (
            <ul className="signal-list">
              {visibleSignals.map((s) => (
                <li key={s.key} className={s.untrusted ? "signal signal--untrusted" : "signal"}>
                  <span className="signal-label">
                    {s.label}
                    {s.untrusted ? " · ignored" : ""}
                  </span>
                  <span className={`signal-value mono${s.untrusted ? " muted" : ""}`}>{s.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {phase === "checking" && <div className="notice">Agent submitted the payment intent to PayeeGuard…</div>}
        {error && <div className="notice notice--fault">{error}</div>}

        {result && phase !== "checking" && (
          <div className="stack" style={{ gap: 12 }}>
            {result.verdict === "BLOCK" && (
              <div className="act-banner act-banner--block" role="alert">
                Payment attempt flagged · agent will not sign
              </div>
            )}
            {result.verdict === "HOLD" && (
              <div className="act-banner act-banner--hold" role="status">
                Hold · agent will not pay until the unknown payee is confirmed out-of-band
              </div>
            )}
            {(phase === "paid" || (result.verdict === "PAY" && paying)) && (
              <div className="act-banner act-banner--pay" role="status">
                {phase === "paid" ? "Safe · agent payment allowed" : "Safe · agent is completing payment…"}
              </div>
            )}

            <div className={`verdict verdict--${result.verdict}`} role="status">
              <div className="verdict-head">
                <span className="verdict-badge">
                  {result.verdict === "PAY" ? "SAFE TO PAY" : result.verdict === "HOLD" ? "HOLD" : "BLOCKED"}
                </span>
                <div className="stack" style={{ gap: 4 }}>
                  <span className="verdict-title">{result.headline}</span>
                  <span className="small muted">
                    Risk {result.score}/100 · {(result.ms / 1000).toFixed(1)}s ·{" "}
                    {result.ai.used ? `rules + AI (${result.ai.model})` : "rules"}
                    {jev ? " + Jev" : ""}
                  </span>
                </div>
              </div>
              <div className="verdict-body">
                {topReasons.length > 0 && (
                  <ul className="top-reasons">
                    {topReasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}

                {quotes.length > 0 && (
                  <div className="stack" style={{ gap: 6 }}>
                    <span className="label">
                      {injection?.status === "fail" ? "Hidden instructions that hijacked the agent" : "Suspicious text the agent read"}
                    </span>
                    {quotes.map((q) => (
                      <blockquote key={q} className="quote">
                        “{q}”
                      </blockquote>
                    ))}
                  </div>
                )}

                <ul className="checks">
                  {result.checks.slice(0, revealedCheckCount).map((c) => (
                    <li key={c.id} className="check-reveal">
                      <span className={`ic ic--${c.status}`}>{ICON[c.status] ?? "–"}</span>
                      <span>
                        <b>{c.label}</b>
                        <span className="muted">{c.detail}</span>
                      </span>
                      <span className="pts">{c.points ? `+${c.points}` : ""}</span>
                    </li>
                  ))}
                </ul>
                {result.checks.find((c) => c.id === "lookalike" && c.status === "fail" && c.evidence) && (
                  <AddressDiff
                    candidate={String(result.checks.find((c) => c.id === "lookalike")!.evidence!.candidate)}
                    genuine={String(result.checks.find((c) => c.id === "lookalike")!.evidence!.genuine)}
                  />
                )}
                {jev && <JevSoftView jev={jev} />}
              </div>
            </div>

            <AgentOutcome verdict={result.verdict}>
              {phase === "paid" && paidSignature ? (
                <div className="notice notice--ok">
                  Agent paid automatically on Solana devnet. Tx <ExplorerLink signature={paidSignature} />
                </div>
              ) : result.verdict === "PAY" && paying ? (
                <div className="notice notice--ok">Verdict PAY · completing transfer automatically…</div>
              ) : result.verdict === "PAY" && phase === "verdict" && !paidSignature ? (
                <div className="notice notice--ok">Verdict PAY · agent will pay without a second confirm.</div>
              ) : result.verdict === "HOLD" && verifyHref ? (
                <div className="stack" style={{ gap: 10 }}>
                  <span className="small">
                    Ask the vendor to prove wallet ownership in Phantom. After they sign, return here and re-check —
                    then the agent can pay.
                  </span>
                  <div className="row">
                    <a className="btn btn--primary" href={verifyHref}>
                      Ask vendor to prove ownership (Phantom)
                    </a>
                    {onRecheckAfterVerify && (
                      <button type="button" className="btn btn--secondary" onClick={onRecheckAfterVerify}>
                        Re-check after verify
                      </button>
                    )}
                  </div>
                </div>
              ) : result.verdict === "HOLD" ? (
                <span className="small">
                  Unknown payee path only. A site badge cannot clear HOLD. Known-brand lookalikes still hard-BLOCK.
                </span>
              ) : (
                <span className="small">No funds moved. The agent harness must refuse to sign.</span>
              )}
            </AgentOutcome>
          </div>
        )}
      </div>
    </section>
  );
}

type JevView = {
  used: boolean;
  diversionProb?: number;
  fraudScore?: number;
  pattern?: string;
  patternConfidence?: number;
};

function JevSoftView({ jev }: { jev: JevView }) {
  if (!jev.used) return null;
  return (
    <div className="demo-panel">
      <span className="label">Jev System-1 · soft risk (additive)</span>
      <dl className="kv">
        {jev.diversionProb != null && (
          <>
            <dt>Diversion P</dt>
            <dd className="mono">{(jev.diversionProb * 100).toFixed(1)}%</dd>
          </>
        )}
        {jev.fraudScore != null && (
          <>
            <dt>Fraud score</dt>
            <dd className="mono">{jev.fraudScore.toFixed(2)}</dd>
          </>
        )}
        {jev.pattern && (
          <>
            <dt>Pattern</dt>
            <dd>
              {jev.pattern}
              {jev.patternConfidence != null ? ` · conf ${(jev.patternConfidence * 100).toFixed(0)}%` : ""}
            </dd>
          </>
        )}
      </dl>
      <span className="small muted">Cannot override a hard BLOCK (e.g. lookalike of a directory wallet).</span>
    </div>
  );
}

function AgentOutcome({ verdict, children }: { verdict: string; children: ReactNode }) {
  return (
    <div className="demo-panel">
      <span className="label">Agent decision</span>
      <p style={{ margin: "0 0 10px", fontFamily: "var(--display)", fontWeight: 700, fontSize: 16 }}>
        {verdict === "PAY" ? "Agent pays" : verdict === "HOLD" ? "Agent holds" : "Agent blocks payment"}
      </p>
      {children}
    </div>
  );
}
