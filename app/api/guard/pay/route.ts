import { parsePaymentRequest } from "@/lib/guard/parse";
import { payWithGuard } from "@/lib/guard/pay";
import { absolute, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/guard/pay — the shop's AI agent pays, but only after PayeeGuard says PAY.
// The check is always re-run here on the server: a browser can't skip it.
export async function POST(request: Request) {
  const parsed = parsePaymentRequest(await readJson(request), "checkout");
  if (!parsed.ok) return json({ error: { code: "invalid_input", message: parsed.error } }, 400);
  try {
    const out = await payWithGuard(parsed.req, { mode: "enforce", spendingLimits: true });
    const receipt = { hash: out.receipt.hash, url: absolute(request, out.receipt.url) };
    if (!out.paid) return json({ paid: false, ...out.result, receipt }, 409);
    return json({ paid: true, signature: out.signature, explorer: `https://explorer.solana.com/tx/${out.signature}?cluster=devnet`, ...out.result, receipt });
  } catch (err) {
    return json({ error: { code: "payment_failed", message: (err as Error).message } }, 502);
  }
}
