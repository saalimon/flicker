import { mockClassify } from "./jev/mock";
import { MAX_TEXT, type IntentResult } from "./jev/types";

/*
 * Browser entry point. On GitHub Pages (NEXT_PUBLIC_USE_MOCK=true) the offline
 * classifier runs locally. Otherwise ask /api/intent, and fall back to the
 * offline classifier on any failure: offline is the floor, never an error.
 */

export const ROUTE_TIMEOUT_MS = 2500;

export type ClassifyOptions = {
  useMock?: boolean;
  basePath?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const abortError = () => new DOMException("Aborted", "AbortError");

export async function classify(text: string, signal?: AbortSignal, opts: ClassifyOptions = {}): Promise<IntentResult> {
  const {
    useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true",
    basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "",
    fetchImpl = globalThis.fetch,
    timeoutMs = ROUTE_TIMEOUT_MS,
  } = opts;
  if (signal?.aborted) throw abortError();
  const input = text.slice(0, MAX_TEXT);
  if (useMock) return mockClassify(input);

  const timeout = AbortSignal.timeout(timeoutMs);
  const both = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const res = await fetchImpl(`${basePath}/api/intent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: input }),
      signal: both,
    });
    if (!res.ok) throw new Error(`intent route ${res.status}`);
    const body = (await res.json()) as IntentResult;
    if (body.error || !body.mode) throw new Error("intent route error");
    return body;
  } catch (err) {
    // The caller moved on (newer text): don't produce a stale result.
    if (signal?.aborted) throw abortError();
    return mockClassify(input);
  }
}
