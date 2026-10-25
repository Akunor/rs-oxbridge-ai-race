import "server-only";
import { createHash, createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import { addressBytes } from "./address";

// Hashing, signing and signature checks used by receipts and Confirmation of Payee.

/** JSON with sorted keys, so the same data always hashes the same way. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Server secret for signed tokens. Set GUARD_SECRET; falls back to one derived from the verifier token. */
function secret(): string {
  return process.env.GUARD_SECRET || `payeeguard:${process.env.AGENT_STUDIO_VERIFIER_TOKEN || "local-dev-secret"}`;
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** A tamper-proof token: base64url(json).hmac. Anyone can read it; only this server can make it. */
export function signToken(payload: Record<string, unknown>): string {
  const body = b64url(JSON.stringify(payload));
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readToken<T extends Record<string, unknown>>(token: string): T | null {
  if (typeof token !== "string") return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** True when `signature` is `address`'s ed25519 signature of `message` (what a wallet's signMessage makes). */
export function verifyWalletSignature(address: string, message: string, signature: Uint8Array): boolean {
  try {
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(addressBytes(address))]), format: "der", type: "spki" });
    return verify(null, Buffer.from(message, "utf8"), key, Buffer.from(signature));
  } catch {
    return false;
  }
}
