import "server-only";
import { aiModel, aiProvider } from "@/lib/ai/llm";
import { diffAddress, isLookalike, isSolanaAddress, sharedEnds, shortAddress } from "./address";
import { walletHistory } from "./chain";
import { proofOfControl } from "./confirm";
import { scanText } from "./injection";
import { allMerchants, merchantByName, type Merchant } from "./registry";
import { THRESHOLDS, verdictFor, type GuardCheck, type GuardResult, type MerchantView, type PaymentRequest } from "./types";

// PayeeGuard's risk engine: rules plus AI. Each check adds risk points; the total decides
//   0–29 → PAY · 30–59 → HOLD (ask the payee to prove wallet ownership) · 60+ → BLOCK.

export const POINTS = {
  invalidAddress: 100,
  lookalike: 60,
  payeeMismatch: 50,
  unverified: 30,
  verifiedUnderOtherName: 20,
  newWallet: 20,
  injection: 50,
  payeeChangeClaim: 25,
  pressure: 15,
  unusualAmount: 20,
} as const;

export interface EvaluateOptions {
  mode?: "enforce" | "advisory";
  /** Use the AI model to read messageText (slower, smarter). Rules always run. */
  useAi?: boolean;
  /** Look up wallet history on devnet. */
  useChain?: boolean;
  timeoutMs?: number;
}

const view = (m: Merchant, verified: boolean): MerchantView => ({ name: m.name, address: m.address, verified, verifiedVia: m.verifiedVia });

