import type { PaymentRequest } from "./types";

/** Validates an API body into a PaymentRequest, or returns a plain-English error. */
export function parsePaymentRequest(body: Record<string, unknown> | null, source: PaymentRequest["source"]): { ok: true; req: PaymentRequest } | { ok: false; error: string } {
  if (!body) return { ok: false, error: "Send a JSON body: { payeeName, address, amountUsdc, reference?, messageText? }." };
  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (!address) return { ok: false, error: "address is required (the Solana address you're about to pay)." };
  const amountUsdc = Number(body.amountUsdc ?? body.amount);
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) return { ok: false, error: "amountUsdc must be a positive number." };
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.slice(0, max) : undefined);
  const attestations = Array.isArray(body.attestations) ? body.attestations.filter((t): t is string => typeof t === "string").slice(0, 20) : [];
  return {
    ok: true,
    req: {
      address,
      amountUsdc,
      payeeName: str(body.payeeName ?? body.payee, 120),
      reference: str(body.reference ?? body.memo, 120),
      messageText: str(body.messageText ?? body.context, 6000),
      source,
      attestations,
    },
  };
}
