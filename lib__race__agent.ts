import "server-only";
import { calculate } from "@/lib/ai/calc";
import { extractJson, runAgent, type ToolDef } from "@/lib/ai/llm";
import { TaskError, type Task, type TaskOutput, type ToolSpec } from "./protocol";
import { callTool, ToolCallError } from "./tools";

// The tool-using agent behind `use_tools` (and tool-based workflows). It is the same loop
// PayeeGuard uses: the AI decides which tools to call, every call is real, results feed back in.

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
    description: "Exact arithmetic. Use it for every sum, product or conversion instead of doing maths in your head. Supports + - * / ( ) and round(x, places). Example: round((120 + 455) * 0.7931, 2)",
    parameters: { type: "object", properties: { expression: { type: "string", description: "Arithmetic expression" } }, required: ["expression"] },
    run: async (input) => ({ result: calculate(String(input.expression ?? "")) }),
  };
}

/** Runs the agent on a task with tools; returns text, schema-shaped data and the real tool results. */
export async function solveWithTools(task: Task): Promise<TaskOutput> {
  if (!Array.isArray(task.tools) || task.tools.length === 0) throw new TaskError("invalid_input", "A use_tools task needs at least one tool in task.tools.");
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

  const run = await runAgent({ system, prompt: instruction, tools, maxSteps: 14, timeoutMs: 25_000, maxTokens: 1024 }).catch((err) => {
    if (err instanceof TaskError) throw err;
    throw new TaskError("internal", `The AI agent failed: ${(err as Error).message}`);
  });

  if (runner.toolResults.length === 0) throw new TaskError("internal", "The agent finished without calling any tools, so it has no real data to answer from.");

  let parsed = extractJson(run.text);
  let data = parsed && "data" in parsed ? parsed.data : parsed;
  if (task.schema && !matchesRequired(data, task.schema)) {
    // One repair pass: rebuild the answer from the real tool results only.
    const repair = await runAgent({
      system: `Return ONLY a JSON object {"text": string, "data": object}. data must match this JSON Schema: ${JSON.stringify(task.schema)}. Use "calculate" for arithmetic. Use only the tool results given.`,
      prompt: `Task: ${instruction}\n\nReal tool results:\n${JSON.stringify(runner.toolResults)}\n\nYour previous answer: ${run.text.slice(0, 1500)}`,
      tools: [calculatorTool()],
      maxSteps: 6,
      timeoutMs: 20_000,
    });
    parsed = extractJson(repair.text);
    data = parsed && "data" in parsed ? parsed.data : parsed;
  }
  data = coerceToSchema(data, task.schema);
  const text = typeof parsed?.text === "string" && parsed.text.trim() ? parsed.text.trim() : run.text.trim().slice(0, 1000);
  return { text, ...(data !== undefined && data !== null ? { data } : {}), toolResults: runner.toolResults };
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
