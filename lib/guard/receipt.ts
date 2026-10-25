import "server-only";
import { canonicalJson, sha256Hex } from "./crypto";
import { kvGet, kvList, kvPush, kvSet } from "./kv";
import type { GuardResult, Receipt, SignedReceipt } from "./types";

// Every decision gets a receipt. Its id is the SHA-256 fingerprint of the receipt's contents, so
// changing even one character afterwards changes the fingerprint and the edit shows. The full
// receipt also travels inside its link, so it can be checked without any database.

export function buildReceipt(result: GuardResult, payment?: { signature: string; memo?: string }): Receipt {
  return {
    v: 1,
    kind: payment ? "payment" : "decision",
    issuedAt: new Date().toISOString(),
    verdict: result.verdict,
    score: result.score,
    mode: result.mode,
    headline: result.headline,
    request: { ...result.request, messageText: result.request.messageText?.slice(0, 600) },
    checks: result.checks.map((c) => ({ id: c.id, status: c.status, points: c.points, detail: c.detail })),
    ...(payment ? { payment: { signature: payment.signature, network: "solana-devnet" as const, memo: payment.memo } } : {}),
  };
}

export const receiptHash = (r: Receipt) => sha256Hex(canonicalJson(r));

export function receiptUrl(hash: string, r: Receipt): string {
  return `/receipt/${hash}?d=${Buffer.from(JSON.stringify(r)).toString("base64url")}`;
}

export interface ReceiptSummary {
  hash: string;
  issuedAt: string;
  verdict: Receipt["verdict"];
  kind: Receipt["kind"];
  payee: string;
  amountUsdc: number;
  signature?: string;
  source?: string;
}

export async function issueReceipt(result: GuardResult, payment?: { signature: string; memo?: string }): Promise<SignedReceipt> {
  const receipt = buildReceipt(result, payment);
  const hash = receiptHash(receipt);
  await kvSet(`pg:receipt:${hash}`, receipt);
  await kvPush("pg:receipts", {
    hash,
    issuedAt: receipt.issuedAt,
    verdict: receipt.verdict,
    kind: receipt.kind,
    payee: receipt.request.payeeName || receipt.request.address,
    amountUsdc: receipt.request.amountUsdc,
    signature: payment?.signature,
    source: receipt.request.source,
  } satisfies ReceiptSummary, 100);
  return { hash, receipt, url: receiptUrl(hash, receipt) };
}

/** Loads a receipt by fingerprint (from the link's data or the store) and says whether it's intact. */
export async function loadReceipt(hash: string, encoded?: string): Promise<{ receipt: Receipt; intact: boolean } | null> {
  let receipt: Receipt | null = null;
  if (encoded) {
    try {
      receipt = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Receipt;
    } catch {
      receipt = null;
    }
  }
  receipt ??= await kvGet<Receipt>(`pg:receipt:${hash}`);
  if (!receipt) return null;
  return { receipt, intact: receiptHash(receipt) === hash };
}

export const recentReceipts = () => kvList<ReceiptSummary>("pg:receipts", 50);
