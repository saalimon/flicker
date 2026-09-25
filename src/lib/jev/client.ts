import "server-only";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { toIntentResult } from "./map";
import { questions } from "./questions";
import type { IntentResult } from "./types";

/* Real Jev. Server only: the API key never reaches the browser. */

let client: TypeSafeClient | null = null;

export const jevConfigured = () => Boolean(process.env.TYPESAFE_API_KEY?.trim());

function getClient() {
  // One fast attempt: a stale answer is worse than falling back to the mock.
  client ??= new TypeSafeClient({ defaultModel: process.env.JEV_MODEL || "jev-latest", retry: { maxRetries: 0 }, timeout: 2500 });
  return client;
}

export async function classifyWithJev(text: string, signal?: AbortSignal): Promise<IntentResult> {
  const t0 = performance.now();
  const res = await getClient().systemOne({ state: { text }, questions }, { signal });
  return toIntentResult(res, Math.round(performance.now() - t0));
}
