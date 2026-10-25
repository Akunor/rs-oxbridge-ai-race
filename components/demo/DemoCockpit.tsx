"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadAttestations } from "@/components/payeeguard/attestations";
import type { CheckResultJson } from "@/components/payeeguard/VerdictCard";
import { DEMO_SCENARIO_META, type DemoScenario, type DemoScenarioId, type ObserveKey } from "@/lib/demo/types";
import { CoffeeSceneView } from "./CoffeeScene";
import { EmailSceneView } from "./EmailScene";
import { GuardPanel } from "./GuardPanel";
import { InvoiceSceneView } from "./InvoiceScene";
import { SiteWindow } from "./SiteWindow";

type Phase = "journey" | "checking" | "verdict" | "paid";

function parseInitialId(fallback: DemoScenarioId): DemoScenarioId {
  if (typeof window === "undefined") return fallback;
  const q = new URLSearchParams(window.location.search).get("scenario");
  if (q && DEMO_SCENARIO_META.some((m) => m.id === q)) return q as DemoScenarioId;
  return fallback;
}

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
  const [tally, setTally] = useState({ checked: 0, blocked: 0, savedUsdc: 0 });
  const playRef = useRef(false);
  const autoPayRef = useRef(false);
  const tallyOnceRef = useRef<string | null>(null);

  const load = useCallback(async (id: DemoScenarioId) => {
    setLoading(true);
    setError(null);
    setPlaying(false);
    playRef.current = false;
    autoPayRef.current = false;
    tallyOnceRef.current = null;
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
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("scenario", id);
        window.history.replaceState({}, "", url.toString());
      }
    } catch (err) {
      setError((err as Error).message);
      setScenario(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(parseInitialId(initialId));
  }, [initialId, load]);

  const applyStepReveals = useCallback((s: DemoScenario, index: number, prev: Set<ObserveKey>) => {
    const next = new Set(prev);
    for (const key of s.steps[index]?.reveal ?? []) next.add(key);
    return next;
  }, []);

  const recordTally = useCallback((checked: CheckResultJson, amountUsdc: number) => {
    const key = `${checked.evaluatedAt}:${checked.verdict}:${checked.score}`;
    if (tallyOnceRef.current === key) return;
    tallyOnceRef.current = key;
    setTally((t) => ({
      checked: t.checked + 1,
      blocked: t.blocked + (checked.verdict === "BLOCK" ? 1 : 0),
      savedUsdc: Number((t.savedUsdc + (checked.verdict === "BLOCK" ? amountUsdc : 0)).toFixed(2)),
    }));
  }, []);

  const pay = useCallback(async (s: DemoScenario) => {
    if (autoPayRef.current) return;
    autoPayRef.current = true;
    setPaying(true);
    setError(null);
    try {
      const res = await fetch("/api/guard/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          payeeName: s.checkout.payeeName,
          address: s.checkout.address,
          amountUsdc: s.checkout.amountUsdc,
          reference: `PayeeGuard order ${s.checkout.reference}`,
          messageText: s.checkout.messageText,
          attestations: loadAttestations(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `Payment failed (${res.status})`);
      setPaidSignature(json.signature ?? null);
      setResult(json);
      setPhase("paid");
    } catch (err) {
      setError((err as Error).message);
      autoPayRef.current = false;
    } finally {
      setPaying(false);
    }
  }, []);

  const runGuard = useCallback(
    async (s: DemoScenario, opts?: { withAttestations?: boolean }) => {
      setPhase("checking");
      setError(null);
      setResult(null);
      setRevealedCheckCount(0);
      setPaidSignature(null);
      autoPayRef.current = false;
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
            ...(opts?.withAttestations ? { attestations: loadAttestations() } : {}),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message ?? `Check failed (${res.status})`);
        const checked = json as CheckResultJson;
        setResult(checked);
        setPhase("verdict");
        recordTally(checked, s.checkout.amountUsdc);
        const total = checked.checks?.length ?? 0;
        for (let i = 1; i <= total; i++) {
          await new Promise((r) => setTimeout(r, 160));
          setRevealedCheckCount(i);
        }
        if (checked.verdict === "PAY") {
          await pay(s);
        }
      } catch (err) {
        setError((err as Error).message);
        setPhase("journey");
      }
    },
    [pay, recordTally],
  );

  const advance = useCallback(async () => {
    if (!scenario || phase === "checking" || phase === "paid") return;
    if (phase === "verdict") return;

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
    if (phase !== "journey") {
      setStepIndex(0);
      setRevealed(new Set());
      setPhase("journey");
      setResult(null);
      setRevealedCheckCount(0);
      setPaidSignature(null);
      autoPayRef.current = false;
      tallyOnceRef.current = null;
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

  const step = scenario?.steps[Math.min(stepIndex, (scenario?.steps.length ?? 1) - 1)];
  const focus = step?.focus ?? "storefront";
  const stepCaption = scenario
    ? `Step ${stepIndex + 1}/${scenario.steps.length} · ${step?.caption ?? ""}`
    : "Loading…";
  const blocked = result?.verdict === "BLOCK" && (phase === "verdict" || phase === "paid");
  const verifyHref =
    scenario?.id === "coffee-new" && result?.verdict === "HOLD"
      ? `/merchant/verify?name=${encodeURIComponent(scenario.checkout.payeeName)}&address=${encodeURIComponent(scenario.checkout.address)}&return=${encodeURIComponent(`/demo?scenario=coffee-new&fromVerify=1`)}`
      : null;

  // After returning from /merchant/verify, auto re-check with attestations once.
  useEffect(() => {
    if (!scenario || scenario.id !== "coffee-new" || loading) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") !== "1" && !loadAttestations().length) return;
    // Only auto-recheck if we aren't mid-journey and have a prior HOLD or empty result after return
    if (phase === "checking" || phase === "paid" || playing) return;
    if (result?.verdict === "PAY") return;
    const atts = loadAttestations();
    if (!atts.length) return;
    // Avoid infinite loop: only when returning from verify (query) or user clicked recheck
    if (params.get("fromVerify") === "1") {
      const url = new URL(window.location.href);
      url.searchParams.delete("fromVerify");
      window.history.replaceState({}, "", url.toString());
      void runGuard(scenario, { withAttestations: true });
    }
  }, [scenario, loading, phase, playing, result, runGuard]);

  return (
    <div className={`demo-cockpit${blocked ? " demo-cockpit--blocked" : ""}`}>
      <div className="demo-tally" aria-live="polite">
        <span>
          <b>{tally.checked}</b> payments checked
        </span>
        <span>
          <b>{tally.blocked}</b> scams blocked
        </span>
        <span>
          <b>{tally.savedUsdc.toFixed(2)}</b> USDC saved
        </span>
      </div>

      <div className="demo-trust">
        Hard gates (lookalike / directory wallet mismatch) are high confidence. Soft text and optional Jev scores add
        risk points but cannot clear a hard BLOCK. Site badges are not trust. PAY auto-completes the agent payment; BLOCK
        flags the attempt and refuses to sign.
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
            <SiteWindow
              url={scenario.scene.url}
              agentRole={scenario.agentRole}
              stepCaption={stepCaption}
              flagged={blocked}
            >
              {scenario.scene.kind === "coffee" ? (
                <CoffeeSceneView scene={scenario.scene} focus={focus} />
              ) : scenario.scene.kind === "email" ? (
                <EmailSceneView scene={scenario.scene} focus={focus} />
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
              verifyHref={verifyHref}
              onRecheckAfterVerify={
                scenario.id === "coffee-new" ? () => void runGuard(scenario, { withAttestations: true }) : undefined
              }
            />
          ) : (
            <div className="empty">{error ?? "Select a scenario"}</div>
          )}
        </div>
      </div>
    </div>
  );
}
