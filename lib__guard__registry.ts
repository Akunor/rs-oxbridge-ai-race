import "server-only";
import { isSolanaAddress } from "./address";
import { kvGet, kvList, kvPush, kvSet } from "./kv";

// The verified-payee directory: who is who, and which wallet each business really uses.
// Seeded from environment variables (the demo shops) and grown by merchants who prove wallet
// ownership on /merchant/verify.

export interface Merchant {
  id: string;
  name: string;
  address: string;
  /** "onboarding": verified when the shop joined. "wallet-signature": proved by signing a code. */
  verifiedVia?: "onboarding" | "wallet-signature";
  verifiedAt?: string;
  /** Typical order size, for the unusual-amount check. */
  typicalOrderUsdc: number;
  /** Other names people use for this business. */
  aliases?: string[];
}

// Placeholders so the app renders before you set your own addresses (nobody holds these keys).
const PLACEHOLDER_SHOP = "A282nnZrXnChoMn8PUhgTjHDegUoBCmYEddw4hxo6G5S";
const PLACEHOLDER_NEW = "ESMb5yzVS7HkzMUeT7X9jcJ6XpyTa19CeawJ5kpGCHpQ";

function envAddress(...keys: string[]): string | null {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v && isSolanaAddress(v)) return v;
  }
  return null;
}

/** The demo's verified shop. */
export function shopMerchant(): Merchant {
  return {
    id: "saigon-coffee",
    name: process.env.MERCHANT_NAME || "Saigon Coffee Co.",
    address: envAddress("MERCHANT_ADDRESS", "PAY_TO_ADDRESS") ?? PLACEHOLDER_SHOP,
    verifiedVia: "onboarding",
    verifiedAt: "2026-10-25T00:00:00.000Z",
    typicalOrderUsdc: 0.05,
    aliases: ["saigon coffee", "saigon coffee company"],
  };
}

/** The demo's new, not-yet-verified shop (your Phantom wallet). */
export function newMerchant(): Merchant {
  return {
    id: "hanoi-tea",
    name: process.env.NEW_MERCHANT_NAME || "Hanoi Tea House",
    address: envAddress("NEW_MERCHANT_ADDRESS") ?? PLACEHOLDER_NEW,
    typicalOrderUsdc: 0.04,
    aliases: ["hanoi tea"],
  };
}

export const merchantConfigured = () => ({ shop: !!envAddress("MERCHANT_ADDRESS", "PAY_TO_ADDRESS"), newShop: !!envAddress("NEW_MERCHANT_ADDRESS") });

const VERIFIED_KEY = (address: string) => `pg:verified:${address}`;
const VERIFIED_LIST = "pg:verified-list";

/** Records a merchant that proved wallet ownership. */
export async function saveVerifiedMerchant(m: { name: string; address: string; verifiedAt: string }): Promise<void> {
  await kvSet(VERIFIED_KEY(m.address), m);
  await kvPush(VERIFIED_LIST, m, 100);
}

export async function verifiedRecord(address: string): Promise<{ name: string; address: string; verifiedAt: string } | null> {
  return kvGet(VERIFIED_KEY(address));
}

/** Everyone in the directory, with wallet-signature verifications merged in. */
export async function allMerchants(): Promise<Merchant[]> {
  const base = [shopMerchant(), newMerchant()];
  const verified = await kvList<{ name: string; address: string; verifiedAt: string }>(VERIFIED_LIST, 100);
  for (const v of verified) {
    const existing = base.find((m) => m.address === v.address);
    if (existing) {
      if (!existing.verifiedVia) Object.assign(existing, { verifiedVia: "wallet-signature", verifiedAt: v.verifiedAt });
    } else if (!base.some((m) => m.address === v.address)) {
      base.push({ id: `verified-${v.address.slice(0, 6)}`, name: v.name, address: v.address, verifiedVia: "wallet-signature", verifiedAt: v.verifiedAt, typicalOrderUsdc: 0.1 });
    }
  }
  return base;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(co|ltd|llc|inc|company|the)\b/g, "").replace(/\s+/g, " ").trim();

/** The directory entry whose name matches what the payer was told, if any. */
export function merchantByName(merchants: Merchant[], name: string | undefined): Merchant | undefined {
  if (!name?.trim()) return undefined;
  const n = norm(name);
  if (!n) return undefined;
  return merchants.find((m) => [m.name, ...(m.aliases ?? [])].some((alias) => {
    const a = norm(alias);
    return a === n || (a.length >= 5 && (n.includes(a) || a.includes(n)));
  }));
}
