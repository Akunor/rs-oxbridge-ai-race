import { generateKeyPairSync } from "node:crypto";
import { getBase58Decoder } from "@solana/kit";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/setup/keypair — a fresh throwaway DEVNET wallet for the setup page.
// Nothing is stored: copy the secret into your hosting environment variables.
export async function GET() {
  const { privateKey } = generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" });
  const seed = Buffer.from(jwk.d!, "base64url");
  const pub = Buffer.from(jwk.x!, "base64url");
  const b58 = getBase58Decoder();
  return json({ address: b58.decode(pub), secretKey: b58.decode(new Uint8Array([...seed, ...pub])) });
}
