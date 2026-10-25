import { NextResponse } from "next/server";
import { buildDemoScenario, isDemoScenarioId } from "@/lib/demo/scenarios";
import { DEMO_SCENARIO_META } from "@/lib/demo/types";

export const dynamic = "force-dynamic";

/** List scenarios or fetch one fully built payload for the agent demo cockpit. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ scenarios: DEMO_SCENARIO_META });
  }
  if (!isDemoScenarioId(id)) {
    return NextResponse.json({ error: { message: `Unknown scenario "${id}"` } }, { status: 404 });
  }
  return NextResponse.json(buildDemoScenario(id));
}
