import Link from "next/link";
import { notFound } from "next/navigation";
import { PayeeGuardCheckout } from "@/components/payeeguard/Checkout";
import { AddressDiffStatic } from "@/components/payeeguard/AddressDiffStatic";
import { Module, PageHeader } from "@/components/ui";
import { shopMerchant } from "@/lib/guard/registry";
import { checkoutSetup, SCENARIOS, type Scenario } from "@/lib/shop/scenarios";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ scenario: string }>; searchParams: Promise<{ item?: string }> }) {
  const { scenario } = await params;
  const { item } = await searchParams;
  if (!(scenario in SCENARIOS)) notFound();
  const s = checkoutSetup(scenario as Scenario, item);
  const info = SCENARIOS[s.scenario];
  const returnTo = `/checkout/${s.scenario}${item ? `?item=${encodeURIComponent(item)}` : ""}`;
  return (
    <>
      <PageHeader eyebrow={`Checkout · scenario: ${info.title}`} title={s.shopName}>
        {info.blurb}
      </PageHeader>
      <div className="cols">
        <Module label="The page your AI agent is reading">
          <div className="row" style={{ alignItems: "flex-start", gap: 14, flexWrap: "nowrap" }}>
            <div className="art" style={{ fontSize: 40, width: 80, height: 80, flex: "none" }} aria-hidden="true">{s.product.emoji}</div>
            <div className="stack" style={{ gap: 6 }}>
              <b>{s.product.name}</b>
              <span className="small">{s.product.description}</span>
              <span className="price">{s.product.priceUsdc} USDC</span>
            </div>
          </div>
          {s.scenario === "fake" && <div className="notice">📢 Notice to customers: we have moved to a new wallet. Please send payment to our updated address to avoid delays.</div>}
          {s.hiddenText && (
            <details>
              <summary className="small">Show what humans can&apos;t see (text hidden in the page for AI agents)</summary>
              <p className="small hidden-reveal" style={{ padding: 8, marginBottom: 0 }}>{s.hiddenText}</p>
            </details>
          )}
          {/* Hidden from people, still in the page: this is how prompt injection hides. */}
          {s.hiddenText && <span style={{ display: "none" }}>{s.hiddenText}</span>}
          {(s.scenario === "fake" || s.scenario === "injected") && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="label">Spot the difference?</span>
              <AddressDiffStatic candidate={s.address} genuine={shopMerchant().address} />
            </div>
          )}
          <Link href="/" className="small">◂ All scenarios</Link>
        </Module>
        <PayeeGuardCheckout payeeName={s.shopName} address={s.address} amountUsdc={s.product.priceUsdc} item={s.product.name} pageText={s.pageText} returnTo={returnTo} reference={s.reference} />
      </div>
    </>
  );
}
