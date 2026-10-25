"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckResultJson } from "@/components/payeeguard/VerdictCard";
import { DEMO_SCENARIO_META, type DemoScenario, type DemoScenarioId, type ObserveKey } from "@/lib/demo/types";
import { CoffeeSceneView } from "./CoffeeScene";
import { GuardPanel } from "./GuardPanel";
import { InvoiceSceneView } from "./InvoiceScene";
import { SiteWindow } from "./SiteWindow";

type Phase = "journey" | "checking" | "verdict" | "paid";

export function DemoCockpit({ initialId = "coffee-genuine" }: { initialId?: DemoScenarioId }) {
  const [scenarioId, setScenarioId] = useState<DemoScenarioId>(initialId);
  const [scenario, setScenario] = useState<DemoScenario | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [revealed, setRevealed] = useState<Set<ObserveKey>>(() => new Set());
  const [phase, setPhase] = useState<Phase>("journey");
  const [result, setResult] = useState<CheckResultJson | null>(null);
  const [revealedCheckCount, setRevealedCheckCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [paidSignature, setPaidSignature] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const playRef = useRef(false);

  const load = useCallback(async (id: DemoScenarioId) => {
    setLoading(true);
    setError(null);
    setPlaying(false);
    playRef.current = false;
    try {
      const res = await fetch(`/api/demo/scenario?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `Failed to load scenario (${res.status})`);
      setScenario(json as DemoScenario);
      setScenarioId(id);
      setStepIndex(0);
      setRevealed(new Set());
      setPhase("journey");
      setResult(null);
      setRevealedCheckCount(0);
      setPaidSignature(null);
    } catch (err) {
      setError((err as Error).message);
      setScenario(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(initialId);
  }, [initialId, load]);

  const applyStepReveals = useCallback((s: DemoScenario, index: number, prev: Set<ObserveKey>) => {
    const next = new Set(prev);
    for (const key of s.steps[index]?.reveal ?? []) next.add(key);
    return next;
  }, []);

  const runGuard = useCallback(async (s: DemoScenario) => {
    setPhase("checking");
    setError(null);
    setResult(null);
    setRevealedCheckCount(0);
    setPaidSignature(null);
    try {
      const res = await fetch("/api/guard/check", {
        method: "POST",
        headers: { "content-type": "application/json", "x-payeeguard-source": "demo" },
        body: JSON.stringify({
          payeeName: s.checkout.payeeName,
          address: s.checkout.address,
          amountUsdc: s.checkout.amountUsdc,
          reference: `PayeeGuard order ${s.checkout.reference}`,
          messageText: s.checkout.messageText,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `Check failed (${res.status})`);
      setResult(json as CheckResultJson);
      setPhase("verdict");
      // Stagger check reveals
      const total = (json as CheckResultJson).checks?.length ?? 0;
      for (let i = 1; i <= total; i++) {
        await new Promise((r) => setTimeout(r, 180));
        setRevealedCheckCount(i);
      }
    } catch (err) {
      setError((err as Error).message);
      setPhase("journey");
    }
  }, []);

  const advance = useCallback(async () => {
    if (!scenario || phase === "checking") return;
    if (phase === "verdict" || phase === "paid") return;

    const step = scenario.steps[stepIndex];
    if (!step) return;

    const nextRevealed = applyStepReveals(scenario, stepIndex, revealed);
    setRevealed(nextRevealed);

    if (step.runGuard) {
      await runGuard(scenario);
      return;
    }

    if (stepIndex < scenario.steps.length - 1) {
      setStepIndex((i) => i + 1);
    }
  }, [scenario, phase, stepIndex, revealed, applyStepReveals, runGuard]);

  const playJourney = useCallback(async () => {
    if (!scenario || playing) return;
    setPlaying(true);
    playRef.current = true;
    // Reset if already finished
    if (phase !== "journey") {
      setStepIndex(0);
      setRevealed(new Set());
      setPhase("journey");
      setResult(null);
      setRevealedCheckCount(0);
      setPaidSignature(null);
      await new Promise((r) => setTimeout(r, 200));
    }

    let index = phase === "journey" ? stepIndex : 0;
    let rev = phase === "journey" ? new Set(revealed) : new Set<ObserveKey>();
    if (phase !== "journey") {
      setStepIndex(0);
      setRevealed(new Set());
    }

    while (playRef.current && scenario) {
      const step = scenario.steps[index];
      if (!step) break;
      rev = applyStepReveals(scenario, index, rev);
      setRevealed(new Set(rev));
      setStepIndex(index);
      await new Promise((r) => setTimeout(r, 900));
      if (!playRef.current) break;
      if (step.runGuard) {
        await runGuard(scenario);
        break;
      }
      if (index >= scenario.steps.length - 1) break;
      index += 1;
    }
    setPlaying(false);
    playRef.current = false;
  }, [scenario, playing, phase, stepIndex, revealed, applyStepReveals, runGuard]);

  const reset = () => {
    playRef.current = false;
    setPlaying(false);
    if (scenario) void load(scenario.id);
  };

  async function pay() {
    if (!scenario || !result || result.verdict !== "PAY") return;
    setPaying(true);
    setError(null);
    try {
      const res = await fetch("/api/guard/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          payeeName: scenario.checkout.payeeName,
          address: scenario.checkout.address,
          amountUsdc: scenario.checkout.amountUsdc,
          reference: `PayeeGuard order ${scenario.checkout.reference}`,
          messageText: scenario.checkout.messageText,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `Payment failed (${res.status})`);
      setPaidSignature(json.signature ?? null);
      setResult(json);
      setPhase("paid");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPaying(false);
    }
  }

  const step = scenario?.steps[Math.min(stepIndex, (scenario?.steps.length ?? 1) - 1)];
  const focus = step?.focus ?? "storefront";
  const stepCaption = scenario
    ? `Step ${stepIndex + 1}/${scenario.steps.length} · ${step?.caption ?? ""}`
    : "Loading…";

  return (
    <div className="demo-cockpit">
      <div className="demo-trust">
        PayeeGuard sits beside the agent, not the merchant. Directory trust is out-of-band. A site badge or self-signed
        wallet cannot authorize payment to a lookalike of a known brand.
      </div>

      <div className="demo-toolbar">
        <div className="demo-tabs" role="tablist" aria-label="Agent scenarios">
          {DEMO_SCENARIO_META.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              className={`demo-tab${scenarioId === m.id ? " demo-tab--active" : ""}`}
              aria-selected={scenarioId === m.id}
              onClick={() => void load(m.id)}
              disabled={loading || playing}
            >
              {m.title}
            </button>
          ))}
        </div>
        <div className="row">
          <button type="button" className="btn-tool" onClick={() => void advance()} disabled={!scenario || loading || playing || phase !== "journey"}>
            Next step
          </button>
          <button type="button" className="btn btn--primary" style={{ height: 36, fontSize: 13, padding: "0 14px" }} onClick={() => void playJourney()} disabled={!scenario || loading || playing}>
            {playing ? "Playing…" : "Play journey"}
          </button>
          <button type="button" className="btn-tool" onClick={reset} disabled={loading}>
            Reset
          </button>
        </div>
      </div>

      {scenario && (
        <p className="small muted" style={{ margin: 0 }}>
          {scenario.blurb}
        </p>
      )}

      <div className="demo-split">
        <div className="demo-split-left">
          {loading || !scenario ? (
            <div className="empty">Loading agent scenario…</div>
          ) : (
            <SiteWindow url={scenario.scene.url} agentRole={scenario.agentRole} stepCaption={stepCaption}>
              {scenario.scene.kind === "coffee" ? (
                <CoffeeSceneView scene={scenario.scene} focus={focus} />
              ) : (
                <InvoiceSceneView scene={scenario.scene} focus={focus} />
              )}
            </SiteWindow>
          )}
        </div>
        <div className="demo-split-right">
          {scenario ? (
            <GuardPanel
              expect={scenario.expect}
              revealed={revealed}
              signals={scenario.signals}
              phase={phase}
              result={result}
              revealedCheckCount={revealedCheckCount}
              error={error}
              paying={paying}
              paidSignature={paidSignature}
              onPay={() => void pay()}
            />
          ) : (
            <div className="empty">{error ?? "Select a scenario"}</div>
          )}
        </div>
      </div>
    </div>
  );
}
