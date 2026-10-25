import "server-only";

// Reads public wallet history from Solana devnet: a brand-new, empty wallet is a classic sign of
// a throwaway scam account.

export const DEVNET_RPC = () => process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

export interface WalletHistory {
  transactions: number;
  /** More than `transactions` exist (we only look at the latest 25). */
  more: boolean;
  firstSeen: string | null;
}

export async function walletHistory(address: string, timeoutMs = 4000): Promise<WalletHistory> {
  const res = await fetch(DEVNET_RPC(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [address, { limit: 25, commitment: "confirmed" }] }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`devnet RPC returned ${res.status}`);
  const body = (await res.json()) as { result?: { blockTime: number | null }[]; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  const list = body.result ?? [];
  const times = list.map((s) => s.blockTime).filter((t): t is number => typeof t === "number");
  return { transactions: list.length, more: list.length >= 25, firstSeen: times.length ? new Date(Math.min(...times) * 1000).toISOString() : null };
}
