import type { SystemOneResult } from "@typesafe-ai/sdk";
import type { JevQuestions } from "./questions";
import { MODES, type Difficulty, type IntentResult, type ModeKey } from "./types";

/** Convert a real Jev response into the app's IntentResult (the mock's shape). */
export function toIntentResult(res: SystemOneResult<JevQuestions>, latencyMs: number): IntentResult {
  const a = res.answers;
  const probabilities = {} as Record<ModeKey, number>;
  for (const k of MODES) probabilities[k] = a.mode.probabilities[k] ?? 0;
  // Jev's score is an expected value over 0..2 and may fall between levels.
  const difficulty = (Math.min(2, Math.max(0, Math.round(a.difficulty.score))) + 1) as Difficulty;
  const bonusP = a.timeBonus.noul;
  return {
    source: "jev",
    model: res.model,
    latencyMs,
    mode: { value: a.mode.choice, confidence: a.mode.confidence, probabilities },
    difficulty: { score: difficulty, confidence: a.difficulty.confidence },
    pace: { value: a.pace.choice, confidence: a.pace.confidence },
    hazards: { value: a.hazards.choice, confidence: a.hazards.confidence },
    timeBonus: { value: bonusP >= 0.5, confidence: Math.max(bonusP, 1 - bonusP) },
    rewardFocus: { value: a.rewardFocus.choice, confidence: a.rewardFocus.confidence },
    audience: { value: a.audience.choice, confidence: a.audience.confidence },
    theme: { value: a.theme.choice, confidence: a.theme.confidence },
  };
}
