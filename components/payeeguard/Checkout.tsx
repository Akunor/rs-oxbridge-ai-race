"use client";

import { useState } from "react";
import { ExplorerLink } from "@/components/ui";
import { loadAttestations } from "./attestations";
import { VerdictCard, type CheckResultJson } from "./VerdictCard";

interface Props {
  payeeName: string;
  address: string;
  amountUsdc: number;
  item: string;
  /** Everything the shopping agent read on the page, including anything hidden. */
  pageText: string;
  /** Where to come back to after the merchant verifies (this checkout's path). */
  returnTo: string;
  /** Order reference (made on the server so it matches between server and browser). */
  reference: string;
}

type PayResult = CheckResultJson & { paid: boolean; signature?: string };

/**
 * The PayeeGuard checkout plugin. A shop drops this in next to its "pay" button. The shopper's
 * AI agent asks PayeeGuard first, and only pays when the verdict is PAY.
 */
export function PayeeGuardCheckout({ payeeName, address, amountUsdc, item, pageText, returnTo, reference }: Props) {
  const [phase, setPhase] = useState<"idle" | "checking" | "checked" | "paying" | "paid">("idle");
  const [result, setResult] = useState<CheckResultJson | null>(null);
  const [payment, setPayment] = useState<PayResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const body = () =>
    JSON.stringify({
      payeeName,
      address,
      amountUsdc,
      reference: `PayeeGuard order ${reference}`,
      messageText: pageText,
      attestations: loadAttestations(),
    });

  async function check() {
    setPhase("checking");
    setError(null);
    setPayment(null);
    try {
      const res = await fetch("/api/guard/check", {
        method: "POST",
        headers: { "content-type": "application/json", "x-payeeguard-source": "plugin" },
        body: body(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `Check failed (${res.status})`);
      setResult(json);
      setPhase("checked");
    } catch (err) {
      setError((err as Error).message);
      setPhase("idle");
    }
  }

  async function pay() {
    setPhase("paying");
    setError(null);
    try {
      const res = await fetch("/api/guard/pay", { method: "POST", headers: { "content-type": "application/json" }, body: body() });
      const json = await res.json();
      if (res.status === 409) {
        setResult(json);
        setPhase("checked");
        return;
      }
      if (!res.ok) throw new Error(json?.error?.message ?? `Payment failed (${res.status})`);
      setPayment(json);
      setResult(json);
      setPhase("paid");
    } catch (err) {
      setError((err as Error).message);
      setPhase("checked");
    }
  }

  const verifyHref = `/merchant/verify?name=${encodeURIComponent(payeeName)}&address=${encodeURIComponent(address)}&return=${encodeURIComponent(returnTo)}`;

  return (
    <section className="module plugin-shell agent-pane">
      <div className="module-strip">
        <span>PayeeGuard · checkout plugin</span>
        <span>Ref {reference}</span>
      </div>
      <div className="module-body">
        <dl className="kv">
          <dt>Paying</dt>
          <dd>{payeeName}</dd>
          <dt>To wallet</dt>
          <dd className="mono">{address}</dd>
          <dt>Amount</dt>
          <dd>
            {amountUsdc} USDC (devnet) · {item}
          </dd>
        </dl>

        {phase === "idle" && (
          <div className="stack" style={{ gap: 10 }}>
            <button className="btn btn--primary" onClick={check}>
              Let my AI agent pay safely
            </button>
            <span className="small muted">PayeeGuard checks who you&apos;re paying first. Nothing moves until it says PAY.</span>
          </div>
        )}
        {phase === "checking" && (
          <div className="notice">Checking the payee: lookalike addresses, Confirmation of Payee, wallet history, hidden instructions…</div>
        )}
        {error && <div className="notice notice--fault">{error}</div>}

        {result && phase !== "checking" && (
          <VerdictCard result={result}>
            {phase === "paid" && payment?.signature ? (
              <div className="notice notice--ok">
                Paid {amountUsdc} USDC on Solana devnet. Transaction <ExplorerLink signature={payment.signature} />
              </div>
            ) : result.verdict === "PAY" ? (
              <div className="row">
                <button className="btn btn--primary" onClick={pay} disabled={phase === "paying"}>
                  {phase === "paying" ? "Agent is paying…" : `Agent pays ${amountUsdc} USDC`}
                </button>
                <button className="btn-tool" onClick={check} disabled={phase === "paying"}>
                  Re-check
                </button>
              </div>
            ) : result.verdict === "HOLD" ? (
              <div className="row">
                <a className="btn btn--secondary" href={verifyHref}>
                  Ask {payeeName} to prove wallet ownership
                </a>
                <button className="btn-tool" onClick={check}>
                  Re-check
                </button>
              </div>
            ) : (
              <div className="row">
                <span className="tag tag--fault">Payment stopped. No money moved.</span>
                <button className="btn-tool" onClick={check}>
                  Re-check
                </button>
              </div>
            )}
          </VerdictCard>
        )}
      </div>
    </section>
  );
}
