import Link from "next/link";
import { Module, PageHeader } from "@/components/ui";
import { shopMerchant } from "@/lib/guard/registry";
import { PRODUCTS } from "@/lib/shop/scenarios";

export const dynamic = "force-dynamic";

export default function ShopPage() {
  const shop = shopMerchant();
  return (
    <>
      <PageHeader eyebrow="Demo · consumer checkout" title={shop.name}>
        A Saigon coffee roaster that sells in devnet USDC. Your AI shopping agent buys for you — PayeeGuard checks the
        payee at checkout before anything moves.
      </PageHeader>
      <div className="shop-banner">
        <span className="stack" style={{ gap: 4 }}>
          <b>{shop.name}</b>
          <span className="small">
            Verified payee · wallet <span className="mono">{shop.address}</span>
          </span>
        </span>
        <span className="tag tag--ok">PayeeGuard verified</span>
      </div>
      <div className="product-grid">
        {PRODUCTS.map((p) => (
          <div key={p.id} className="product">
            <div className={`art ${p.artTone ?? ""}`} data-label={p.artLabel} aria-hidden="true" />
            <b>{p.name}</b>
            <p>{p.description}</p>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="price">{p.priceUsdc} USDC</span>
              <Link className="btn-tool" href={`/checkout/genuine?item=${p.id}`}>
                Buy
              </Link>
            </div>
          </div>
        ))}
      </div>
      <Module label="Other attacks to try">
        <div className="row">
          <Link className="btn-tool" href="/fake-shop">
            Copycat shop
          </Link>
          <Link className="btn-tool" href="/checkout/injected?item=phin">
            Hidden AI instructions
          </Link>
          <Link className="btn-tool" href="/checkout/new">
            New, unverified shop
          </Link>
        </div>
      </Module>
    </>
  );
}
