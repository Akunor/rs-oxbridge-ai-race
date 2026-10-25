import { Led, Module, PageHeader } from "@/components/ui";
import { implementedTaskTypes } from "@/lib/race/adapter";
import { TASK_TYPES } from "@/lib/race/protocol";

export const dynamic = "force-dynamic";

const LAYER: Record<string, string> = {
  respond: "First Intelligence",
  extract: "Structured Outputs",
  use_tools: "Tool Calling, Reliability",
  answer_from_source: "External Knowledge",
  converse: "Memory and Context",
  run_workflow: "Autonomous Workflow",
};

/** What the race verifier will find when it calls this app. Shows no secrets. */
export default function RacePage() {
  const tokenSet = Boolean(process.env.AGENT_STUDIO_VERIFIER_TOKEN);
  const done = new Set(implementedTaskTypes());
  return (
    <>
      <PageHeader eyebrow="Hackathon · AI Race" title="Race readiness">
        The race verifier calls <code>/agent-studio/v1/health</code> and <code>/agent-studio/v1/tasks</code> on your
        public URL. Your logic lives in <code>lib/race/handlers.ts</code>.
      </PageHeader>
      <Module label="Setup">
        <ul className="steps">
          <li>
            <span>
              <Led tone={tokenSet ? "ok" : "fault"} />
            </span>
            <span>
              Verifier token {tokenSet ? "is set" : "is missing: copy it from your team page into AGENT_STUDIO_VERIFIER_TOKEN"}
            </span>
          </li>
          <li>
            <span>
              <Led tone="signal" />
            </span>
            <span>Deploy to a public https:// URL and paste it on your team page (the verifier doesn&apos;t follow redirects)</span>
          </li>
        </ul>
      </Module>
      <Module label="Task types" right={`${done.size} of ${TASK_TYPES.length} built`}>
        <ul className="steps">
          {TASK_TYPES.map((t) => (
            <li key={t}>
              <span>
                <Led tone={done.has(t) ? "ok" : undefined} />
              </span>
              <span>
                <code>{t}</code> · {LAYER[t]} · {done.has(t) ? "handler written" : "not built yet"}
              </span>
            </li>
          ))}
        </ul>
      </Module>
    </>
  );
}
