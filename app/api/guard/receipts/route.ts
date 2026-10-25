import { recentReceipts } from "@/lib/guard/receipt";
import { json, preflight } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/guard/receipts — the latest decisions (newest first).
export async function GET() {
  return json({ receipts: await recentReceipts() }, 200, true);
}

export const OPTIONS = preflight;
