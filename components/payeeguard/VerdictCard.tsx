"use client";

import type { ReactNode } from "react";
import { diffAddress } from "@/lib/guard/address";
import type { GuardCheck, GuardResult } from "@/lib/guard/types";

const ICON: Record<GuardCheck["status"], string> = { pass: "✓", warn: "!", fail: "✕", skip: "–" };
const BADGE: Record<GuardResult["verdict"], string> = { PAY: "SAFE TO PAY", HOLD: "HOLD", BLOCK: "BLOCKED" };

export type CheckResultJson = GuardResult & { receipt?: { hash: string; url: string } };

/** PayeeGuard's verdict: the decision, the risk score and every check with its evidence. */
export function VerdictCard({ result, children }: { result: CheckResultJson; children?: ReactNode }) {
  const lookalike = result.checks.find((c) => c.id === "lookalike" && c.status === "fail");
  const injection = result.checks.find((c) => c.id === "injection" && (c.status === "fail" || c.status === "warn"));
  const quotes = (injection?.evidence?.quotes as string[] | undefined) ?? [];
  return (
    <div className={`verdict verdict--${result.verdict}`} role="status" aria-live="polite">
      <div className="verdict-head">
        <span className="verdict-badge">{BADGE[result.verdict]}</span>
        <div className="stack" style={{ gap: 4 }}>
          <span className="verdict-title">{result.headline}</span>
          <span className="small muted">
            {result.mode === "advisory" ? "Advisory mode · " : ""}Checked in {(result.ms / 1000).toFixed(1)}s ·{" "}
            {result.ai.used ? `rules + AI (${result.ai.model})` : "rules"}
          </span>
        </div>
      </div>
      <div className="verdict-body">
        <div className="score" aria-label={`Risk score ${result.score} out of 100`}>
          <span>RISK {result.score}/100</span>
          <span className="score-bar">
            <i style={{ left: `calc(${Math.min(100, result.score)}% - 1px)` }} />
          </span>
          <span>PAY · HOLD · BLOCK</span>
        </div>
        {(result.topReasons?.length ? result.topReasons : result.explanation ? [result.explanation] : []).length > 0 && (
          <ul className="top-reasons">
            {(result.topReasons?.length ? result.topReasons : [result.explanation]).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}

        {lookalike?.evidence && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Address you were given vs the real one (red = different)</span>
            <AddressDiff candidate={String(lookalike.evidence.candidate)} genuine={String(lookalike.evidence.genuine)} />
          </div>
        )}

        {quotes.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Suspicious text the agent read</span>
            {quotes.map((q) => (
              <blockquote key={q} className="quote">
                “{q}”
              </blockquote>
            ))}
          </div>
        )}

        <ul className="checks">
          {result.checks.map((c) => (
            <li key={c.id}>
              <span className={`ic ic--${c.status}`} aria-label={c.status}>
                {ICON[c.status]}
              </span>
              <span>
                <b>{c.label}</b>
                <span className="muted">{c.detail}</span>
              </span>
              <span className="pts">{c.points ? `+${c.points}` : ""}</span>
            </li>
          ))}
        </ul>

        {children}

        {result.receipt && (
          <span className="small muted">
            Receipt{" "}
            <a href={result.receipt.url} target="_blank" rel="noopener noreferrer" className="mono">
              {result.receipt.hash.slice(0, 16)}…
            </a>{" "}
            · tamper-evident record of this decision
          </span>
        )}
      </div>
    </div>
  );
}

export function AddressDiff({ candidate, genuine }: { candidate: string; genuine: string }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="addr-diff" aria-label={`Requested address ${candidate}`}>
        <span className="label" style={{ display: "block" }}>
          Requested
        </span>
        {diffAddress(candidate, genuine).map((d, i) => (
          <span key={i} className={d.same ? "good" : "bad"}>
            {d.char}
          </span>
        ))}
      </div>
      <div className="addr-diff" aria-label={`Verified address ${genuine}`}>
        <span className="label" style={{ display: "block" }}>
          Verified
        </span>
        {genuine}
      </div>
    </div>
  );
}
