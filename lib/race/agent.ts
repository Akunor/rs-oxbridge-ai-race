import "server-only";
import { calculate } from "@/lib/ai/calc";
import { extractJson, runAgent, type ToolDef } from "@/lib/ai/llm";
import { TaskError, type Task, type TaskOutput, type ToolSpec } from "./protocol";
import { callTool, ToolCallError } from "./tools";

// The tool-using agent behind `use_tools` (and tool-based workflows). It is the same loop
// PayeeGuard uses: the AI decides which tools to call, every call is real, results feed back in.
// If the model fails to call tools, a deterministic pass still calls them with args taken from
// the instruction — invented results are never returned.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Thrown from inside the loop to stop it with a protocol error. */
class FatalTaskError extends TaskError {
  fatal = true;
}

export function inputText(task: Task): string {
  return typeof task.input === "string" ? task.input : JSON.stringify(task.input ?? "");
}

/** Calls a race tool for real, retrying transient failures (503s, network blips) with backoff. */
export function makeToolRunner(task: Task) {
  const toolResults: { tool: string; result: unknown }[] = [];
  const maxCalls = task.limits?.maxToolCalls ?? 20;
  const timeoutMs = task.limits?.timeoutMs ?? 10_000;
  let calls = 0;

  async function call(tool: ToolSpec, input: Record<string, unknown>): Promise<unknown> {
    let lastError: ToolCallError | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (calls >= maxCalls) throw new FatalTaskError("limit_exceeded", `Stopping: the task allows at most ${maxCalls} tool calls.`);
      calls++;
      try {
        const result = await callTool(tool, task, input, timeoutMs);
        toolResults.push({ tool: tool.name, result });
        return result;
      } catch (err) {
        if (!(err instanceof ToolCallError)) throw err;
        lastError = err;
        const timedOut = err.httpStatus === null && /did not answer within/i.test(err.message);
        if (timedOut) throw new FatalTaskError("upstream_timeout", err.message);
        const transient = err.httpStatus === null || err.httpStatus === 429 || err.httpStatus >= 500;
        if (!transient) throw err; // a 4xx: tell the model so it can fix its input
        await sleep(300 * 2 ** attempt);
      }
    }
    throw new FatalTaskError("upstream_unavailable", `${tool.name} kept failing: ${lastError?.message ?? "unavailable"}`);
  }

  return { call, toolResults, count: () => calls };
}

function calculatorTool(): ToolDef {
  return {
    name: "calculate",
    description:
      "Exact arithmetic. Use it for every sum, product or conversion instead of doing maths in your head. Supports + - * / ( ) and round(x, places). Example: round((120 + 455) * 0.7931, 2)",
    parameters: { type: "object", properties: { expression: { type: "string", description: "Arithmetic expression" } }, required: ["expression"] },
    run: async (input) => ({ result: calculate(String(input.expression ?? "")) }),
  };
}

