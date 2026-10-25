import "server-only";

// Tiny key-value store. With Upstash Redis configured (free; on Vercel: Storage → Upstash for
// Redis → Connect) data is shared by every server instance. Without it, it lives in this
// instance's memory: fine for a demo, and signed tokens cover the gaps (see confirm.ts).

const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "").replace(/\/+$/, "");
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";
export const kvPersistent = Boolean(url && token);

const local = new Map<string, string>();
const localLists = new Map<string, string[]>();

async function redis(command: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(4000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstash Redis returned ${res.status}`);
  return ((await res.json()) as { result: unknown }).result;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const raw = kvPersistent ? ((await redis(["GET", key])) as string | null) : (local.get(key) ?? null);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    console.warn("[kv] get failed:", (err as Error).message);
    return null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const raw = JSON.stringify(value);
  try {
    if (kvPersistent) await redis(["SET", key, raw]);
    else local.set(key, raw);
  } catch (err) {
    console.warn("[kv] set failed:", (err as Error).message);
  }
}

/** Adds to the front of a list, keeping the newest `max` items. */
export async function kvPush(key: string, value: unknown, max = 50): Promise<void> {
  const raw = JSON.stringify(value);
  try {
    if (kvPersistent) {
      await redis(["LPUSH", key, raw]);
      await redis(["LTRIM", key, 0, max - 1]);
    } else localLists.set(key, [raw, ...(localLists.get(key) ?? [])].slice(0, max));
  } catch (err) {
    console.warn("[kv] push failed:", (err as Error).message);
  }
}

export async function kvList<T>(key: string, max = 50): Promise<T[]> {
  try {
    const raw = kvPersistent ? (((await redis(["LRANGE", key, 0, max - 1])) as string[] | null) ?? []) : (localLists.get(key) ?? []).slice(0, max);
    return raw.map((r) => JSON.parse(r) as T);
  } catch (err) {
    console.warn("[kv] list failed:", (err as Error).message);
    return [];
  }
}
