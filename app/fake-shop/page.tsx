import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { shopMerchant } from "@/lib/guard/registry";
import { lookalikeAddress, PRODUCTS } from "@/lib/shop/scenarios";

export const dynamic = "force-dynamic";

// A copycat of the demo shop: same name, same products, a poisoned wallet address.
export default function FakeShopPage() {
  const shop = shopMerchant();
  const fake = lookalikeAddress();
  return (
    <>
      <PageHeader eyebrow="⚠ Demo: this is the scammer's copy of the shop" title={shop.name}>
        Looks identical. The wallet starts and ends with the same characters as the real one ({fake.slice(0, 4)}…{fake.slice(-4)}), so people and agents that check
        the ends are fooled.
      </PageHeader>
      <div className="shop-banner shop-banner--fake">
        <span className="stack" style={{ gap: 4 }}>
          <b>☕ {shop.name}</b>
          <span className="small">📢 We have moved to a new wallet! Pay <span className="mono">{fake}</span> to avoid delays.</span>
        </span>
      </div>
      <div className="product-grid">
        {PRODUCTS.map((p) => (
          <div key={p.id} className="product">
            <div className="art" aria-hidden="true">{p.emoji}</div>
            <b>{p.name}</b>
            <p>{p.description}</p>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="price">{p.priceUsdc} USDC</span>
              <Link className="btn-tool" href={`/checkout/fake?item=${p.id}`}>Buy ▸</Link>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
