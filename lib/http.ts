import { NextResponse } from "next/server";

// Small helpers for the public JSON API. /api/guard/check is open to any agent or website (CORS).

export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-max-age": "86400",
};

export function json(body: unknown, status = 200, cors = false) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store", ...(cors ? CORS_HEADERS : {}) } });
}

export const preflight = () => new NextResponse(null, { status: 204, headers: CORS_HEADERS });

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Absolute URL for a path on this deployment (for links in API answers). */
export function absolute(request: Request, path: string): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${path}`;
}

/** Admin actions (on-chain challenges) need the verifier token from the team page. */
export function isAdmin(request: Request): boolean {
  const token = process.env.AGENT_STUDIO_VERIFIER_TOKEN;
  const given = request.headers.get("x-admin-key") ?? "";
  return Boolean(token) && given === token;
}