/** Pull likely record / order ids out of the natural-language instruction. */
export function extractCandidateIds(text: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (v: string) => {
    const t = v.trim();
    if (t.length < 2 || t.length > 64 || seen.has(t)) return;
    if (/^(the|and|for|with|from|into|using|call|tool|json|true|false|null)$/i.test(t)) return;
    seen.add(t);
    ids.push(t);
  };
  for (const m of text.matchAll(/["'`“”]([^"'`“”]{2,64})["'`“”]/g)) add(m[1]);
  for (const m of text.matchAll(/\b([A-Z]{1,8}[-_][A-Za-z0-9._-]{1,40})\b/g)) add(m[1]);
  for (const m of text.matchAll(/\b(id|record|order|sku|item|code|ref(?:erence)?)\s*[:=]\s*([A-Za-z0-9._-]{2,40})\b/gi)) add(m[2]);
  return ids;
}

function schemaInputKeys(schema: Record<string, unknown> | undefined): string[] {
  if (!schema || typeof schema !== "object") return ["id"];
  const required = Array.isArray(schema.required) ? (schema.required as string[]).filter((k) => typeof k === "string") : [];
  const props =
    schema.properties && typeof schema.properties === "object" ? Object.keys(schema.properties as Record<string, unknown>) : [];
  const keys = [...required, ...props.filter((k) => !required.includes(k))];
  return keys.length ? keys : ["id"];
}

/**
 * When the model doesn't call tools, call each race tool with candidate ids from the instruction.
 * Only real HTTP results are kept (via the runner).
 */
export async function heuristicToolPass(task: Task, runner: ReturnType<typeof makeToolRunner>): Promise<void> {
  if (!task.tools?.length) return;
  const ids = extractCandidateIds(inputText(task));
  const tried = new Set<string>();
  for (const tool of task.tools) {
    const keys = schemaInputKeys(tool.inputSchema as Record<string, unknown> | undefined);
    const candidates = ids.length ? ids : [""];
    for (const id of candidates) {
      for (const key of keys.slice(0, 2)) {
        const input: Record<string, unknown> = id ? { [key]: id } : {};
        const stamp = `${tool.name}:${JSON.stringify(input)}`;
        if (tried.has(stamp)) continue;
        tried.add(stamp);
        try {
          await runner.call(tool, input);
        } catch (err) {
          if (err instanceof TaskError && (err.code === "limit_exceeded" || err.code === "upstream_timeout" || err.code === "upstream_unavailable")) {
            throw err;
          }
          // Wrong arg shape / unknown id → try the next candidate.
        }
      }
    }
    // Also try an empty / default call once (some tools take no args).
    const empty = `${tool.name}:{}`;
    if (!tried.has(empty)) {
      tried.add(empty);
      try {
        await runner.call(tool, {});
      } catch (err) {
        if (err instanceof TaskError && (err.code === "limit_exceeded" || err.code === "upstream_timeout" || err.code === "upstream_unavailable")) {
          throw err;
        }
      }
    }
  }
}

async function synthesizeFromResults(task: Task, toolResults: { tool: string; result: unknown }[]): Promise<TaskOutput> {
  const instruction = inputText(task).trim();
  if (!aiProviderAvailable()) {
    return {
      text: `Used ${toolResults.length} real tool call(s).`,
      data: task.schema ? coerceToSchema({ toolResults }, task.schema) : { toolResults },
      toolResults,
    };
  }
  const repair = await runAgent({
    system: `Return ONLY a JSON object {"text": string, "data": object}. Use only the real tool results given. Never invent tool data.${
      task.schema ? ` data must match this JSON Schema: ${JSON.stringify(task.schema)}` : ""
    } Use the calculate tool for arithmetic.`,
    prompt: `Task: ${instruction}\n\nReal tool results:\n${JSON.stringify(toolResults)}`,
    tools: [calculatorTool()],
    maxSteps: 6,
    timeoutMs: 12_000,
  });
  const parsed = extractJson(repair.text);
  let data = parsed && "data" in parsed ? parsed.data : parsed;
  data = coerceToSchema(data, task.schema);
  const text = typeof parsed?.text === "string" && parsed.text.trim() ? parsed.text.trim() : repair.text.trim().slice(0, 1000);
  return { text, ...(data !== undefined && data !== null ? { data } : {}), toolResults };
}

function aiProviderAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/** Runs the agent on a task with tools; returns text, schema-shaped data and the real tool results. */
export async function solveWithTools(task: Task): Promise<TaskOutput> {
  if (!Array.isArray(task.tools) || task.tools.length === 0) {
    throw new TaskError("invalid_input", "A use_tools task needs at least one tool in task.tools.");
  }
  if (!task.challengeToken) throw new TaskError("invalid_input", "A use_tools task needs task.challengeToken to call its tools.");
  const instruction = inputText(task).trim();
  if (!instruction) throw new TaskError("invalid_input", "The task has no input.");

  const runner = makeToolRunner(task);
  const tools: ToolDef[] = [
    ...task.tools.map((spec) => ({
      name: spec.name,
      description: spec.description || spec.name,
      parameters: (spec.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
      run: (input: Record<string, unknown>) => runner.call(spec, input),
    })),
    calculatorTool(),
  ];

  const schemaNote = task.schema ? `\n\nYour final data object MUST match this JSON Schema exactly:\n${JSON.stringify(task.schema)}` : "";
  const system = `You are PayeeGuard's payment agent. You complete tasks by calling the tools provided.
Rules:
- Never invent or guess tool results. Every fact you use must come from a tool call you made.
- Call every tool the task needs (one call per record or item). Use "calculate" for all arithmetic.
- Keep full precision until the final step; round money to 2 decimal places only at the end.
- When finished, reply with ONLY a JSON object (no prose, no code fences):
{"text": "<one-sentence answer>", "data": { ...the structured result... }}${schemaNote}`;

  let aiError: Error | null = null;
  if (aiProviderAvailable()) {
    try {
      const run = await runAgent({ system, prompt: instruction, tools, maxSteps: 14, timeoutMs: 22_000, maxTokens: 1024 });
      if (runner.toolResults.length > 0) {
        let parsed = extractJson(run.text);
        let data = parsed && "data" in parsed ? parsed.data : parsed;
        if (task.schema && !matchesRequired(data, task.schema)) {
          const repair = await runAgent({
            system: `Return ONLY a JSON object {"text": string, "data": object}. data must match this JSON Schema: ${JSON.stringify(task.schema)}. Use "calculate" for arithmetic. Use only the tool results given.`,
            prompt: `Task: ${instruction}\n\nReal tool results:\n${JSON.stringify(runner.toolResults)}\n\nYour previous answer: ${run.text.slice(0, 1500)}`,
            tools: [calculatorTool()],
            maxSteps: 6,
            timeoutMs: 12_000,
          });
          parsed = extractJson(repair.text);
          data = parsed && "data" in parsed ? parsed.data : parsed;
        }
        data = coerceToSchema(data, task.schema);
        const text = typeof parsed?.text === "string" && parsed.text.trim() ? parsed.text.trim() : run.text.trim().slice(0, 1000);
        return { text, ...(data !== undefined && data !== null ? { data } : {}), toolResults: runner.toolResults };
      }
    } catch (err) {
      if (err instanceof TaskError) throw err;
      aiError = err as Error;
      console.warn("[race] use_tools: AI agent failed, trying deterministic tool calls:", aiError.message);
    }
  }

  // Deterministic fallback: call the race tools for real with ids taken from the instruction.
  if (runner.toolResults.length === 0) {
    await heuristicToolPass(task, runner);
  }
  if (runner.toolResults.length === 0) {
    throw new TaskError(
      "internal",
      aiError
        ? `The agent finished without calling any tools (${aiError.message}).`
        : "The agent finished without calling any tools, so it has no real data to answer from.",
    );
  }
  return synthesizeFromResults(task, runner.toolResults);
}

function matchesRequired(data: unknown, schema: Record<string, unknown>): boolean {
  if (schema.type !== "object") return data !== undefined && data !== null;
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  return required.every((k) => (data as Record<string, unknown>)[k] !== undefined && (data as Record<string, unknown>)[k] !== null);
}

/** Turns "123.45" into 123.45 where the schema asks for a number, and drops extra keys if disallowed. */
export function coerceToSchema(data: unknown, schema: Record<string, unknown> | undefined): unknown {
  if (!schema || !data || typeof data !== "object" || Array.isArray(data)) return data;
  const props = (schema.properties ?? {}) as Record<string, { type?: string }>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (schema.additionalProperties === false && !(k in props)) continue;
    const type = props[k]?.type;
    if ((type === "number" || type === "integer") && typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v.replace(/[, ]/g, "")))) {
      out[k] = Number(v.replace(/[, ]/g, ""));
    } else out[k] = v;
  }
  return out;
}
