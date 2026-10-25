"use client";

import { useEffect, useState } from "react";
import { Led, Module } from "@/components/ui";

interface Status {
  verifierToken: boolean;
  ai: { provider: string | null; model: string };
  agentWallet: { address: string; sol: number | null; usdc: string | null; cred: string | null } | null;
  agentWalletError: string | null;
  shop: { name: string; address: string; configured: boolean };
  newShop: { name: string; address: string; configured: boolean };
  challengeId: boolean;
  sharedStorage: boolean;
}

function Row({ ok, label, children }: { ok: boolean | null; label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td><Led tone={ok === null ? undefined : ok ? "ok" : "fault"} /> {label}</td>
      <td className="small">{children}</td>
    </tr>
  );
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn-tool" onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}>
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export function SetupPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [keys, setKeys] = useState<{ address: string; secretKey: string } | null>(null);
  const [shopKeys, setShopKeys] = useState<{ address: string; secretKey: string } | null>(null);

  const refresh = () => fetch("/api/setup/status", { cache: "no-store" }).then((r) => r.json()).then(setStatus).catch(() => setStatus(null));
  useEffect(() => {
    refresh();
  }, []);
  const gen = async (set: (k: { address: string; secretKey: string }) => void) => set(await fetch("/api/setup/keypair", { cache: "no-store" }).then((r) => r.json()));

  const w = status?.agentWallet;
  return (
    <div className="cols">
      <Module label="Status" right={<button className="btn-tool" onClick={refresh}>Refresh</button>}>
        {!status ? (
          <div className="empty">Loading…</div>
        ) : (
          <table className="table">
            <tbody>
              <Row ok={status.verifierToken} label="Verifier token">{status.verifierToken ? "Set" : "Add AGENT_STUDIO_VERIFIER_TOKEN (team page)"}</Row>
              <Row ok={!!status.ai.provider} label="AI model">{status.ai.provider ? `${status.ai.provider} · ${status.ai.model}` : "Add GEMINI_API_KEY (free at aistudio.google.com/apikey)"}</Row>
              <Row ok={!!w} label="Team / agent wallet">{w ? <span className="mono">{w.address}</span> : status.agentWalletError}</Row>
              {w && <Row ok={(w.sol ?? 0) >= 0.01} label="Devnet SOL (fees)">{w.sol ?? "?"} SOL {(w.sol ?? 0) < 0.01 && <> · get some at <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">faucet.solana.com</a></>}</Row>}
              {w && <Row ok={Number(w.usdc ?? 0) >= 0.05} label="Devnet USDC (payments)">{w.usdc ?? "no USDC account yet"} {Number(w.usdc ?? 0) < 0.05 && <> · get some at <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">faucet.circle.com</a> (Solana Devnet)</>}</Row>}
              {w && <Row ok={Number(w.cred ?? 0) > 0} label="CRED (challenges)">{w.cred ?? "none yet"}{!(Number(w.cred ?? 0) > 0) && " · arrives when organisers seed your registered wallet"}</Row>}
              <Row ok={status.shop.configured} label="Shop wallet">{status.shop.configured ? <span className="mono">{status.shop.address}</span> : "Add MERCHANT_ADDRESS (a placeholder is used until then)"}</Row>
              <Row ok={status.newShop.configured} label="New-shop wallet">{status.newShop.configured ? <span className="mono">{status.newShop.address}</span> : "Add NEW_MERCHANT_ADDRESS = your Phantom wallet address"}</Row>
              <Row ok={status.challengeId} label="Challenge ID">{status.challengeId ? "Set" : "Add CHALLENGE_ID (team page)"}</Row>
              <Row ok={status.sharedStorage ? true : null} label="Shared storage">{status.sharedStorage ? "Upstash Redis connected" : "Optional: connect Upstash Redis in Vercel → Storage"}</Row>
            </tbody>
          </table>
        )}
      </Module>
      <Module label="Make wallets (devnet only)">
        <p className="small" style={{ margin: 0 }}>
          1) <b>Team / agent wallet</b>: pays for things and solves the challenges. Put the secret in <code>AGENT_PRIVATE_KEY</code> and register the address on your team page.
        </p>
        <button className="btn btn--secondary" onClick={() => gen(setKeys)}>Generate team wallet</button>
        {keys && (
          <table className="table">
            <tbody>
              <tr><th>Address</th><td className="mono">{keys.address}</td><td><Copy text={keys.address} /></td></tr>
              <tr><th>AGENT_PRIVATE_KEY</th><td className="mono">{keys.secretKey}</td><td><Copy text={keys.secretKey} /></td></tr>
            </tbody>
          </table>
        )}
        <p className="small" style={{ margin: 0 }}>2) <b>Shop wallet</b>: the demo coffee shop gets paid here. Only the address is needed (<code>MERCHANT_ADDRESS</code>).</p>
        <button className="btn btn--secondary" onClick={() => gen(setShopKeys)}>Generate shop wallet</button>
        {shopKeys && (
          <table className="table">
            <tbody>
              <tr><th>MERCHANT_ADDRESS</th><td className="mono">{shopKeys.address}</td><td><Copy text={shopKeys.address} /></td></tr>
            </tbody>
          </table>
        )}
        <div className="notice">Generated keys are shown once and never stored. Test money only: never put real funds in these wallets.</div>
      </Module>
    </div>
  );
}
