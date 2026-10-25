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
  onPay,
}: {
  expect: DemoExpect;
  revealed: Set<ObserveKey>;
  signals: ObserveSignal[];
  phase: "journey" | "checking" | "verdict" | "paid";
  result: CheckResultJson | null;
  /** How many checks to show (for staggered reveal). */
  revealedCheckCount: number;
  error: string | null;
  paying: boolean;
  paidSignature: string | null;
  onPay: () => void;
}) {
  const visibleSignals = signals.filter((s) => revealed.has(s.key));

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
          Trust is the out-of-band payee directory — not a badge on the site. The agent must get PAY before it signs.
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
                  </span>
                </div>
              </div>
              <div className="verdict-body">
                <p className="small" style={{ margin: 0 }}>
                  {result.explanation}
                </p>
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
              </div>
            </div>

            <AgentOutcome verdict={result.verdict}>
              {phase === "paid" && paidSignature ? (
                <div className="notice notice--ok">
                  Agent paid on Solana devnet. Tx <ExplorerLink signature={paidSignature} />
                </div>
              ) : result.verdict === "PAY" ? (
                <button className="btn btn--primary" onClick={onPay} disabled={paying}>
                  {paying ? "Agent is paying…" : "Let agent complete payment"}
                </button>
              ) : result.verdict === "HOLD" ? (
                <span className="small">
                  Agent will not pay until an unknown payee proves wallet control (out-of-band / verify flow) — a site
                  badge is not enough.
                </span>
              ) : (
                <span className="tag tag--fault">Agent refuses to pay · no funds moved</span>
              )}
            </AgentOutcome>
          </div>
        )}
      </div>
    </section>
  );
}

function AgentOutcome({ verdict, children }: { verdict: string; children: ReactNode }) {
  return (
    <div className="demo-panel">
      <span className="label">Agent decision</span>
      <p style={{ margin: "0 0 10px", fontFamily: "var(--display)", fontWeight: 700, fontSize: 16 }}>
        {verdict === "PAY" ? "Agent may pay" : verdict === "HOLD" ? "Agent holds" : "Agent blocks payment"}
      </p>
      {children}
    </div>
  );
}
