import { classifyWithJev, jevConfigured } from "@/lib/jev/client";
import { mockClassify } from "@/lib/jev/mock";
import { MAX_TEXT, type IntentResult } from "@/lib/jev/types";

/*
 * POST { text } → IntentResult. Server builds only: the static export leaves
 * this file out (pageExtensions: tsx), and the browser uses the offline mock.
 */

const CACHE_MAX = 500;
const cache = new Map<string, IntentResult>();

function remember(key: string, value: IntentResult) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

export async function POST(req: Request) {
  let text: unknown;
  try {
    text = ((await req.json()) as { text?: unknown }).text;
  } catch {
    return Response.json({ error: "Body must be JSON: { text: string }" }, { status: 400 });
  }
  if (typeof text !== "string") return Response.json({ error: "text must be a string" }, { status: 400 });

  const key = text.slice(0, MAX_TEXT).trim().toLowerCase().replace(/\s+/g, " ");
  const hit = cache.get(key);
  if (hit) return Response.json({ ...hit, latencyMs: 0, cached: true });

  if (!jevConfigured() || process.env.NEXT_PUBLIC_USE_MOCK === "true") return Response.json(mockClassify(key));

  try {
    const result = await classifyWithJev(key, req.signal);
    remember(key, result);
    console.info(`[jev] ${result.model} ${result.latencyMs}ms "${key}" → ${result.mode.value}`);
    return Response.json(result);
  } catch (err) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    console.warn("[jev] falling back to mock:", err instanceof Error ? err.message : err);
    return Response.json({ ...mockClassify(key), error: true });
  }
}
