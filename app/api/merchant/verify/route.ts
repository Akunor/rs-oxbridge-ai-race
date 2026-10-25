import { verifyChallenge } from "@/lib/guard/confirm";
import { json, preflight, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/merchant/verify { token, signature } -> checks the wallet's signature (base64 or a
// byte array). On success the wallet joins the verified-payee directory.
export async function POST(request: Request) {
  const body = await readJson(request);
  const token = typeof body?.token === "string" ? body.token : "";
  let signature: Uint8Array | null = null;
  if (typeof body?.signature === "string") signature = new Uint8Array(Buffer.from(body.signature, "base64"));
  else if (Array.isArray(body?.signature)) signature = Uint8Array.from(body.signature as number[]);
  if (!token || !signature || signature.length !== 64) {
    return json({ ok: false, reason: "Send { token, signature } where signature is the wallet's 64-byte signature (base64)." }, 400, true);
  }
  const result = await verifyChallenge(token, signature);
  return json(result, result.ok ? 200 : 400, true);
}

export const OPTIONS = preflight;
