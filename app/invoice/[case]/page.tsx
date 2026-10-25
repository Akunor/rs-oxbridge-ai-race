import Link from "next/link";
import { notFound } from "next/navigation";
import { PayeeGuardCheckout } from "@/components/payeeguard/Checkout";
import { AddressDiffStatic } from "@/components/payeeguard/AddressDiffStatic";
import { PageHeader } from "@/components/ui";
import { vendorMerchant } from "@/lib/guard/registry";
import { INVOICE_CASES, invoiceSetup, type InvoiceCase } from "@/lib/invoice/cases";

export const dynamic = "force-dynamic";

export default async function InvoiceCasePage({ params }: { params: Promise<{ case: string }> }) {
  const { case: caseParam } = await params;
  if (!(caseParam in INVOICE_CASES)) notFound();
  const setup = invoiceSetup(caseParam as InvoiceCase);
  const vendor = vendorMerchant();
  const returnTo = `/invoice/${setup.caseId}`;

  return (
    <>
      <PageHeader eyebrow={`Invoice · ${setup.title}`} title={setup.invoiceNumber}>
        {setup.blurb}
      </PageHeader>

      <div className="cols">
        <article className="invoice-doc">
          <header>
            <div className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">Tax invoice</span>
              <h2>{setup.vendorName}</h2>
              <span className="small muted">Bill to · Oxbridge Ops Ltd · Accounts payable</span>
            </div>
            <div className="invoice-meta">
              <div>Invoice {setup.invoiceNumber}</div>
              <div>Issued {setup.issueDate}</div>
              <div>Due {setup.dueDate}</div>
            </div>
          </header>

          <table className="invoice-lines">
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {setup.lines.map((l) => (
                <tr key={l.description}>
                  <td>{l.description}</td>
                  <td>{l.qty}</td>
                  <td className="mono">{(l.qty * l.unitUsdc).toFixed(2)} USDC</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="invoice-total">
            <span className="muted">Total due</span>
            <b>{setup.amountUsdc.toFixed(2)} USDC</b>
          </div>

          {setup.urgencyNote && <div className="notice">{setup.urgencyNote}</div>}

          <div className="invoice-remit">
            <span className="label" style={{ display: "block", marginBottom: 6 }}>
              Remit to
            </span>
            <div>
              <b>{setup.vendorName}</b>
            </div>
            <div className="mono">{setup.address}</div>
          </div>

          {setup.caseId === "changed-details" && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="label">Registered wallet vs remittance address</span>
              <AddressDiffStatic candidate={setup.address} genuine={vendor.address} />
            </div>
          )}

          <Link href="/invoice" className="small">
            ← Back to inbox
          </Link>
        </article>

        <PayeeGuardCheckout
          payeeName={setup.vendorName}
          address={setup.address}
          amountUsdc={setup.amountUsdc}
          item={`Invoice ${setup.invoiceNumber}`}
          pageText={setup.pageText}
          returnTo={returnTo}
          reference={setup.reference}
        />
      </div>
    </>
  );
}
