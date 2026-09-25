import { expect, test } from "bun:test";
import type { SystemOneResult } from "@typesafe-ai/sdk";
import { toIntentResult } from "./map";
import type { JevQuestions } from "./questions";

const choice = (c: string, conf = 0.9, probabilities: Record<string, number> = { [c]: conf }) => ({
  type: "choice" as const, choice: c, confidence: conf, probabilities,
});

const fake = {
  model: "jev-1.13.0",
  usage: { input_tokens: 10, output_tokens: 5 },
  answers: {
    mode: choice("blitz", 0.8, { blitz: 0.8, classic: 0.15, zen: 0.05 }),
    difficulty: { type: "score", score: 1.7, confidence: 0.8, legend: {}, probabilities: {} },
    pace: choice("frantic"),
    hazards: choice("few"),
    timeBonus: { type: "noul", noul: 0.2 },
    rewardFocus: choice("speed"),
    audience: choice("general"),
    theme: choice("neon"),
  },
} as unknown as SystemOneResult<JevQuestions>;

test("maps a Jev response to IntentResult", () => {
  const r = toIntentResult(fake, 123);
  expect(r.source).toBe("jev");
  expect(r.model).toBe("jev-1.13.0");
  expect(r.latencyMs).toBe(123);
  expect(r.mode.value).toBe("blitz");
  expect(r.mode.probabilities).toEqual({ classic: 0.15, survival: 0, zen: 0.05, blitz: 0.8, none: 0 });
  expect(r.difficulty.score).toBe(3); // 1.7 rounds to level 2 of 0..2 → hard
  expect(r.timeBonus).toEqual({ value: false, confidence: 0.8 });
  expect(r.theme.value).toBe("neon");
});
