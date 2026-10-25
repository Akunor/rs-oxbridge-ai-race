import "server-only";
import { aiModel, aiProvider } from "@/lib/ai/llm";
import { diffAddress, isLookalike, isSolanaAddress, sharedEnds, shortAddress } from "./address";
import { walletHistory } from "./chain";
import { proofOfControl } from "./confirm";
import { scanText } from "./injection";
import { jevSoftRisk, JEV_SOFT_CAP } from "./jev";
import { allMerchants, merchantByName, type Merchant } from "./registry";
import { THRESHOLDS, verdictFor, type GuardCheck, type GuardResult, type JevSoftView, type MerchantView, type PaymentRequest } from "./types";

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
  /** Cap for optional Jev soft_risk — cannot alone force BLOCK; never clears hard BLOCK. */
  softRiskCap: JEV_SOFT_CAP,
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
    return finish({ request, mode, checks, started, aiUsed: false, registeredAddress: undefined });
  }

  const merchants = await allMerchants();
  const exact = merchants.find((m) => m.address === request.address);
  const claimed = merchantByName(merchants, request.payeeName);

  // Kick off the slow look-ups together (Jev is optional and fail-open).
  const [proof, history, findings, jev] = await Promise.all([
    proofOfControl(request.address, req.attestations ?? []),
    opts.useChain === false ? Promise.resolve(null) : walletHistory(request.address, Math.min(4000, opts.timeoutMs ?? 4000)).catch(() => null),
    scanText(request.messageText, { useAi, timeoutMs: opts.timeoutMs ? Math.max(3000, opts.timeoutMs) : 9000, payeeName: request.payeeName }),
    jevSoftRisk(request, Math.min(2500, opts.timeoutMs ?? 2500)),
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
      detail: lookalikePunchline(request.address, imitated.address, differing, displayName(imitated.name)),
      evidence: { genuine: imitated.address, candidate: request.address, sharedPrefix: ends.prefix, sharedSuffix: ends.suffix, differing },
    });
  } else {
    checks.push({ id: "lookalike", label: "Not a lookalike address", status: "pass", points: 0, detail: "It doesn't imitate any verified payee's wallet." });
  }

  // 2. Payee match: is this the wallet registered for the business the payer thinks it's paying?
  if (claimed) {
    if (claimed.address === request.address) {
      checks.push({
        id: "payee_match",
        label: "Name matches wallet",
        status: "pass",
        points: 0,
        detail: `This is the registered wallet for ${displayName(claimed.name)}.`,
      });
    } else {
      const differing = diffAddress(request.address, claimed.address).filter((d) => !d.same).length;
      const shortSame = shortAddress(claimed.address) === shortAddress(request.address);
      checks.push({
        id: "payee_match",
        label: "Name matches wallet",
        status: "fail",
        points: POINTS.payeeMismatch,
        detail: shortSame
          ? `You think you're paying ${displayName(claimed.name)}, but both wallets look like ${shortAddress(claimed.address)} — ${differing} middle characters differ. This is not their wallet (classic “we changed our account details” scam).`
          : `You think you're paying ${displayName(claimed.name)}, but their verified wallet is ${shortAddress(claimed.address)}, not ${shortAddress(request.address)}. This is the "we changed our account details" scam.`,
        evidence: { claimedName: claimed.name, registeredAddress: claimed.address, requestedAddress: request.address, differing },
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
        ? { id: "confirmation_of_payee", label: "Confirmation of Payee", status: "warn", points: POINTS.verifiedUnderOtherName, detail: `This wallet is verified, but as "${displayName(verifiedName!)}", not "${displayName(request.payeeName!)}". Check you're paying who you mean to.` }
        : { id: "confirmation_of_payee", label: "Confirmation of Payee", status: "pass", points: 0, detail: `${displayName(verifiedName!)} proved it controls this wallet (${exact?.verifiedVia === "onboarding" ? "verified at onboarding" : "signed a one-time code with the wallet"}).` },
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
    const newWalletDetail =
      history.transactions === 0
        ? "A brand-new wallet with no history. Scam wallets are usually created just before the scam."
        : `A brand-new wallet: only ${history.transactions} transaction${history.transactions === 1 ? "" : "s"} ever. Scam wallets are usually created just before the scam.`;
    checks.push({
      id: "wallet_history",
      label: "Wallet history",
      status: verified ? "pass" : "warn",
      points: verified ? 0 : POINTS.newWallet,
      detail: verified
        ? history.transactions === 0
          ? "A brand-new wallet with no history, but its owner is verified."
          : `A new wallet (${history.transactions} transaction${history.transactions === 1 ? "" : "s"}), but its owner is verified.`
        : newWalletDetail,
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

  // 7. Optional Jev System-1 soft risk (additive; never overrides hard BLOCK).
  const softPoints = Math.min(POINTS.softRiskCap, Math.max(0, jev.points));
  if (!jev.used) {
    checks.push({
      id: "soft_risk",
      label: "Jev soft risk",
      status: "skip",
      points: 0,
      detail: jev.detail,
    });
  } else if (softPoints > 0) {
    checks.push({
      id: "soft_risk",
      label: "Jev soft risk",
      status: "warn",
      points: softPoints,
      detail: jev.detail,
      evidence: {
        diversionProb: jev.diversionProb,
        fraudScore: jev.fraudScore,
        pattern: jev.pattern,
        patternConfidence: jev.patternConfidence,
        cappedAt: POINTS.softRiskCap,
      },
    });
  } else {
    checks.push({
      id: "soft_risk",
      label: "Jev soft risk",
      status: "pass",
      points: 0,
      detail: jev.detail,
      evidence: {
        diversionProb: jev.diversionProb,
        fraudScore: jev.fraudScore,
        pattern: jev.pattern,
        patternConfidence: jev.patternConfidence,
      },
    });
  }

  const matched = imitated ?? claimed ?? exact;
  const jevView: JevSoftView | undefined = jev.used
    ? {
        used: true,
        diversionProb: jev.diversionProb,
        fraudScore: jev.fraudScore,
        pattern: jev.pattern,
        patternConfidence: jev.patternConfidence,
        ms: jev.ms,
      }
    : undefined;
  return finish({
    request,
    mode,
    checks,
    started,
    aiUsed: findings.ai,
    matchedMerchant: matched ? view(matched, matched === exact ? verified : Boolean(matched.verifiedVia)) : undefined,
    jev: jevView,
    registeredAddress: claimed?.address ?? imitated?.address,
  });
}

function finish(p: {
  request: GuardResult["request"];
  mode: "enforce" | "advisory";
  checks: GuardCheck[];
  started: number;
  aiUsed: boolean;
  matchedMerchant?: MerchantView;
  jev?: JevSoftView;
  registeredAddress?: string;
}): GuardResult {
  const score = Math.min(100, p.checks.reduce((a, c) => a + c.points, 0));
  // Hard floors: lookalike / invalid address always BLOCK regardless of soft scores (Jev cannot clear).
  const hardBlock = p.checks.some((c) => c.status === "fail" && (c.id === "lookalike" || c.id === "address_format"));
  const verdict = hardBlock ? "BLOCK" : verdictFor(score);
  const ranked = p.checks
    .filter((c) => c.status === "fail" || c.status === "warn")
    .sort((a, b) => {
      const rank = (s: GuardCheck["status"]) => (s === "fail" ? 0 : 1);
      const d = rank(a.status) - rank(b.status);
      return d !== 0 ? d : b.points - a.points;
    });
  const topReasons =
    verdict === "PAY"
      ? [
          p.checks.find((c) => c.id === "confirmation_of_payee")?.detail ?? "Payee confirmed.",
          "No signs of address poisoning or manipulation.",
        ].slice(0, 2)
      : ranked.slice(0, 2).map((r) => r.detail);

  const who = displayName(p.request.payeeName) || shortAddress(p.request.address);
  const injection = p.checks.find((c) => c.id === "injection" && c.status === "fail");
  const hijacked =
    verdict === "BLOCK" &&
    Boolean(injection?.evidence) &&
    p.registeredAddress &&
    p.registeredAddress !== p.request.address &&
    // Prefer agent-instruction injections (quotes / summary from scan) over soft pressure-only fails
    (Boolean((injection?.evidence?.quotes as string[] | undefined)?.length) ||
      String(injection?.detail ?? "").toLowerCase().includes("prompt injection"));

  const headline = hijacked
    ? `Agent was hijacked: tried to pay ${shortAddress(p.request.address)} instead of ${shortAddress(p.registeredAddress!)}`
    : verdict === "PAY"
      ? `Safe to pay ${who}`
      : verdict === "HOLD"
        ? `Hold: confirm ${who} before paying`
        : `Blocked: this payment looks like fraud`;

  const explanation = topReasons.join(" ");
  return {
    verdict,
    score,
    mode: p.mode,
    headline,
    topReasons,
    explanation,
    checks: p.checks,
    request: p.request,
    matchedMerchant: p.matchedMerchant,
    evaluatedAt: new Date().toISOString(),
    ms: Date.now() - p.started,
    ai: { used: p.aiUsed, model: p.aiUsed ? aiModel(aiProvider()) : "rules" },
    ...(p.jev ? { jev: p.jev } : {}),
  };
}

/** Strip a trailing period so templates can append "." without "Co.." */
function displayName(name: string | undefined): string {
  if (!name) return "";
  return name.trim().replace(/\.+$/, "");
}

function lookalikePunchline(candidate: string, genuine: string, differing: number, name: string): string {
  const short = shortAddress(genuine);
  if (shortAddress(candidate) === short) {
    return `Address poisoning of ${name}: both look like ${short}, but ${differing} middle characters differ — this is not their wallet.`;
  }
  return `Address poisoning: this wallet starts and ends like ${name}'s (${short}) but ${differing} of the characters in between are different. It is not their wallet.`;
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
