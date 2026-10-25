import "server-only";
import { randomInt } from "node:crypto";
import { isSolanaAddress } from "./address";
import { readToken, signToken, verifyWalletSignature } from "./crypto";
import { saveVerifiedMerchant, verifiedRecord } from "./registry";

// Confirmation of Payee for agents, with proof of control:
//   1. The merchant asks for a one-time code (challenge).
//   2. Their wallet signs a message containing that code (Phantom → signMessage). Free, instant,
//      no transaction. Only whoever holds the wallet's private key can do this.
//   3. We check the signature. If it's valid, the wallet is recorded as verified for that name,
//      and the browser gets a signed attestation token as a portable proof.

const CHALLENGE_TTL_MS = 10 * 60 * 1000;

export interface Challenge {
  message: string;
  token: string;
  code: string;
  expiresAt: string;
}

export function challengeMessage(name: string, address: string, code: string, issuedAt: string): string {
  return [
    "PayeeGuard · Confirmation of Payee",
    "",
    `I confirm that I control this wallet and that it receives payments for "${name}".`,
    "",
    `Wallet: ${address}`,
    `One-time code: ${code}`,
    `Issued: ${issuedAt}`,
    "",
    "Signing is free and does not move any money.",
  ].join("\n");
}

export function createChallenge(name: string, address: string): Challenge {
  const cleanName = name.trim().slice(0, 80);
  if (!cleanName) throw new Error("Enter the business name.");
  if (!isSolanaAddress(address)) throw new Error("That isn't a Solana address.");
  const code = `PG-${randomInt(100000, 999999)}`;
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  const message = challengeMessage(cleanName, address, code, issuedAt);
  return { message, code, expiresAt, token: signToken({ t: "challenge", name: cleanName, address, code, issuedAt, expiresAt }) };
}

interface ChallengePayload extends Record<string, unknown> { t: string; name: string; address: string; code: string; issuedAt: string; expiresAt: string }
interface AttestationPayload extends Record<string, unknown> { t: string; name: string; address: string; verifiedAt: string }

/** Checks the wallet's signature over the challenge. Returns an attestation token on success. */
export async function verifyChallenge(token: string, signature: Uint8Array): Promise<{ ok: true; attestation: string; name: string; address: string; verifiedAt: string } | { ok: false; reason: string }> {
  const c = readToken<ChallengePayload>(token);
  if (!c || c.t !== "challenge") return { ok: false, reason: "This verification code wasn't issued by PayeeGuard. Start again." };
  if (Date.parse(c.expiresAt) < Date.now()) return { ok: false, reason: "The code expired. Ask for a new one." };
  const message = challengeMessage(c.name, c.address, c.code, c.issuedAt);
  if (!verifyWalletSignature(c.address, message, signature)) {
    return { ok: false, reason: "The signature doesn't match this wallet. Make sure the connected wallet is the one you entered." };
  }
  const verifiedAt = new Date().toISOString();
  await saveVerifiedMerchant({ name: c.name, address: c.address, verifiedAt });
  return { ok: true, attestation: signToken({ t: "attestation", name: c.name, address: c.address, verifiedAt }), name: c.name, address: c.address, verifiedAt };
}

/** Has this wallet proved ownership? Checks the shared directory, then any tokens the payer holds. */
export async function proofOfControl(address: string, attestations: string[] = []): Promise<{ name: string; verifiedAt: string } | null> {
  const stored = await verifiedRecord(address);
  if (stored) return { name: stored.name, verifiedAt: stored.verifiedAt };
  for (const t of attestations.slice(0, 20)) {
    const a = readToken<AttestationPayload>(t);
    if (a?.t === "attestation" && a.address === address) return { name: a.name, verifiedAt: a.verifiedAt };
  }
  return null;
}
