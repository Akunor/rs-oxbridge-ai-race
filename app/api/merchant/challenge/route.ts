import { createChallenge } from "@/lib/guard/confirm";
import { json, preflight, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/merchant/challenge { name, address } -> a one-time message for the wallet to sign.
export async function POST(request: Request) {
  const body = await readJson(request);
  try {
    return json(createChallenge(String(body?.name ?? ""), String(body?.address ?? "").trim()), 200, true);
  } catch (err) {
    return json({ error: { code: "invalid_input", message: (err as Error).message } }, 400, true);
  }
}

export const OPTIONS = preflight;
