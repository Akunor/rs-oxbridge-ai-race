import Link from "next/link";
import { Module, PageHeader } from "@/components/ui";
import { kvPersistent } from "@/lib/guard/kv";
import { recentReceipts } from "@/lib/guard/receipt";

export const dynamic = "force-dynamic";

const TAG = { PAY: "tag--ok", HOLD: "tag--warn", BLOCK: "tag--fault" } as const;

export default async function ReceiptsPage() {
  const list = await recentReceipts();
  return (
    <>
      <PageHeader eyebrow="Audit trail" title="Receipts">
        Every decision PayeeGuard makes, newest first. Each receipt&apos;s id is a SHA-256 fingerprint of its contents, so any later edit shows.
      </PageHeader>
      <Module label="Latest decisions" right={`${list.length} shown`}>
        {list.length === 0 ? (
          <div className="empty">No decisions yet. Try a checkout from the <Link href="/">home page</Link>.</div>
        ) : (
          <table className="table">
            <thead><tr><th>When</th><th>Verdict</th><th>Payee</th><th>Amount</th><th>Source</th><th>Receipt</th></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.hash}>
                  <td className="mono">{r.issuedAt.slice(11, 19)}</td>
                  <td><span className={`tag ${TAG[r.verdict]}`}>{r.verdict}</span>{r.signature ? " · paid" : ""}</td>
                  <td>{r.payee.length > 30 ? `${r.payee.slice(0, 4)}…${r.payee.slice(-4)}` : r.payee}</td>
                  <td className="mono">{r.amountUsdc}</td>
                  <td>{r.source ?? "api"}</td>
                  <td><Link className="mono" href={`/receipt/${r.hash}`}>{r.hash.slice(0, 10)}…</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!kvPersistent && <span className="small muted">Shared storage isn&apos;t connected, so this list only shows decisions handled by this server instance. Receipt links always work on their own.</span>}
      </Module>
    </>
  );
}
