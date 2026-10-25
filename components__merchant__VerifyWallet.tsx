"use client";

import { useState } from "react";
import { Module } from "@/components/ui";
import { saveAttestation } from "@/components/payeeguard/attestations";

interface SolanaProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signMessage(message: Uint8Array, display?: "utf8" | "hex"): Promise<{ signature: Uint8Array } | Uint8Array>;
}

function walletProvider(): SolanaProvider | null {
  const w = window as unknown as { phantom?: { solana?: SolanaProvider }; solana?: SolanaProvider; solflare?: SolanaProvider; backpack?: SolanaProvider };
  return w.phantom?.solana ?? w.solana ?? w.solflare ?? w.backpack ?? null;
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

export function VerifyWallet({ initialName, initialAddress, returnTo }: { initialName: string; initialAddress: string; returnTo?: string }) {
  const [name, setName] = useState(initialName);
  const [address, setAddress] = useState(initialAddress);
  const [connected, setConnected] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "connecting" | "signing" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connect(): Promise<string | null> {
    const provider = walletProvider();
    if (!provider) {
      setError("No Solana wallet found in this browser. Install Phantom (phantom.com), turn on Testnet mode → Solana Devnet, then reload this page.");
      return null;
    }
    setStep("connecting");
    const { publicKey } = await provider.connect();
    const pk = publicKey.toString();
    setConnected(pk);
    if (!address) setAddress(pk);
    setStep("idle");
    return pk;
  }

  async function verify() {
    setError(null);
    try {
      const provider = walletProvider();
      const pk = connected ?? (await connect());
      if (!provider || !pk) return;
      const target = address.trim() || pk;
      if (pk !== target) {
        setError(`Your wallet is connected as ${pk.slice(0, 4)}…${pk.slice(-4)}, but you're verifying ${target.slice(0, 4)}…${target.slice(-4)}. Switch account in your wallet, or use the connected address.`);
        return;
      }
      setStep("signing");
      const challenge = await fetch("/api/merchant/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, address: target }) }).then((r) => r.json());
      if (challenge.error) throw new Error(challenge.error.message);
      setMessage(challenge.message);
      const signed = await provider.signMessage(new TextEncoder().encode(challenge.message), "utf8");
      const signature = signed instanceof Uint8Array ? signed : signed.signature;
      const result = await fetch("/api/merchant/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: challenge.token, signature: toBase64(signature) }) }).then((r) => r.json());
      if (!result.ok) throw new Error(result.reason ?? "Verification failed.");
      saveAttestation(result.attestation);
      setStep("done");
    } catch (err) {
      setError((err as Error).message || "The wallet refused to sign.");
      setStep("idle");
    }
  }

  return (
    <div className="cols">
      <Module label="1 · Your business and wallet">
        <label className="stack" style={{ gap: 6 }}>
          <span className="label">Business name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Hanoi Tea House" />
        </label>
        <label className="stack" style={{ gap: 6 }}>
          <span className="label">Wallet that receives payments</span>
          <input value={address} onChange={(e) => setAddress(e.target.value.trim())} placeholder="Connect your wallet to fill this in" />
        </label>
        <div className="row">
          <button className="btn btn--secondary" onClick={() => connect().catch((e) => setError((e as Error).message))} disabled={step !== "idle"}>
            {connected ? `Connected ${connected.slice(0, 4)}…${connected.slice(-4)}` : "Connect wallet"}
          </button>
          <button className="btn btn--primary" onClick={verify} disabled={step !== "idle" || !name.trim()}>
            {step === "signing" ? "Check your wallet…" : "Sign the one-time code ▸"}
          </button>
        </div>
        {error && <div className="notice notice--fault">{error}</div>}
      </Module>
      <Module label="2 · What you sign" variant="diagram">
        {step === "done" ? (
          <div className="stack">
            <div className="notice notice--ok">✓ Verified. {name} now has a confirmed wallet in PayeeGuard&apos;s directory. Agents can pay it without a hold.</div>
            {returnTo && <a className="btn btn--primary" href={returnTo}>Back to the checkout ▸</a>}
          </div>
        ) : message ? (
          <pre className="code">{message}</pre>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            Your wallet will show a message with a one-time code like <code>PG-482913</code>. Signing proves you hold the wallet&apos;s private key. A scammer with a
            lookalike address can&apos;t produce this signature for the real wallet.
          </p>
        )}
      </Module>
    </div>
  );
}
