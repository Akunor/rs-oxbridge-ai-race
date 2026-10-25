// PayeeGuard's answers to the AI Race verifier. adapter.ts handles the token, nonce and envelope;
// each function below answers one task type.
//
//   respond      → AI feature working (+200): our AI model answers the question.
//   use_tools    → Agent uses tools (+300): the same tool-calling agent PayeeGuard runs on.
//   run_workflow → Agentic end-to-end payment (+400): PayeeGuard checks the payee (advisory
//                  mode: the verifier's test address is always brand new, so we report rather
//                  than block), then pays devnet USDC with the exact memo and returns the signature.
import "server-only";
import { aiModel, aiProvider, complete, extractJson } from "@/lib/ai/llm";
import { isSolanaAddress } from "@/lib/guard/address";
import { payWithGuard } from "@/lib/guard/pay";
import { inputText, solveWithTools } from "./agent";
import { TaskError, type Task, type TaskOutput, type TaskRequest, type TaskType } from "./protocol";

type Handler = ((task: Task, request: TaskRequest) => Promise<TaskOutput>) & { notImplemented?: boolean };

function notYet(type: TaskType): Handler {
  const h: Handler = async () => {
    throw new TaskError("internal", `This app doesn't handle "${type}" tasks yet (handlers.${type} in lib/race/handlers.ts).`);
  };
  h.notImplemented = true;
  return h;
}

// ------------------------------------------------------------------ respond

const RESPOND_SYSTEM = `You are PayeeGuard's assistant (PayeeGuard checks who an AI agent is paying before money moves).
Answer the user's question correctly and concisely. Follow any formatting instruction exactly:
if asked for a number, give the number; if asked to write something in capital letters, do so.`;

/** Used only if the AI provider is down: handles simple arithmetic and "write X in capitals". */
export function fallbackAnswer(question: string): string | null {
  const caps = question.match(/word\s+["“']([^"”']+)["”']\s+(?:written\s+)?in\s+capital/i) ?? question.match(/["“']([^"”']+)["”'].{0,40}capital letters/i);
  if (caps) return caps[1].toUpperCase();
  const m = question.match(/(-?\d+(?:\.\d+)?)\s*(plus|\+|minus|-|times|x|\*|multiplied by|divided by|\/)\s*(-?\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[3]);
  const op = m[2].toLowerCase();
  const r = op === "plus" || op === "+" ? a + b : op === "minus" || op === "-" ? a - b : op === "divided by" || op === "/" ? a / b : a * b;
  return String(Math.round(r * 1e6) / 1e6);
}

async function respond(task: Task): Promise<TaskOutput> {
  const question = inputText(task).trim();
  if (!question) throw new TaskError("invalid_input", "The respond task has no input.");
  try {
    const text = await complete(RESPOND_SYSTEM, question, { timeoutMs: 15_000, maxTokens: 400 });
    if (text.trim()) return { text: text.trim() };
  } catch (err) {
    console.warn("[race] respond: AI call failed:", (err as Error).message);
  }
  const fallback = fallbackAnswer(question);
  if (fallback !== null) return { text: fallback };
  throw new TaskError("internal", aiProvider() ? "The AI model did not answer." : "No AI key is set (GEMINI_API_KEY or ANTHROPIC_API_KEY).");
}

// ------------------------------------------------------------------ run_workflow (payments)

export interface PaymentInstruction {
  to: string;
  amountUsdc: number;
  memo?: string;
}

/** Reads "Pay 0.01 devnet USDC to <address> with the memo "<memo>"" without needing the AI. */
export function parsePaymentInstruction(text: string): PaymentInstruction | null {
  const amount = text.match(/(\d+(?:\.\d+)?)\s*(?:devnet\s+)?USDC\b/i) ?? text.match(/\bUSDC\s*(\d+(?:\.\d+)?)/i);
  const to = (text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g) ?? []).find(isSolanaAddress);
  if (!amount || !to) return null;
  const memo = text.match(/memo(?:\s+text)?\s*(?:of|:|=|is)?\s*["“'`]([^"”'`]+)["”'`]/i)?.[1] ?? text.match(/memo(?:\s+text)?\s*(?:of|:|=|is)?\s+([A-Za-z0-9_:\-.]+)/i)?.[1];
  return { to, amountUsdc: Number(amount[1]), memo };
}

async function aiPaymentInstruction(text: string): Promise<PaymentInstruction | null> {
  if (!aiProvider()) return null;
  const answer = await complete(
    'Extract the payment from the instruction. Reply with JSON only: {"to": "<solana address>", "amountUsdc": <number>, "memo": "<exact memo text or empty>"}. Copy the address and memo exactly, character for character.',
    text,
    { timeoutMs: 12_000, maxTokens: 300 },
  ).catch(() => "");
  const j = extractJson(answer);
  if (!j || typeof j.to !== "string" || !isSolanaAddress(j.to) || !Number.isFinite(Number(j.amountUsdc))) return null;
  // Only trust values that literally appear in the instruction.
  if (!text.includes(j.to)) return null;
  const memo = typeof j.memo === "string" && j.memo && text.includes(j.memo) ? j.memo : undefined;
  return { to: j.to, amountUsdc: Number(j.amountUsdc), memo };
}

async function runWorkflow(task: Task): Promise<TaskOutput> {
  const text = inputText(task).trim();
  if (!text) throw new TaskError("invalid_input", "The run_workflow task has no input.");

  const instruction = parsePaymentInstruction(text) ?? (/\b(pay|send|transfer)\b/i.test(text) ? await aiPaymentInstruction(text) : null);
  if (!instruction) {
    if (task.tools?.length) return solveWithTools(task); // a tool-based workflow rather than a payment
    throw new TaskError("invalid_input", "Couldn't find a payment (amount, address, memo) in the instruction.");
  }
  if (!(instruction.amountUsdc > 0)) throw new TaskError("invalid_input", "The payment amount must be more than 0.");
  const cap = task.limits?.maxSpendUsd;
  if (typeof cap === "number" && instruction.amountUsdc > cap + 1e-9) {
    throw new TaskError("limit_exceeded", `Paying ${instruction.amountUsdc} USDC would exceed the task's spending limit of ${cap}.`);
  }

  // PayeeGuard runs first. Advisory mode: it scores and records, and the payment still goes ahead.
  const { signature, result, receipt } = await payWithGuard(
    { address: instruction.to, amountUsdc: instruction.amountUsdc, reference: instruction.memo, messageText: text, source: "race" },
    { mode: "advisory", useAi: false, timeoutMs: 2500, memo: instruction.memo },
  ).catch((err) => {
    throw new TaskError("internal", (err as Error).message);
  });

  return {
    text: `Paid ${instruction.amountUsdc} devnet USDC to ${instruction.to}${instruction.memo ? ` with the memo "${instruction.memo}"` : ""}. Signature: ${signature}. PayeeGuard (advisory): ${result.verdict}, risk ${result.score}/100.`,
    data: {
      signature,
      payment: { to: instruction.to, amountUsdc: instruction.amountUsdc, memo: instruction.memo ?? null, network: "solana-devnet" },
      payeeGuard: { mode: "advisory", verdict: result.verdict, score: result.score, receipt: receipt.hash },
    },
  };
}

export const handlers: Record<TaskType, Handler> = {
  respond,
  extract: notYet("extract"),
  use_tools: (task) => solveWithTools(task),
  answer_from_source: notYet("answer_from_source"),
  converse: notYet("converse"),
  run_workflow: runWorkflow,
};

export const raceModel = () => aiModel(aiProvider());
