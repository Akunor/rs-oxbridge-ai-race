// Solana address helpers: validation, lookalike detection and the character-by-character diff
// the UI shows. Safe for browser and server.
import { getBase58Decoder, getBase58Encoder } from "@solana/kit";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function isSolanaAddress(value: string): boolean {
  if (typeof value !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  try {
    return getBase58Encoder().encode(value).length === 32;
  } catch {
    return false;
  }
}

export function addressBytes(value: string): Uint8Array {
  return new Uint8Array(getBase58Encoder().encode(value));
}

/** How many leading and trailing characters two different addresses share. */
export function sharedEnds(a: string, b: string): { prefix: number; suffix: number } {
  let prefix = 0;
  while (prefix < Math.min(a.length, b.length) && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < Math.min(a.length, b.length) - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  return { prefix, suffix };
}

/**
 * Address poisoning: scammers create addresses that start and end like a real one, because
 * wallets and people only check the ends. Two *different* addresses sharing 3+ characters at
 * both ends is almost never an accident (odds about 1 in 58^6 ≈ 38 billion).
 */
export function isLookalike(candidate: string, genuine: string): boolean {
  if (candidate === genuine) return false;
  const { prefix, suffix } = sharedEnds(candidate, genuine);
  return prefix >= 3 && suffix >= 3;
}

/** Per-character comparison for the UI: which characters match the genuine address. */
export function diffAddress(candidate: string, genuine: string): { char: string; same: boolean }[] {
  return candidate.split("").map((char, i) => ({ char, same: genuine[i] === char }));
}

/** Short display form: first 4 … last 4. Exactly what scammers exploit. */
export function shortAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
}

/**
 * Builds a deterministic lookalike of `genuine` (same first and last 4 characters, different
 * middle) for the demo's fake shop. It's a valid 32-byte address, but nobody holds a key for it.
 */
export function makeLookalike(genuine: string, seed = "payeeguard-demo"): string {
  let h = 2166136261;
  for (const c of seed + genuine) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const head = genuine.slice(0, 4);
  const tail = genuine.slice(-4);
  const middleLength = genuine.length - 8;
  for (let attempt = 0; attempt < 500; attempt++) {
    let middle = "";
    for (let i = 0; i < middleLength; i++) middle += BASE58[Math.floor(rand() * 58)];
    const candidate = head + middle + tail;
    if (candidate === genuine || !isSolanaAddress(candidate)) continue;
    // Must survive a decode/encode round trip, so it's a canonical address.
    if (getBase58Decoder().decode(getBase58Encoder().encode(candidate)) !== candidate) continue;
    return candidate;
  }
  throw new Error("Could not build a lookalike address");
}

/** Every Solana-address-looking string in a piece of text. */
export function addressesIn(text: string): string[] {
  return [...new Set((text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g) ?? []).filter(isSolanaAddress))];
}
