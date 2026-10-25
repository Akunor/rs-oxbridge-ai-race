import { evaluatePayment } from "@/lib/guard/engine";
import { parsePaymentRequest } from "@/lib/guard/parse";
import { issueReceipt } from "@/lib/guard/receipt";
import { absolute, json, preflight, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/guard/check — the public PayeeGuard API. Any agent or website can ask
// "is it safe to pay this address?" before paying. Nothing is paid here.
//   { "payeeName": "Saigon Coffee Co.", "address": "<solana address>", "amountUsdc": 0.05,
//     "reference": "order-123", "messageText": "<invoice / page / message the agent read>" }
export async function POST(request: Request) {
  const parsed = parsePaymentRequest(await readJson(request), "api");
  if (!parsed.ok) return json({ error: { code: "invalid_input", message: parsed.error } }, 400, true);
  const hdr = request.headers.get("x-payeeguard-source");
  const source = hdr === "plugin" || hdr === "demo" ? hdr : "api";
  const result = await evaluatePayment({ ...parsed.req, source });
  const receipt = await issueReceipt(result);
  return json({ ...result, receipt: { hash: receipt.hash, url: absolute(request, receipt.url) } }, 200, true);
}

export const OPTIONS = preflight;
