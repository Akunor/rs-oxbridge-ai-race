import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { vendorMerchant } from "@/lib/guard/registry";
import { INVOICE_CASES, type InvoiceCase } from "@/lib/invoice/cases";

export const dynamic = "force-dynamic";

const TAG = { PAY: "tag--ok", BLOCK: "tag--fault" } as const;

export default function InvoiceInboxPage() {
  const vendor = vendorMerchant();
  const cases = Object.keys(INVOICE_CASES) as InvoiceCase[];
  return (
    <>
      <PageHeader eyebrow="Demo · accounts payable" title="Incoming invoices">
        Your AI agent pays vendor invoices. Open a genuine remittance, then the changed-details scam — PayeeGuard runs
        before any USDC leaves the wallet.
      </PageHeader>

      <div className="module">
        <div className="module-strip">
          <span>AP inbox</span>
          <span>Vendor directory · {vendor.name}</span>
        </div>
        <div className="module-body">
          <div className="invoice-list">
            {cases.map((id) => {
              const c = INVOICE_CASES[id];
              return (
                <Link key={id} href={`/invoice/${id}`} className="invoice-row">
                  <span>
                    <b>{c.title}</b>
                    <span className="small muted">{c.blurb}</span>
                  </span>
                  <span className={`tag ${TAG[c.expect]}`}>Expect {c.expect}</span>
                  <span className="go" style={{ fontWeight: 700, color: "var(--signal-ink)" }}>
                    Open →
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
