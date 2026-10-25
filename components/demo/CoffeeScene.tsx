"use client";

import type { CoffeeScene as Scene, FocusRegion } from "@/lib/demo/types";

function focusClass(active: FocusRegion, region: FocusRegion) {
  return `demo-region${active === region ? " demo-region--focus" : ""}`;
}

export function CoffeeSceneView({ scene, focus }: { scene: Scene; focus: FocusRegion }) {
  return (
    <div className="demo-scene demo-scene--coffee">
      <div className={focusClass(focus, "storefront")}>
        <div className="shop-banner" style={{ margin: 0 }}>
          <span className="stack" style={{ gap: 4 }}>
            <b>{scene.shopName}</b>
            <span className="small">Devnet storefront · agent shopping on your behalf</span>
          </span>
          {scene.siteBadge && (
            <span className={`tag tag--ok${focus === "badge" ? " demo-region--focus" : ""}`} title="Untrusted site claim">
              {scene.siteBadge}
            </span>
          )}
        </div>
      </div>

      <div className={focusClass(focus, "product")}>
        <div className="product" style={{ boxShadow: "none" }}>
          <div className={`art ${scene.product.artTone ?? ""}`} data-label={scene.product.artLabel} aria-hidden="true" />
          <b>{scene.product.name}</b>
          <p>{scene.product.description}</p>
          <span className="price">{scene.product.priceUsdc} USDC</span>
        </div>
      </div>

      <div className={focusClass(focus, "checkout")}>
        <div className="demo-panel">
          <span className="label">Checkout</span>
          <dl className="kv">
            <dt>Item</dt>
            <dd>{scene.product.name}</dd>
            <dt>Order</dt>
            <dd className="mono">{scene.reference}</dd>
            <dt>Amount</dt>
            <dd className="mono">{scene.product.priceUsdc} USDC</dd>
          </dl>
          {scene.scamNotice && <div className="notice">{scene.scamNotice}</div>}
        </div>
      </div>

      <div className={focusClass(focus, "remit")}>
        <div className="demo-panel">
          <span className="label">Remit to</span>
          <div className="mono">{scene.address}</div>
        </div>
      </div>

      {scene.hiddenText && (
        <div className={focusClass(focus, "hidden")}>
          <div className="demo-panel demo-panel--danger">
            <span className="label">Hidden from humans · visible to the agent</span>
            <p className="small hidden-reveal" style={{ margin: 0, padding: 8 }}>
              {scene.hiddenText}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
