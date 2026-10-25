import { bureauStatus, discoverMintLayout, presentExisting, runMinesweeper, runOperation } from "@/lib/bureau/challenges";
import { isAdmin, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/admin/challenges { action } — runs the on-chain challenges with the team wallet.
// Needs header x-admin-key: <your verifier token>, so only your team can spend the wallet's CRED.
export async function POST(request: Request) {
  if (!isAdmin(request)) return json({ error: "Enter your verifier token (from the team page) to unlock this." }, 401);
  const body = await readJson(request);
  const action = String(body?.action ?? "status");
  const bigints = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
  try {
    let out: unknown;
    if (action === "status") out = await bureauStatus();
    else if (action === "operation") out = await runOperation();
    else if (action === "discover") out = await discoverMintLayout(Number(body?.from ?? 0), 8);
    else if (action === "minesweeper") out = await runMinesweeper();
    else if (action === "present") out = await presentExisting();
    else return json({ error: `Unknown action ${action}` }, 400);
    return json(JSON.parse(JSON.stringify(out, bigints)));
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
}
