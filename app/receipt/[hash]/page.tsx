import Link from "next/link";
import { ExplorerLink, Module, PageHeader } from "@/components/ui";
import { loadReceipt } from "@/lib/guard/receipt";

export const dynamic = "force-dynamic";

const TAG = { PAY: "tag--ok", HOLD: "tag--warn", BLOCK: "tag--fault" } as const;
const ICON = { pass: "✓", warn: "!", fail: "✕", skip: "–" } as const;

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ hash: string }>; searchParams: Promise<{ d?: string }> }) {
  const { hash } = await params;
  const { d } = await searchParams;
  const loaded = /^[0-9a-f]{64}$/.test(hash) ? await loadReceipt(hash, d) : null;
  if (!loaded) {
    return (
      <>
        <PageHeader eyebrow="PayeeGuard receipt" title="Receipt not found" />
        <div className="empty">This receipt isn&apos;t stored here. Open it from the full link PayeeGuard gave you (the link carries the receipt).</div>
      </>
    );
  }
  const { receipt: r, intact } = loaded;
  return (
    <>
      <PageHeader eyebrow={`PayeeGuard receipt · ${r.kind}`} title={r.headline} />
      <div className={`notice ${intact ? "notice--ok" : "notice--fault"}`}>
        {intact
          ? "Intact. This receipt's SHA-256 fingerprint matches its contents, so nothing has been changed since PayeeGuard issued it."
          : "Tampered. The contents no longer match the fingerprint. Someone edited this receipt after it was issued."}
      </div>
      <div className="cols">
        <Module label="Decision" right={<span className={`tag ${TAG[r.verdict]}`}>{r.verdict}</span>}>
          <dl className="kv">
            <dt>Issued</dt><dd>{r.issuedAt}</dd>
            <dt>Risk score</dt><dd>{r.score}/100</dd>
            <dt>Mode</dt><dd>{r.mode === "advisory" ? "advisory (reported, not enforced)" : "enforced"}</dd>
            <dt>Payee</dt><dd>{r.request.payeeName ?? "(not given)"}</dd>
            <dt>Wallet</dt><dd>{r.request.address}</dd>
            <dt>Amount</dt><dd>{r.request.amountUsdc} USDC</dd>
            {r.request.reference && (<><dt>Reference</dt><dd>{r.request.reference}</dd></>)}
            <dt>Source</dt><dd>{r.request.source ?? "api"}</dd>
            {r.payment && (<><dt>Payment</dt><dd><ExplorerLink signature={r.payment.signature} /></dd></>)}
            <dt>Fingerprint</dt><dd>{hash}</dd>
          </dl>
        </Module>
        <Module label="Checks">
          <ul className="checks">
            {r.checks.map((c) => (
              <li key={c.id}>
                <span className={`ic ic--${c.status}`}>{ICON[c.status]}</span>
                <span><b>{c.id.replace(/_/g, " ")}</b><span className="muted">{c.detail}</span></span>
                <span className="pts">{c.points ? `+${c.points}` : ""}</span>
              </li>
            ))}
          </ul>
        </Module>
      </div>
      <Link href="/receipts" className="small">◂ All receipts</Link>
    </>
  );
}
