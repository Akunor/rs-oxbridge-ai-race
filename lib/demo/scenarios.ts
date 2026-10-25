import "server-only";
import { invoiceSetup } from "@/lib/invoice/cases";
import { checkoutSetup } from "@/lib/shop/scenarios";
import {
  DEMO_SCENARIO_META,
  type DemoScenario,
  type DemoScenarioId,
  type JourneyStep,
  type ObserveSignal,
} from "./types";

export { DEMO_SCENARIO_META };

const COFFEE_STEPS = (opts: { withHidden?: boolean; withScam?: boolean }): JourneyStep[] => [
  {
    id: "land",
    caption: "Agent opens the merchant site",
    focus: "storefront",
    reveal: opts.withScam ? ["payeeName", "siteBadge"] : ["payeeName", "siteBadge"],
  },
  {
    id: "pick",
    caption: "Agent selects a product on behalf of the user",
    focus: "product",
    reveal: ["amountUsdc"],
  },
  {
    id: "checkout",
    caption: "Agent reaches checkout and reads payment details",
    focus: "checkout",
    reveal: ["reference", "visibleText"],
  },
  {
    id: "remit",
    caption: "Agent reads the remit-to wallet address",
    focus: "remit",
    reveal: ["address"],
  },
  ...(opts.withHidden
    ? [
        {
          id: "hidden",
          caption: "Agent also reads hidden page text aimed at AI agents",
          focus: "hidden" as const,
          reveal: ["hiddenText" as const],
        },
      ]
    : []),
  {
    id: "guard",
    caption: "Before signing, the agent asks PayeeGuard",
    focus: "checkout",
    reveal: [],
    runGuard: true,
  },
];

const INVOICE_STEPS = (opts: { withUrgency?: boolean }): JourneyStep[] => [
  {
    id: "inbox",
    caption: "AP agent opens the accounts-payable inbox",
    focus: "inbox",
    reveal: ["payeeName", "siteBadge"],
  },
  {
    id: "body",
    caption: "Agent reads invoice line items and totals",
    focus: "invoice-body",
    reveal: ["amountUsdc", "reference", "visibleText"],
  },
  {
    id: "remit",
    caption: "Agent reads the remittance wallet",
    focus: "remit",
    reveal: ["address"],
  },
  ...(opts.withUrgency
    ? [
        {
          id: "urgency",
          caption: "Agent reads urgency / changed-details copy on the invoice",
          focus: "urgency" as const,
          reveal: [],
        },
      ]
    : []),
  {
    id: "guard",
    caption: "Before signing, the agent asks PayeeGuard",
    focus: "invoice-body",
    reveal: [],
    runGuard: true,
  },
];

function short(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function buildDemoScenario(id: DemoScenarioId): DemoScenario {
  if (id.startsWith("coffee-")) {
    const scenario = id === "coffee-genuine" ? "genuine" : id === "coffee-fake" ? "fake" : "injected";
    const setup = checkoutSetup(scenario, "phin");
    const expect = scenario === "genuine" ? "PAY" : "BLOCK";
    const withHidden = scenario === "injected";
    const withScam = scenario === "fake";

    const signals: ObserveSignal[] = [
      { key: "payeeName", label: "Payee name", value: setup.shopName },
      {
        key: "siteBadge",
        label: "Site “verified” badge",
        value: scenario === "fake" ? "PayeeGuard verified (on-site claim)" : "PayeeGuard verified (on-site claim)",
        untrusted: true,
      },
      { key: "amountUsdc", label: "Amount", value: `${setup.product.priceUsdc} USDC` },
      { key: "reference", label: "Order reference", value: setup.reference },
      { key: "visibleText", label: "Visible page text", value: setup.visibleText },
      { key: "address", label: "Remit-to address", value: setup.address },
    ];
    if (setup.hiddenText) {
      signals.push({ key: "hiddenText", label: "Hidden agent-only text", value: setup.hiddenText });
    }

    return {
      id,
      kind: "coffee",
      title: scenario === "genuine" ? "Coffee · genuine" : scenario === "fake" ? "Coffee · copycat" : "Coffee · injection",
      blurb:
        scenario === "genuine"
          ? "Shopping agent buys from the real Saigon Coffee wallet."
          : scenario === "fake"
            ? "Copycat site shows a lookalike wallet and a fake verified badge."
            : "Real shop page, but hidden text steers the agent to a poisoned address.",
      expect,
      agentRole: "Autonomous shopping agent",
      steps: COFFEE_STEPS({ withHidden, withScam }),
      signals,
      scene: {
        kind: "coffee",
        shopName: setup.shopName,
        url: scenario === "fake" ? "https://saigon-coffee.example/checkout" : "https://shop.saigon-coffee.example/checkout",
        product: setup.product,
        address: setup.address,
        reference: setup.reference,
        scamNotice: withScam
          ? `We have moved to a new wallet. Pay ${short(setup.address)} to avoid delays.`
          : undefined,
        hiddenText: setup.hiddenText,
        siteBadge: "Verified payee",
      },
      checkout: {
        payeeName: setup.shopName,
        address: setup.address,
        amountUsdc: setup.product.priceUsdc,
        reference: setup.reference,
        messageText: setup.pageText,
        item: setup.product.name,
      },
    };
  }

  const caseId = id === "invoice-genuine" ? "genuine" : "changed-details";
  const setup = invoiceSetup(caseId);
  const withUrgency = caseId === "changed-details";

  const signals: ObserveSignal[] = [
    { key: "payeeName", label: "Vendor name", value: setup.vendorName },
    { key: "siteBadge", label: "Portal “trusted vendor” badge", value: "Trusted vendor (portal claim)", untrusted: true },
    { key: "amountUsdc", label: "Amount due", value: `${setup.amountUsdc} USDC` },
    { key: "reference", label: "Invoice reference", value: setup.reference },
    { key: "visibleText", label: "Invoice text", value: setup.pageText },
    { key: "address", label: "Remit-to address", value: setup.address },
  ];

  return {
    id,
    kind: "invoice",
    title: caseId === "genuine" ? "Invoice · genuine" : "Invoice · changed details",
    blurb:
      caseId === "genuine"
        ? "AP agent pays a known vendor’s registered wallet."
        : "Same vendor name, urgent new-wallet copy, lookalike remittance address.",
    expect: setup.expect,
    agentRole: "Autonomous accounts-payable agent",
    steps: INVOICE_STEPS({ withUrgency }),
    signals,
    scene: {
      kind: "invoice",
      vendorName: setup.vendorName,
      url: "https://ap.oxbridge-ops.example/invoices/" + setup.invoiceNumber,
      invoiceNumber: setup.invoiceNumber,
      issueDate: setup.issueDate,
      dueDate: setup.dueDate,
      lines: setup.lines,
      amountUsdc: setup.amountUsdc,
      address: setup.address,
      reference: setup.reference,
      urgencyNote: setup.urgencyNote,
      siteBadge: "Trusted vendor",
    },
    checkout: {
      payeeName: setup.vendorName,
      address: setup.address,
      amountUsdc: setup.amountUsdc,
      reference: setup.reference,
      messageText: setup.pageText,
      item: `Invoice ${setup.invoiceNumber}`,
    },
  };
}

export function isDemoScenarioId(value: string): value is DemoScenarioId {
  return DEMO_SCENARIO_META.some((m) => m.id === value);
}
