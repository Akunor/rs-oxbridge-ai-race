import { DemoCockpit } from "@/components/demo/DemoCockpit";

export const dynamic = "force-dynamic";

export default function DemoPage() {
  return (
    <div className="demo-page">
      <header className="demo-page-head">
        <span className="eyebrow">Live product demo</span>
        <div className="demo-page-titles">
          <div className="demo-page-col">
            <h1 className="display demo-page-title">Watch the agent</h1>
            <p className="lead demo-page-desc">
              An autonomous shopping or AP agent moving through a site (visualised).
            </p>
          </div>
          <div className="demo-page-col demo-page-col--gate">
            <h1 className="display demo-page-title">Watch the gate</h1>
            <p className="lead demo-page-desc">
              PayeeGuard evaluating the payment intent before the agent is allowed to sign.
            </p>
          </div>
        </div>
      </header>
      <DemoCockpit />
    </div>
  );
}
