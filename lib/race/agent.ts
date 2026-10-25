import "server-only";
import { calculate } from "@/lib/ai/calc";
import { extractJson, runAgent, type ToolDef } from "@/lib/ai/llm";
import { TaskError, type Task, type TaskOutput, type ToolSpec } from "./protocol";
import { callTool, ToolCallError } from "./tools";

// Tool-using agent for `use_tools`. Race tools are called for real with challengeToken.
// Strategy: call tools deterministically first (Gemini outages must not prevent recordings),
// then synthesize the answer from those results (local math, optional AI polish).

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class FatalTaskError extends TaskError {
  fatal = true;
}

export function inputText(task: Task): string {
  return typeof task.input === "string" ? task.input : JSON.stringify(task.input ?? "");
}

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
        if (!transient) throw err;
        await sleep(300 * 2 ** attempt);
      }
    }
    throw new FatalTaskError("upstream_unavailable", `${tool.name} kept failing: ${lastError?.message ?? "unavailable"}`);
  }

  /** Like call(), but 4xx / bad args return null instead of throwing (for probing schemas). */
  async function tryCall(tool: ToolSpec, input: Record<string, unknown>): Promise<unknown | null> {
    try {
      return await call(tool, input);
    } catch (err) {
      if (err instanceof TaskError && (err.code === "limit_exceeded" || err.code === "upstream_timeout" || err.code === "upstream_unavailable")) {
        throw err;
      }
      return null;
    }
  }

  return { call, tryCall, toolResults, count: () => calls };
}

function calculatorTool(): ToolDef {
  return {
    name: "calculate",
    description: "Exact arithmetic. Supports + - * / ( ) and round(x, places).",
    parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] },
    run: async (input) => ({ result: calculate(String(input.expression ?? "")) }),
  };
}

const STOP = new Set(
  "the and for with from into using call tool json true false null then than that this your our their amount total sum convert look lookup record records both each all usd eur gbp jpy cad aud".split(
    " ",
  ),
);

