import "server-only";
import { getSpendingTracker } from "@/lib/paidapi/buyer";
import { loadAgentSigner } from "@/lib/payments/client";
import { payUsdc } from "@/lib/payments/transfer";
import { evaluatePayment, type EvaluateOptions } from "./engine";
import { issueReceipt } from "./receipt";
import type { GuardResult, PaymentRequest, SignedReceipt } from "./types";

// Check first, then pay. In "enforce" mode only a PAY verdict moves money.
// Shop payments also go through the template's Spending Controls (AGENT_BUDGET_USD and
// MAX_PAYMENT_USD), so the agent wallet can never be drained by the public demo.

export interface GuardedPayment {
  paid: boolean;
  signature?: string;
  result: GuardResult;
  receipt: SignedReceipt;
}

export async function payWithGuard(req: PaymentRequest, opts: EvaluateOptions & { memo?: string; spendingLimits?: boolean } = {}): Promise<GuardedPayment> {
  const result = await evaluatePayment(req, opts);
  const mode = opts.mode ?? "enforce";
  if (mode === "enforce" && result.verdict !== "PAY") {
    return { paid: false, result, receipt: await issueReceipt(result) };
  }
  if (!(result.request.amountUsdc > 0)) throw new Error("The amount must be more than 0 USDC.");
  const memo = opts.memo ?? result.request.reference;
  const signer = await loadAgentSigner();
  const { signature } = await payUsdc(
    signer,
    { to: result.request.address, amountUsdc: result.request.amountUsdc, memo },
    opts.spendingLimits ? { guard: getSpendingTracker() } : {},
  );
  return { paid: true, signature, result, receipt: await issueReceipt(result, { signature, memo }) };
}
