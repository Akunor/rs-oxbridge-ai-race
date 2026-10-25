import { address, createSolanaRpc } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { aiModel, aiProvider } from "@/lib/ai/llm";
import { BUREAU } from "@/lib/bureau/challenges";
import { kvPersistent } from "@/lib/guard/kv";
import { merchantConfigured, newMerchant, shopMerchant } from "@/lib/guard/registry";
import { json } from "@/lib/http";
import { loadAgentSigner } from "@/lib/payments/client";
import { USDC_DEVNET_MINT } from "@/lib/payments/config";

export const dynamic = "force-dynamic";

// GET /api/setup/status — what's configured, and the agent wallet's balances. No secrets.
export async function GET() {
  const env = (k: string) => Boolean(process.env[k]?.trim());
  let wallet: { address: string; sol: number | null; usdc: string | null; cred: string | null } | null = null;
  let walletError: string | null = null;
  try {
    const signer = await loadAgentSigner();
    const rpc = createSolanaRpc(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com");
    const bal = async (mint: string) => {
      const [ata] = await findAssociatedTokenPda({ owner: signer.address, mint: address(mint), tokenProgram: TOKEN_PROGRAM_ADDRESS });
      return rpc.getTokenAccountBalance(ata).send().then((r) => r.value.uiAmountString ?? "0").catch(() => null);
    };
    const [sol, usdc, cred] = await Promise.all([
      rpc.getBalance(signer.address).send().then((r) => Number(r.value) / 1e9).catch(() => null),
      bal(USDC_DEVNET_MINT),
      bal(BUREAU.credMint),
    ]);
    wallet = { address: signer.address, sol, usdc, cred };
  } catch (err) {
    walletError = (err as Error).message;
  }
  const configured = merchantConfigured();
  return json({
    verifierToken: env("AGENT_STUDIO_VERIFIER_TOKEN"),
    ai: { provider: aiProvider(), model: aiModel(aiProvider()) },
    agentWallet: wallet,
    agentWalletError: walletError,
    shop: { name: shopMerchant().name, address: shopMerchant().address, configured: configured.shop },
    newShop: { name: newMerchant().name, address: newMerchant().address, configured: configured.newShop },
    challengeId: env("CHALLENGE_ID"),
    sharedStorage: kvPersistent,
  });
}
