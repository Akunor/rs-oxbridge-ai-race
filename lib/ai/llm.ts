import "server-only";

// One small AI layer for the whole app. It talks to whichever model you have a key for:
//   GEMINI_API_KEY     (free, from https://aistudio.google.com/apikey)  -> Google Gemini
//   ANTHROPIC_API_KEY  (from https://console.anthropic.com)            -> Claude
// If both are set, AI_PROVIDER=gemini|anthropic picks one (default: anthropic when its key is set).
// Plain fetch, no SDKs, so there is nothing extra to install or keep in sync.

export type Provider = "gemini" | "anthropic";

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema for the tool's input object. */
  parameters: Record<string, unknown>;
  /** Runs the tool. Return any JSON-serialisable value; throw to report an error to the model. */
  run: (input: Record<string, unknown>) => Promise<unknown>;
}

export class AiConfigError extends Error {}

export function aiProvider(env: Record<string, string | undefined> = process.env): Provider | null {
  const forced = env.AI_PROVIDER?.trim().toLowerCase();
  if (forced === "gemini" && env.GEMINI_API_KEY) return "gemini";
  if (forced === "anthropic" && env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.GEMINI_API_KEY) return "gemini";
  return null;
}

export function aiModel(provider: Provider | null = aiProvider()): string {
  if (provider === "anthropic") return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
  if (provider === "gemini") return process.env.GEMINI_MODEL || "gemini-flash-latest";
  return "none";
}

function requireProvider(): Provider {
  const p = aiProvider();
  if (!p) throw new AiConfigError("No AI key set. Add GEMINI_API_KEY (free at aistudio.google.com/apikey) or ANTHROPIC_API_KEY to your environment.");
  return p;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST JSON with retries on rate limits and server hiccups. `timeoutMs` is a hard budget for all attempts combined. */
async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 250) break;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(remaining),
      });
      const text = await res.text();
      if (res.status === 429 || res.status >= 500) {
        last = `AI provider returned ${res.status}: ${text.slice(0, 200)}`;
        const wait = Math.min(700 * (attempt + 1), deadline - Date.now() - 100);
        if (wait > 0) await sleep(wait);
        continue;
      }
      if (!res.ok) throw new AiConfigError(`AI provider returned ${res.status}: ${text.slice(0, 300)}`);
      return JSON.parse(text) as Record<string, unknown>;
    } catch (err) {
      if (err instanceof AiConfigError) throw err;
      last = (err as Error).message;
      const wait = Math.min(400 * (attempt + 1), deadline - Date.now() - 100);
      if (wait > 0) await sleep(wait);
    }
  }
  throw new Error(last || "AI provider did not answer");
}

/** One prompt in, one text answer out. */
export async function complete(system: string, prompt: string, opts: { timeoutMs?: number; maxTokens?: number } = {}): Promise<string> {
  const { text } = await runAgent({ system, prompt, tools: [], timeoutMs: opts.timeoutMs, maxTokens: opts.maxTokens });
  return text;
}

export interface AgentRun {
  text: string;
  steps: number;
  model: string;
}

/**
 * A tool-using agent loop: the model decides which tools to call, we run them, feed the results
 * back, and repeat until it answers in text (or maxSteps is reached).
 */
export async function runAgent(opts: { system: string; prompt: string; tools: ToolDef[]; maxSteps?: number; timeoutMs?: number; maxTokens?: number }): Promise<AgentRun> {
  const provider = requireProvider();
  return provider === "anthropic" ? runAnthropic(opts) : runGemini(opts);
}

// ---------------------------------------------------------------- Anthropic (Claude)

