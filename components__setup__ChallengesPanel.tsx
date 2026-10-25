"use client";

import { useState } from "react";
import { ExplorerLink, Module } from "@/components/ui";

type Out = Record<string, unknown> | null;

export function ChallengesPanel() {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<{ action: string; ok: boolean; out: Out }[]>([]);

  async function call(action: string, extra: Record<string, unknown> = {}): Promise<Out> {
    const res = await fetch("/api/admin/challenges", { method: "POST", headers: { "content-type": "application/json", "x-admin-key": key }, body: JSON.stringify({ action, ...extra }) });
    const out = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as Record<string, unknown>;
    setLog((l) => [{ action, ok: res.ok, out }, ...l].slice(0, 12));
    return res.ok ? out : null;
  }

  async function run(action: string) {
    setBusy(action);
    try {
      await call(action);
    } finally {
      setBusy(null);
    }
  }

  async function discover() {
    setBusy("discover");
    try {
      let from = 0;
      for (let round = 0; round < 40; round++) {
        const out = await call("discover", { from });
        if (!out) return;
        if (out.found !== null && out.found !== undefined) return;
        from = Number(out.next);
        if (from >= Number(out.total)) return;
      }
    } finally {
      setBusy(null);
    }
  }

  const sig = (o: Out, k: string) => (o && typeof o[k] === "string" ? (o[k] as string) : null);

  return (
    <Module label="On-chain challenges · +350 pts" right="team wallet signs">
      <label className="stack" style={{ gap: 6 }}>
        <span className="label">Verifier token (from your team page) to unlock</span>
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="paste the verifier token" />
      </label>
      <table className="table">
        <thead><tr><th>Step</th><th>What it does</th><th /></tr></thead>
        <tbody>
          <tr><td>0 · Status</td><td className="small">Reads your records: nonce, clearance account, fee, CRED balance.</td><td><button className="btn-tool" disabled={!key || !!busy} onClick={() => run("status")}>Run</button></td></tr>
          <tr><td>1 · Operation</td><td className="small">Sends the exact fee with the right memo in one transaction. Then press Run verification on Found it → Exact → Verified (30 + 50 + 70).</td><td><button className="btn-tool" disabled={!key || !!busy} onClick={() => run("operation")}>Run</button></td></tr>
          <tr><td>2 · Find mint layout</td><td className="small">mint_code has no published IDL: tries account layouts with free simulations until the program accepts one.</td><td><button className="btn-tool" disabled={!key || !!busy} onClick={discover}>Run</button></td></tr>
          <tr><td>3 · Minesweeper</td><td className="small">Mints a code, reads it from the record and presents it within seconds. Then verify Minted → Presented → Fast hands (90 + 80 + 30).</td><td><button className="btn-tool" disabled={!key || !!busy} onClick={() => run("minesweeper")}>Run</button></td></tr>
          <tr><td>3b · Present again</td><td className="small">Only if step 3 minted but didn&apos;t present.</td><td><button className="btn-tool" disabled={!key || !!busy} onClick={() => run("present")}>Run</button></td></tr>
        </tbody>
      </table>
      {busy && <div className="notice">Running {busy}… (on-chain steps take 5–30 seconds)</div>}
      {log.map((l, i) => (
        <div key={i} className="stack" style={{ gap: 6 }}>
          <span className={`tag ${l.ok ? "tag--ok" : "tag--fault"}`} style={{ alignSelf: "flex-start" }}>{l.action} · {l.ok ? "ok" : "failed"}</span>
          {["signature", "mintSignature", "presentSignature"].map((k) => sig(l.out, k) && <span key={k} className="small">{k}: <ExplorerLink signature={sig(l.out, k)!} /></span>)}
          <pre className="code">{JSON.stringify(l.out, null, 2)}</pre>
        </div>
      ))}
    </Module>
  );
}
