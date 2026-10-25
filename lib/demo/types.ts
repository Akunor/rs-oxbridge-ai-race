/** Client-safe shapes for the agent demo cockpit. */

export type DemoScenarioId =
  | "coffee-genuine"
  | "coffee-fake"
  | "coffee-injected"
  | "coffee-new"
  | "invoice-genuine"
  | "invoice-changed"
  | "invoice-email"
  | "invoice-email-scam";

export type DemoKind = "coffee" | "invoice" | "email";
export type DemoExpect = "PAY" | "HOLD" | "BLOCK";

/** Regions the left window can highlight as the agent focuses. */
export type FocusRegion =
  | "storefront"
  | "product"
  | "checkout"
  | "remit"
  | "hidden"
  | "badge"
  | "inbox"
  | "invoice-body"
  | "urgency"
  | "email"
  | "link";

export type ObserveKey =
  | "payeeName"
  | "address"
  | "amountUsdc"
  | "reference"
  | "visibleText"
  | "hiddenText"
  | "siteBadge"
  | "emailFrom"
  | "emailSubject"
  | "emailBody";

export interface ObserveSignal {
  key: ObserveKey;
  label: string;
  value: string;
  /** If true, PayeeGuard ignores this (e.g. site self-serve badge). */
  untrusted?: boolean;
}

export interface JourneyStep {
  id: string;
  caption: string;
  /** Agent focus ring on the site window. */
  focus: FocusRegion;
  /** Signals revealed when this step completes. */
  reveal: ObserveKey[];
  /** When true, this step triggers the live guard check. */
  runGuard?: boolean;
}

export interface CoffeeScene {
  kind: "coffee";
  shopName: string;
  url: string;
  product: { id: string; name: string; artLabel: string; artTone?: string; description: string; priceUsdc: number };
  address: string;
  reference: string;
  scamNotice?: string;
  hiddenText?: string;
  /** Theatrical site badge — not a trust signal. */
  siteBadge?: string;
}

export interface InvoiceScene {
  kind: "invoice";
  vendorName: string;
  url: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  lines: { description: string; qty: number; unitUsdc: number }[];
  amountUsdc: number;
  address: string;
  reference: string;
  urgencyNote?: string;
  siteBadge?: string;
}

export interface EmailScene {
  kind: "email";
  /** Browser chrome URL while on the inbox / linked page. */
  url: string;
  from: string;
  subject: string;
  bodyPreview: string;
  linkLabel: string;
  linkUrl: string;
  vendorName: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  lines: { description: string; qty: number; unitUsdc: number }[];
  amountUsdc: number;
  address: string;
  reference: string;
  pageNote?: string;
  siteBadge?: string;
}

export interface CheckoutPayload {
  payeeName: string;
  address: string;
  amountUsdc: number;
  reference: string;
  messageText: string;
  item: string;
}

export interface DemoScenario {
  id: DemoScenarioId;
  kind: DemoKind;
  title: string;
  blurb: string;
  expect: DemoExpect;
  agentRole: string;
  steps: JourneyStep[];
  signals: ObserveSignal[];
  scene: CoffeeScene | InvoiceScene | EmailScene;
  checkout: CheckoutPayload;
}

export const DEMO_SCENARIO_META: { id: DemoScenarioId; title: string; kind: DemoKind }[] = [
  { id: "coffee-genuine", title: "Coffee · genuine", kind: "coffee" },
  { id: "coffee-fake", title: "Coffee · copycat", kind: "coffee" },
  { id: "coffee-injected", title: "Coffee · injection", kind: "coffee" },
  { id: "coffee-new", title: "Coffee · new vendor", kind: "coffee" },
  { id: "invoice-genuine", title: "Invoice · genuine", kind: "invoice" },
  { id: "invoice-changed", title: "Invoice · changed details", kind: "invoice" },
  { id: "invoice-email", title: "Email · genuine invoice", kind: "email" },
  { id: "invoice-email-scam", title: "Email · invoice scam", kind: "email" },
];
