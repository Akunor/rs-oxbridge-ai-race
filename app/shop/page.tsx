import Link from "next/link";
import { Module, PageHeader } from "@/components/ui";
import { shopMerchant } from "@/lib/guard/registry";
import { PRODUCTS } from "@/lib/shop/scenarios";

export const dynamic = "force-dynamic";

export default function ShopPage() {
  const shop = shopMerchant();
  return (
    <>
      <PageHeader eyebrow="Demo shop · protected by PayeeGuard" title={shop.name}>
        A small Saigon coffee roaster that sells in devnet USDC. Your AI shopping agent buys for you, and the PayeeGuard plugin checks the payee at checkout.
      </PageHeader>
      <div className="shop-banner">
        <span className="stack" style={{ gap: 4 }}>
          <b>☕ {shop.name}</b>
          <span className="small">Verified payee · wallet <span className="mono">{shop.address}</span></span>
        </span>
        <span className="tag tag--ok">🛡 PayeeGuard verified</span>
      </div>
      <div className="product-grid">
        {PRODUCTS.map((p) => (
          <div key={p.id} className="product">
            <div className="art" aria-hidden="true">{p.emoji}</div>
            <b>{p.name}</b>
            <p>{p.description}</p>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="price">{p.priceUsdc} USDC</span>
              <Link className="btn-tool" href={`/checkout/genuine?item=${p.id}`}>Buy ▸</Link>
            </div>
          </div>
        ))}
      </div>
      <Module label="Other checkouts to try">
        <div className="row">
          <Link className="btn-tool" href="/fake-shop">Copycat shop ▸</Link>
          <Link className="btn-tool" href="/checkout/injected?item=phin">Page with hidden AI instructions ▸</Link>
          <Link className="btn-tool" href="/checkout/new">New, unverified shop ▸</Link>
        </div>
      </Module>
    </>
  );
}
