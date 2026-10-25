"use client";

import type { FocusRegion, InvoiceScene as Scene } from "@/lib/demo/types";

function focusClass(active: FocusRegion, region: FocusRegion) {
  return `demo-region${active === region ? " demo-region--focus" : ""}`;
}

export function InvoiceSceneView({ scene, focus }: { scene: Scene; focus: FocusRegion }) {
  return (
    <div className="demo-scene demo-scene--invoice">
      <div className={focusClass(focus, "inbox")}>
        <div className="demo-panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span>
              <span className="label" style={{ display: "block" }}>
                AP inbox
              </span>
              <b>{scene.vendorName}</b>
            </span>
            {scene.siteBadge && <span className="tag tag--signal">{scene.siteBadge}</span>}
          </div>
        </div>
      </div>

      <div className={focusClass(focus, "invoice-body")}>
        <article className="invoice-doc" style={{ boxShadow: "none", padding: "18px 16px" }}>
          <header>
            <div className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">Tax invoice</span>
              <h2 style={{ fontSize: 22 }}>{scene.vendorName}</h2>
            </div>
            <div className="invoice-meta">
              <div>{scene.invoiceNumber}</div>
              <div>Due {scene.dueDate}</div>
            </div>
          </header>
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
        </article>
      </div>

      {scene.urgencyNote && (
        <div className={focusClass(focus, "urgency")}>
          <div className="notice">{scene.urgencyNote}</div>
        </div>
      )}

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
