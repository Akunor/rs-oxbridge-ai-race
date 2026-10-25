// Shared shapes for PayeeGuard. Safe to import from browser code (no secrets, no Node APIs).

export type Verdict = "PAY" | "HOLD" | "BLOCK";
export type CheckStatus = "pass" | "warn" | "fail" | "skip";

export interface PaymentRequest {
  /** Who the payer thinks they are paying, e.g. "Saigon Coffee Co.". */
  payeeName?: string;
  /** The Solana address the money would go to. */
  address: string;
  amountUsdc: number;
  /** Order id / invoice number. Used as the on-chain memo when paid. */
  reference?: string;
  /** Any text the agent read alongside the request: invoice, email, product page, chat message. */
  messageText?: string;
  /** Where the request came from (shown on receipts). */
  source?: "checkout" | "api" | "race" | "plugin" | "demo";
  /** Signed "this merchant proved wallet ownership" tokens the payer's browser holds. */
  attestations?: string[];
}

export interface GuardCheck {
  id:
    | "address_format"
    | "lookalike"
    | "payee_match"
    | "confirmation_of_payee"
    | "wallet_history"
    | "injection"
    | "amount"
    | "soft_risk";
  label: string;
  status: CheckStatus;
  /** Risk points this check added (0 when it passed). */
  points: number;
  detail: string;
  evidence?: Record<string, unknown>;
}

/** Optional Jev System-1 soft probabilities surfaced in the inspector. */
export interface JevSoftView {
  used: boolean;
  diversionProb?: number;
  fraudScore?: number;
  pattern?: string;
  patternConfidence?: number;
  ms?: number;
}

export interface MerchantView {
  name: string;
  address: string;
  verified: boolean;
  verifiedVia?: "onboarding" | "wallet-signature";
}

export interface GuardResult {
  verdict: Verdict;
  score: number;
  /** "enforce" blocks bad payments; "advisory" only reports (used for the race verifier's test payments). */
  mode: "enforce" | "advisory";
  headline: string;
  explanation: string;
  checks: GuardCheck[];
  request: Omit<PaymentRequest, "attestations">;
  /** The verified merchant the request claims to be (or looks like), if any. */
  matchedMerchant?: MerchantView;
  evaluatedAt: string;
  ms: number;
  ai: { used: boolean; model: string };
  /** Soft System-1 probabilities when JEV_API_KEY is set; never overrides hard BLOCK. */
  jev?: JevSoftView;
}

export interface Receipt {
  v: 1;
  kind: "decision" | "payment";
  issuedAt: string;
  verdict: Verdict;
  score: number;
  mode: "enforce" | "advisory";
  headline: string;
  request: Omit<PaymentRequest, "attestations">;
  checks: { id: string; status: CheckStatus; points: number; detail: string }[];
  payment?: { signature: string; network: "solana-devnet"; memo?: string };
}

export interface SignedReceipt {
  hash: string;
  receipt: Receipt;
  url: string;
}

export const THRESHOLDS = { hold: 30, block: 60 } as const;

export function verdictFor(score: number): Verdict {
  if (score >= THRESHOLDS.block) return "BLOCK";
  if (score >= THRESHOLDS.hold) return "HOLD";
  return "PAY";
}
