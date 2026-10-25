"use client";

import { useState } from "react";
import { loadAttestations } from "@/components/payeeguard/attestations";
import { VerdictCard, type CheckResultJson } from "@/components/payeeguard/VerdictCard";

/** Try the public API: any payee, any address, any text. Nothing is paid. */
export function Playground({ examples }: { examples: { label: string; payeeName: string; address: string; amountUsdc: number; messageText: string }[] }) {
  const [form, setForm] = useState(examples[0]);
  const [result, setResult] = useState<CheckResultJson | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/guard/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, attestations: loadAttestations() }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      setResult(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="row">
        {examples.map((e) => (
          <button key={e.label} className="btn-tool" onClick={() => { setForm(e); setResult(null); }}>{e.label}</button>
        ))}
      </div>
      <label className="stack" style={{ gap: 4 }}><span className="label">Payee name</span><input value={form.payeeName} onChange={(e) => setForm({ ...form, payeeName: e.target.value })} /></label>
      <label className="stack" style={{ gap: 4 }}><span className="label">Wallet address</span><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value.trim() })} /></label>
      <label className="stack" style={{ gap: 4 }}><span className="label">Amount (USDC)</span><input type="number" step="0.01" min="0.000001" value={form.amountUsdc} onChange={(e) => setForm({ ...form, amountUsdc: Number(e.target.value) })} /></label>
      <label className="stack" style={{ gap: 4 }}><span className="label">Text the agent read (invoice, email, page)</span><textarea rows={4} value={form.messageText} onChange={(e) => setForm({ ...form, messageText: e.target.value })} /></label>
      <div className="row"><button className="btn btn--primary" onClick={run} disabled={busy}>{busy ? "Checking…" : "Check this payee ▸"}</button></div>
      {error && <div className="notice notice--fault">{error}</div>}
      {result && <VerdictCard result={result} />}
    </div>
  );
}
