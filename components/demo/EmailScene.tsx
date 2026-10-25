"use client";

import type { EmailScene as Scene, FocusRegion } from "@/lib/demo/types";

function focusClass(active: FocusRegion, region: FocusRegion) {
  return `demo-region${active === region ? " demo-region--focus" : ""}`;
}

export function EmailSceneView({ scene, focus }: { scene: Scene; focus: FocusRegion }) {
  return (
    <div className="demo-scene demo-scene--email">
      <div className={focusClass(focus, "email")}>
        <div className="email-chrome">
          <div className="email-chrome-bar">
            <span className="eyebrow">Inbox</span>
            <span className="small muted">AP agent · simulated mailbox</span>
          </div>
          <dl className="email-headers">
            <div>
              <dt>From</dt>
              <dd>{scene.from}</dd>
            </div>
            <div>
              <dt>Subject</dt>
              <dd>{scene.subject}</dd>
            </div>
          </dl>
          <p className="email-body">{scene.bodyPreview}</p>
          <div className={focusClass(focus, "link")}>
            <a className="email-link" href={scene.linkUrl} onClick={(e) => e.preventDefault()}>
              {scene.linkLabel}
            </a>
          </div>
        </div>
      </div>

      <div className={focusClass(focus, "invoice-body")}>
        <article className="invoice-doc" style={{ boxShadow: "none", padding: "18px 16px" }}>
          <header>
            <div className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">Linked invoice page</span>
              <h2 style={{ fontSize: 22 }}>{scene.vendorName}</h2>
            </div>
            <div className="invoice-meta">
              <div>{scene.invoiceNumber}</div>
              <div>Due {scene.dueDate}</div>
            </div>
          </header>
          {scene.siteBadge && (
            <div style={{ marginBottom: 10 }}>
              <span className="tag tag--signal">{scene.siteBadge}</span>
            </div>
          )}
          <table className="invoice-lines">
            <thead>
              <tr>
                <th>Description</th>
                <th>Amt</th>
              </tr>
            </thead>
            <tbody>
              {scene.lines.map((l) => (
                <tr key={l.description}>
                  <td>{l.description}</td>
                  <td className="mono">{(l.qty * l.unitUsdc).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="invoice-total">
            <span className="muted">Total</span>
            <b style={{ fontSize: 18 }}>{scene.amountUsdc.toFixed(2)} USDC</b>
          </div>
          {scene.pageNote && <div className="notice" style={{ marginTop: 12 }}>{scene.pageNote}</div>}
        </article>
      </div>

      <div className={focusClass(focus, "remit")}>
        <div className="invoice-remit">
          <span className="label" style={{ display: "block", marginBottom: 6 }}>
            Remit to
          </span>
          <div>
            <b>{scene.vendorName}</b>
          </div>
          <div className="mono">{scene.address}</div>
          <div className="small muted" style={{ marginTop: 6 }}>
            Ref {scene.reference}
          </div>
        </div>
      </div>
    </div>
  );
}
