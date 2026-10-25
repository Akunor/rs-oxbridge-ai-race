import { DemoCockpit } from "@/components/demo/DemoCockpit";

export const dynamic = "force-dynamic";

export default function DemoPage() {
  return (
    <div className="demo-page">
      <header className="stack" style={{ gap: 8, marginBottom: 4 }}>
        <span className="eyebrow">Live product demo</span>
        <h1 className="display" style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>
          Watch the agent. Watch the gate.
        </h1>
        <p className="lead" style={{ maxWidth: 640 }}>
          Left: an autonomous shopping or AP agent moving through a site (visualized for humans). Right: PayeeGuard
          evaluating the payment intent before the agent is allowed to sign.
        </p>
      </header>
      <DemoCockpit />
    </div>
  );
}