export async function evaluatePayment(req: PaymentRequest, opts: EvaluateOptions = {}): Promise<GuardResult> {
  const started = Date.now();
  const mode = opts.mode ?? "enforce";
  const useAi = opts.useAi ?? true;
  const request = sanitize(req);
  const checks: GuardCheck[] = [];

  if (!isSolanaAddress(request.address)) {
    checks.push({ id: "address_format", label: "Valid Solana address", status: "fail", points: POINTS.invalidAddress, detail: "This isn't a valid Solana address, so no payment can be made to it." });
    return finish({ request, mode, checks, started, aiUsed: false });
  }

  const merchants = await allMerchants();
  const exact = merchants.find((m) => m.address === request.address);
  const claimed = merchantByName(merchants, request.payeeName);

  // Kick off the slow look-ups together.
  const [proof, history, findings] = await Promise.all([
    proofOfControl(request.address, req.attestations ?? []),
    opts.useChain === false ? Promise.resolve(null) : walletHistory(request.address, Math.min(4000, opts.timeoutMs ?? 4000)).catch(() => null),
    scanText(request.messageText, { useAi, timeoutMs: opts.timeoutMs ? Math.max(3000, opts.timeoutMs) : 9000, payeeName: request.payeeName }),
  ]);

  // 1. Address poisoning: does this address imitate a verified payee's wallet?
  const imitated = merchants.find((m) => m.verifiedVia && isLookalike(request.address, m.address)) ?? merchants.find((m) => isLookalike(request.address, m.address));
  if (imitated) {
    const ends = sharedEnds(request.address, imitated.address);
    const differing = diffAddress(request.address, imitated.address).filter((d) => !d.same).length;
    checks.push({
      id: "lookalike",
      label: "Not a lookalike address",
      status: "fail",
      points: POINTS.lookalike,
      detail: `Address poisoning: this wallet starts and ends like ${imitated.name}'s (${shortAddress(imitated.address)}) but ${differing} of the characters in between are different. It is not their wallet.`,
      evidence: { genuine: imitated.address, candidate: request.address, sharedPrefix: ends.prefix, sharedSuffix: ends.suffix, differing },
    });
  } else {
    checks.push({ id: "lookalike", label: "Not a lookalike address", status: "pass", points: 0, detail: "It doesn't imitate any verified payee's wallet." });
  }

  // 2. Payee match: is this the wallet registered for the business the payer thinks it's paying?
  if (claimed) {
    if (claimed.address === request.address) {
      checks.push({ id: "payee_match", label: "Name matches wallet", status: "pass", points: 0, detail: `This is the registered wallet for ${claimed.name}.` });
    } else {
      checks.push({
        id: "payee_match",
        label: "Name matches wallet",
        status: "fail",
        points: POINTS.payeeMismatch,
        detail: `You think you're paying ${claimed.name}, but their verified wallet is ${shortAddress(claimed.address)}, not ${shortAddress(request.address)}. This is the "we changed our account details" scam.`,
        evidence: { claimedName: claimed.name, registeredAddress: claimed.address, requestedAddress: request.address },
      });
    }
  } else {
    checks.push({ id: "payee_match", label: "Name matches wallet", status: "skip", points: 0, detail: request.payeeName ? `"${request.payeeName}" isn't in the verified-payee directory yet.` : "No payee name was given to compare." });
  }

  // 3. Confirmation of Payee: has the owner of this wallet proved control of it?
  const verifiedName = exact?.verifiedVia ? exact.name : proof?.name;
  const verified = Boolean(verifiedName);
  if (verified) {
    const mismatch = request.payeeName && claimed === undefined && !looselySame(verifiedName!, request.payeeName);
    checks.push(
      mismatch
        ? { id: "confirmation_of_payee", label: "Confirmation of Payee", status: "warn", points: POINTS.verifiedUnderOtherName, detail: `This wallet is verified, but as "${verifiedName}", not "${request.payeeName}". Check you're paying who you mean to.` }
        : { id: "confirmation_of_payee", label: "Confirmation of Payee", status: "pass", points: 0, detail: `${verifiedName} proved it controls this wallet (${exact?.verifiedVia === "onboarding" ? "verified at onboarding" : "signed a one-time code with the wallet"}).` },
    );
  } else {
    checks.push({
      id: "confirmation_of_payee",
      label: "Confirmation of Payee",
      status: "warn",
      points: POINTS.unverified,
      detail: "Nobody has proved they control this wallet yet. Ask the payee to sign a one-time code with it (free, takes 10 seconds) before paying.",
    });
  }

  // 4. Wallet history: brand-new wallets are typical of throwaway scam accounts.
  if (!history) {
    checks.push({ id: "wallet_history", label: "Wallet history", status: "skip", points: 0, detail: "Couldn't read devnet right now, so wallet history wasn't checked." });
  } else if (history.transactions < 3) {
    checks.push({
      id: "wallet_history",
      label: "Wallet history",
      status: verified ? "pass" : "warn",
      points: verified ? 0 : POINTS.newWallet,
      detail: verified
        ? `A new wallet (${history.transactions} transaction${history.transactions === 1 ? "" : "s"}), but its owner is verified.`
        : `A brand-new wallet: only ${history.transactions} transaction${history.transactions === 1 ? "" : "s"} ever. Scam wallets are usually created just before the scam.`,
      evidence: { ...history },
    });
  } else {
    checks.push({ id: "wallet_history", label: "Wallet history", status: "pass", points: 0, detail: `An established wallet (${history.more ? "25+" : history.transactions} transactions${history.firstSeen ? `, active since ${history.firstSeen.slice(0, 10)}` : ""}).`, evidence: { ...history } });
  }

  // 5. Manipulation in what the agent read.
  if (!request.messageText?.trim()) {
    checks.push({ id: "injection", label: "No manipulation in the request", status: "skip", points: 0, detail: "No message or page text came with this request." });
  } else if (findings.instructionsToAgent) {
    checks.push({ id: "injection", label: "No manipulation in the request", status: "fail", points: POINTS.injection, detail: "Prompt injection: the text contains instructions aimed at the AI agent, trying to steer the payment.", evidence: { quotes: findings.quotes, summary: findings.summary, ai: findings.ai } });
  } else if (findings.payeeChangeClaim || findings.pressure || findings.secrecy) {
    const points = Math.min(POINTS.payeeChangeClaim, (findings.payeeChangeClaim ? POINTS.payeeChangeClaim : 0) + (findings.pressure || findings.secrecy ? POINTS.pressure : 0));
    const what = [findings.payeeChangeClaim && "a claim that payment details changed", findings.pressure && "pressure to pay fast", findings.secrecy && "a request for secrecy"].filter(Boolean).join(", ");
    checks.push({ id: "injection", label: "No manipulation in the request", status: "warn", points, detail: `Classic scam pressure: ${what}.`, evidence: { quotes: findings.quotes, summary: findings.summary, ai: findings.ai } });
  } else {
    checks.push({ id: "injection", label: "No manipulation in the request", status: "pass", points: 0, detail: findings.ai ? "PayeeGuard's AI read the text and found nothing suspicious." : "No suspicious wording found.", evidence: { ai: findings.ai } });
  }

  // 6. Unusual amount compared with this payee's typical order.
  const ref = exact ?? claimed;
  if (ref && request.amountUsdc > ref.typicalOrderUsdc * 3) {
    checks.push({ id: "amount", label: "Normal amount", status: "warn", points: POINTS.unusualAmount, detail: `${fmt(request.amountUsdc)} USDC is more than 3× ${ref.name}'s typical order (${fmt(ref.typicalOrderUsdc)} USDC).` });
  } else {
    checks.push({ id: "amount", label: "Normal amount", status: ref ? "pass" : "skip", points: 0, detail: ref ? `In line with ${ref.name}'s typical orders.` : "No payment history to compare against." });
  }

  const matched = imitated ?? claimed ?? exact;
  return finish({ request, mode, checks, started, aiUsed: findings.ai, matchedMerchant: matched ? view(matched, matched === exact ? verified : Boolean(matched.verifiedVia)) : undefined });
}