/** Pull likely record / order ids out of the natural-language instruction. */
export function extractCandidateIds(text: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (v: string) => {
    const t = v.trim().replace(/[.,;:!?)]+$/, "");
    if (t.length < 2 || t.length > 64 || seen.has(t)) return;
    if (STOP.has(t.toLowerCase())) return;
    if (/^\d+(\.\d+)?$/.test(t)) return;
    seen.add(t);
    ids.push(t);
  };

  for (const m of text.matchAll(/["'`“”]([^"'`“”]{2,64})["'`“”]/g)) add(m[1]);
  for (const m of text.matchAll(/\b([A-Z]{1,8}[-_][A-Za-z0-9._-]{1,40})\b/g)) add(m[1]);
  for (const m of text.matchAll(/\b(id|record|order|sku|item|code|ref(?:erence)?)\s*[:=#]?\s*([A-Za-z0-9._-]{2,40})\b/gi)) add(m[2]);
  // "records alpha and beta" / "lookup_record for foo and bar"
  for (const m of text.matchAll(/\brecords?\b[^A-Za-z0-9_-]{0,20}([A-Za-z0-9._-]{2,40})\s+and\s+([A-Za-z0-9._-]{2,40})\b/gi)) {
    add(m[1]);
    add(m[2]);
  }
  for (const m of text.matchAll(/\b([a-z0-9]{8,}[-_][a-z0-9_-]{2,})\b/gi)) add(m[1]);
  for (const m of text.matchAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi)) add(m[0]);
  return ids;
}

/** ISO-ish currency codes mentioned in the instruction. */
export function extractCurrencies(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\b([A-Z]{3})\b/g)) {
    if (!/^(THE|AND|FOR|ALL|SUM|NOT|ANY|ONE|TWO|API|USD)$/.test(m[1]) || m[1] === "USD") found.add(m[1]);
  }
  // Always allow USD as a conversion target when any other currency appears.
  const list = [...found];
  if (list.length && !list.includes("USD")) list.push("USD");
  return list.length ? list : ["USD", "EUR", "GBP"];
}

function schemaProps(schema: Record<string, unknown> | undefined): Record<string, Record<string, unknown>> {
  if (!schema || typeof schema !== "object") return {};
  const props = schema.properties;
  return props && typeof props === "object" ? (props as Record<string, Record<string, unknown>>) : {};
}

function schemaRequired(schema: Record<string, unknown> | undefined): string[] {
  if (!schema || !Array.isArray(schema.required)) return [];
  return schema.required.filter((k): k is string => typeof k === "string");
}

function idLikeKeys(props: Record<string, Record<string, unknown>>, required: string[]): string[] {
  const names = [...required, ...Object.keys(props)];
  const scored = names.map((k) => {
    const n = k.toLowerCase();
    const score = /record|id|key|code|sku|ref|name|item|order/.test(n) ? 2 : 1;
    return { k, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return [...new Set(scored.map((s) => s.k))];
}

function currencyLikeKeys(props: Record<string, Record<string, unknown>>): { from: string[]; to: string[] } {
  const keys = Object.keys(props);
  const from = keys.filter((k) => /from|base|source|currency|asset/i.test(k));
  const to = keys.filter((k) => /to|quote|target|dest/i.test(k));
  return {
    from: from.length ? from : keys.slice(0, 1),
    to: to.length ? to : keys.slice(1, 2),
  };
}

/**
 * Call every race tool for real using args derived from the instruction + each tool's inputSchema.
 * This is the primary path so Gemini outages cannot leave the tool service with 0 recordings.
 */
export async function heuristicToolPass(task: Task, runner: ReturnType<typeof makeToolRunner>): Promise<void> {
  if (!task.tools?.length) return;
  const text = inputText(task);
  const ids = extractCandidateIds(text);
  const currencies = extractCurrencies(text);
  const tried = new Set<string>();

  const tryOnce = async (tool: ToolSpec, input: Record<string, unknown>) => {
    const stamp = `${tool.name}:${JSON.stringify(input)}`;
    if (tried.has(stamp)) return null;
    tried.add(stamp);
    return runner.tryCall(tool, input);
  };

  // 1) lookup / get / fetch / record tools — one successful call per distinct id
  const lookupTools = task.tools.filter((t) => !/exchange|rate|fx|convert/i.test(t.name));
  for (const tool of lookupTools) {
    const props = schemaProps(tool.inputSchema as Record<string, unknown>);
    const required = schemaRequired(tool.inputSchema as Record<string, unknown>);
    const keys = idLikeKeys(props, required);
    const key = keys[0] ?? "id";

    for (const id of ids) {
      const ok = await tryOnce(tool, { [key]: id });
      if (ok == null && keys[1]) await tryOnce(tool, { [keys[1]]: id });
    }
  }

  // 2) exchange_rate / fx — try currency pairs from the instruction + currencies seen in lookup results
  const rateTools = task.tools.filter((t) => /exchange|rate|fx|convert/i.test(t.name));
  const resultCurrencies = new Set<string>(currencies);
  for (const tr of runner.toolResults) {
    const blob = JSON.stringify(tr.result);
    for (const m of blob.matchAll(/\b([A-Z]{3})\b/g)) resultCurrencies.add(m[1]);
  }
  const ccy = [...resultCurrencies];
  for (const tool of rateTools) {
    const props = schemaProps(tool.inputSchema as Record<string, unknown>);
    const { from, to } = currencyLikeKeys(props);
    const fromKey = from[0] ?? "from";
    const toKey = to[0] ?? "to";
    // Prefer converting each non-USD currency into USD, then other pairs mentioned.
    const pairs: [string, string][] = [];
    for (const a of ccy) {
      if (a !== "USD") pairs.push([a, "USD"]);
    }
    for (let i = 0; i < ccy.length; i++) {
      for (let j = 0; j < ccy.length; j++) {
        if (i !== j) pairs.push([ccy[i], ccy[j]]);
      }
    }
    if (!pairs.length) pairs.push(["EUR", "USD"], ["GBP", "USD"]);
    for (const [a, b] of pairs.slice(0, 8)) {
      const ok = await tryOnce(tool, { [fromKey]: a, [toKey]: b });
      if (ok != null) break; // one successful rate is usually enough; more if needed below
    }
    // If the task mentions multiple source currencies, fetch each → USD
    for (const a of ccy.filter((x) => x !== "USD").slice(0, 4)) {
      await tryOnce(tool, { [fromKey]: a, [toKey]: "USD" });
    }
  }

  // 3) Any remaining tools: try id args, then empty object once
  for (const tool of task.tools) {
    if (runner.toolResults.some((r) => r.tool === tool.name)) continue;
    const props = schemaProps(tool.inputSchema as Record<string, unknown>);
    const required = schemaRequired(tool.inputSchema as Record<string, unknown>);
    const keys = idLikeKeys(props, required);
    for (const id of ids.slice(0, 4)) {
      for (const key of keys.slice(0, 2)) {
        await tryOnce(tool, { [key]: id });
      }
    }
    if (!required.length) await tryOnce(tool, {});
  }
}

/** Best-effort answer from tool JSON without calling Gemini (avoids 503 loops). */
export function synthesizeLocally(task: Task, toolResults: { tool: string; result: unknown }[]): TaskOutput {
  const amounts: number[] = [];
  const rates: number[] = [];
  for (const { result } of toolResults) {
    walkNumbers(result, amounts, rates);
  }
  let total: number | null = null;
  if (amounts.length && rates.length) {
    // Convert each amount by the first rate if only one rate; otherwise leave raw sum.
    const rate = rates[0];
    total = round2(amounts.reduce((s, a) => s + a * rate, 0));
  } else if (amounts.length) {
    total = round2(amounts.reduce((s, a) => s + a, 0));
  }

  const data: Record<string, unknown> = {};
  if (total !== null) {
    data.total = total;
    data.total_usd = total;
    data.amount = total;
    data.sum = total;
  }
  data.records = toolResults.filter((t) => /lookup|record/i.test(t.tool)).map((t) => t.result);
  data.rates = toolResults.filter((t) => /exchange|rate|fx/i.test(t.tool)).map((t) => t.result);

  const shaped = task.schema ? coerceToSchema(pickSchemaFields(data, task.schema), task.schema) : data;
  const text =
    total !== null
      ? `Computed ${total} from ${toolResults.length} real tool result(s).`
      : `Used ${toolResults.length} real tool result(s).`;
  return { text, data: shaped, toolResults };
}

function walkNumbers(value: unknown, amounts: number[], rates: number[], path = ""): void {
  if (value == null) return;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (/rate|fx|price/i.test(path) && value > 0 && value < 1000) rates.push(value);
    else if (/amount|value|price|total|balance|sum|qty|quantity/i.test(path) || path === "") amounts.push(value);
    else if (value >= 1) amounts.push(value);
    return;
  }
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    walkNumbers(Number(value), amounts, rates, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkNumbers(v, amounts, rates, `${path}[${i}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walkNumbers(v, amounts, rates, path ? `${path}.${k}` : k);
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pickSchemaFields(data: Record<string, unknown>, schema: Record<string, unknown>): Record<string, unknown> {
  const props = schemaProps(schema);
  const required = schemaRequired(schema);
  const keys = required.length ? required : Object.keys(props);
  if (!keys.length) return data;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (data[k] !== undefined) out[k] = data[k];
    else if (k in data) out[k] = data[k];
    else if (typeof data.total === "number" && /total|amount|sum|usd/i.test(k)) out[k] = data.total;
  }
  return Object.keys(out).length ? out : data;
}

async function synthesizeWithOptionalAi(task: Task, toolResults: { tool: string; result: unknown }[]): Promise<TaskOutput> {
  const local = synthesizeLocally(task, toolResults);
  if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) return local;
  if (task.schema && matchesRequired(local.data, task.schema)) return local;

  try {
    const repair = await runAgent({
      system: `Return ONLY JSON {"text": string, "data": object}. Use only the real tool results. Never invent tool data.${
        task.schema ? ` data MUST match: ${JSON.stringify(task.schema)}` : ""
      } Use calculate for arithmetic.`,
      prompt: `Task: ${inputText(task)}\n\nReal tool results:\n${JSON.stringify(toolResults)}`,
      tools: [calculatorTool()],
      maxSteps: 6,
      timeoutMs: 8_000,
    });
    const parsed = extractJson(repair.text);
    let data = parsed && "data" in parsed ? parsed.data : parsed;
    data = coerceToSchema(data, task.schema);
    if (task.schema && !matchesRequired(data, task.schema)) return local;
    const text = typeof parsed?.text === "string" && parsed.text.trim() ? parsed.text.trim() : local.text;
    return { text, ...(data !== undefined && data !== null ? { data } : { data: local.data }), toolResults };
  } catch (err) {
    console.warn("[race] use_tools: synthesize AI failed, using local answer:", (err as Error).message);
    return local;
  }
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

  // 1) Deterministic real tool calls first — must be recorded even when Gemini is 503.
  await heuristicToolPass(task, runner);

  // 2) If we still miss a named tool, try a short AI pass only to invoke remaining tools.
  const missing = task.tools.filter((t) => !runner.toolResults.some((r) => r.tool === t.name));
  if (missing.length && (process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY)) {
    const tools: ToolDef[] = [
      ...missing.map((spec) => ({
        name: spec.name,
        description: spec.description || spec.name,
        parameters: (spec.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
        run: (input: Record<string, unknown>) => runner.call(spec, input),
      })),
      ...task.tools
        .filter((t) => !missing.includes(t))
        .map((spec) => ({
          name: spec.name,
          description: `${spec.description || spec.name} (already called; call again only if needed)`,
          parameters: (spec.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
          run: (input: Record<string, unknown>) => runner.call(spec, input),
        })),
      calculatorTool(),
    ];
    try {
      await runAgent({
        system: `Call the provided tools to finish the task. Never invent results. You already have some results: ${JSON.stringify(runner.toolResults)}. Call any missing tools now, then reply with JSON {"text":"...","data":{...}}.`,
        prompt: instruction,
        tools,
        maxSteps: 10,
        timeoutMs: 12_000,
        maxTokens: 1024,
      });
    } catch (err) {
      console.warn("[race] use_tools: optional AI tool pass failed:", (err as Error).message);
    }
  }

  if (runner.toolResults.length === 0) {
    throw new TaskError(
      "internal",
      `No successful tool calls were recorded. Instruction ids tried: ${extractCandidateIds(instruction).join(", ") || "(none found)"}.`,
    );
  }

  return synthesizeWithOptionalAi(task, runner.toolResults);
}

function matchesRequired(data: unknown, schema: Record<string, unknown>): boolean {
  if (schema.type !== "object") return data !== undefined && data !== null;
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  return required.every((k) => (data as Record<string, unknown>)[k] !== undefined && (data as Record<string, unknown>)[k] !== null);
}

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