async function runAnthropic(opts: { system: string; prompt: string; tools: ToolDef[]; maxSteps?: number; timeoutMs?: number; maxTokens?: number }): Promise<AgentRun> {
  const model = aiModel("anthropic");
  const headers = { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" };
  const messages: { role: "user" | "assistant"; content: unknown }[] = [{ role: "user", content: opts.prompt }];
  const tools = opts.tools.map((t) => ({ name: t.name, description: t.description, input_schema: anthropicSchema(t.parameters) }));
  const maxSteps = opts.maxSteps ?? 12;
  for (let step = 1; step <= maxSteps; step++) {
    const body: Record<string, unknown> = { model, max_tokens: opts.maxTokens ?? 1024, system: opts.system, messages };
    if (tools.length) body.tools = tools;
    const res = await postJson(`${(process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "")}/v1/messages`, headers, body, opts.timeoutMs ?? 30_000);
    const content = (res.content as { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[]) ?? [];
    const calls = content.filter((c) => c.type === "tool_use");
    const text = content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
    if (!calls.length) return { text, steps: step, model };
    messages.push({ role: "assistant", content });
    const results = [];
    for (const call of calls) {
      const { output, isError } = await runTool(opts.tools, call.name!, call.input ?? {});
      results.push({ type: "tool_result", tool_use_id: call.id, content: output, ...(isError ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error(`The agent did not finish within ${maxSteps} steps.`);
}

/** Claude needs an object schema at the top level. */
function anthropicSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return schema && schema.type === "object" ? schema : { type: "object", properties: (schema?.properties as object) ?? {} };
}

// ---------------------------------------------------------------- Google Gemini

async function runGemini(opts: { system: string; prompt: string; tools: ToolDef[]; maxSteps?: number; timeoutMs?: number; maxTokens?: number }): Promise<AgentRun> {
  const model = aiModel("gemini");
  const url = `${(process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "")}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const headers = { "x-goog-api-key": process.env.GEMINI_API_KEY! };
  const contents: { role: "user" | "model"; parts: unknown[] }[] = [{ role: "user", parts: [{ text: opts.prompt }] }];
  const declarations = opts.tools.map((t) => ({ name: t.name, description: t.description, parameters: geminiSchema(t.parameters) }));
  const maxSteps = opts.maxSteps ?? 12;
  for (let step = 1; step <= maxSteps; step++) {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: opts.system }] },
      contents,
      generationConfig: { temperature: 0, maxOutputTokens: Math.max(opts.maxTokens ?? 1024, 2048) },
    };
    if (declarations.length) body.tools = [{ functionDeclarations: declarations }];
    const res = await postJson(url, headers, body, opts.timeoutMs ?? 30_000);
    const candidate = (res.candidates as { content?: { role?: string; parts?: Record<string, unknown>[] } }[] | undefined)?.[0];
    const parts = candidate?.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall) as { functionCall: { name: string; args?: Record<string, unknown> } }[];
    const text = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text as string).join("").trim();
    if (!calls.length) return { text, steps: step, model };
    // Send the model's turn back exactly as given (it can carry thought signatures newer models need).
    contents.push({ role: "model", parts });
    const responses = [];
    for (const { functionCall } of calls) {
      const { output } = await runTool(opts.tools, functionCall.name, functionCall.args ?? {});
      responses.push({ functionResponse: { name: functionCall.name, response: { result: safeParse(output) } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  throw new Error(`The agent did not finish within ${maxSteps} steps.`);
}

/** Gemini accepts a subset of JSON Schema: keep the parts it understands. */
export function geminiSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== "object") return { type: "object", properties: {} };
  const s = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const type = Array.isArray(s.type) ? s.type.find((t) => t !== "null") : s.type;
  if (typeof type === "string") out.type = type;
  if (typeof s.description === "string") out.description = s.description;
  if (Array.isArray(s.enum)) out.enum = s.enum.map(String);
  if (s.properties && typeof s.properties === "object") {
    out.properties = Object.fromEntries(Object.entries(s.properties as Record<string, unknown>).map(([k, v]) => [k, geminiSchema(v)]));
    if (!out.type) out.type = "object";
  }
  if (Array.isArray(s.required)) out.required = s.required.filter((r) => typeof r === "string" && (out.properties as Record<string, unknown> | undefined)?.[r]);
  if (s.items) out.items = geminiSchema(s.items);
  if (out.type === "object" && !out.properties) out.properties = {};
  if (!out.type) out.type = "string";
  return out;
}

// ---------------------------------------------------------------- shared

async function runTool(tools: ToolDef[], name: string, input: Record<string, unknown>): Promise<{ output: string; isError: boolean }> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { output: JSON.stringify({ error: `Unknown tool ${name}` }), isError: true };
  try {
    const result = await tool.run(input);
    return { output: JSON.stringify(result ?? null), isError: false };
  } catch (err) {
    // Errors marked fatal (a tool that stays down, a broken limit) stop the whole run.
    if ((err as { fatal?: boolean }).fatal) throw err;
    return { output: JSON.stringify({ error: (err as Error).message }), isError: true };
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Finds the first JSON object in a model's answer (it may wrap it in prose or ``` fences). */
export function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf("{");
    if (start < 0) continue;
    // Walk forward to the matching closing brace, respecting strings.
    let depth = 0;
    let inString = false;
    for (let i = start; i < c.length; i++) {
      const ch = c[i];
      if (inString) {
        if (ch === "\\") i++;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        try {
          const parsed = JSON.parse(c.slice(start, i + 1));
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
        } catch {
          break;
        }
      }
    }
  }
  return null;
}