function finish(p: { request: GuardResult["request"]; mode: "enforce" | "advisory"; checks: GuardCheck[]; started: number; aiUsed: boolean; matchedMerchant?: MerchantView }): GuardResult {
  const score = Math.min(100, p.checks.reduce((a, c) => a + c.points, 0));
  const hardBlock = p.checks.some((c) => c.status === "fail" && (c.id === "lookalike" || c.id === "address_format"));
  const verdict = hardBlock ? "BLOCK" : verdictFor(score);
  const reasons = p.checks.filter((c) => c.status === "fail" || c.status === "warn");
  const who = p.request.payeeName || shortAddress(p.request.address);
  const headline =
    verdict === "PAY"
      ? `Safe to pay ${who}`
      : verdict === "HOLD"
        ? `Hold: confirm ${who} before paying`
        : `Blocked: this payment looks like fraud`;
  const explanation =
    verdict === "PAY"
      ? `${p.checks.find((c) => c.id === "confirmation_of_payee")?.detail ?? ""} No signs of address poisoning or manipulation.`.trim()
      : reasons.map((r) => r.detail).join(" ");
  return {
    verdict,
    score,
    mode: p.mode,
    headline,
    explanation,
    checks: p.checks,
    request: p.request,
    matchedMerchant: p.matchedMerchant,
    evaluatedAt: new Date().toISOString(),
    ms: Date.now() - p.started,
    ai: { used: p.aiUsed, model: p.aiUsed ? aiModel(aiProvider()) : "rules" },
  };
}

function sanitize(req: PaymentRequest): GuardResult["request"] {
  const amount = Number(req.amountUsdc);
  return {
    payeeName: typeof req.payeeName === "string" ? req.payeeName.trim().slice(0, 120) || undefined : undefined,
    address: String(req.address ?? "").trim(),
    amountUsdc: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 1e6) / 1e6 : 0,
    reference: typeof req.reference === "string" ? req.reference.trim().slice(0, 120) || undefined : undefined,
    messageText: typeof req.messageText === "string" ? req.messageText.slice(0, 6000) || undefined : undefined,
    source: req.source,
  };
}

const looselySame = (a: string, b: string) => {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return n(a) === n(b) || n(a).includes(n(b)) || n(b).includes(n(a));
};

const fmt = (n: number) => (Math.round(n * 1e6) / 1e6).toString();

export { THRESHOLDS };
