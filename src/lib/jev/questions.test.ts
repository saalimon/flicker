import { expect, test } from "bun:test";
import { questions } from "./questions";
import { AUDIENCES, HAZARDS, MODES, PACES, REWARD_FOCI, THEMES } from "./types";

// The mock and real Jev must speak the same labels, or compile() gets values it can't handle.
test("Jev choice labels match the app's option lists", () => {
  const labels = (q: { criteria: object }) => Object.keys(q.criteria).sort();
  expect(labels(questions.mode)).toEqual([...MODES].sort());
  expect(labels(questions.pace)).toEqual([...PACES].sort());
  expect(labels(questions.hazards)).toEqual([...HAZARDS].sort());
  expect(labels(questions.rewardFocus)).toEqual([...REWARD_FOCI].sort());
  expect(labels(questions.audience)).toEqual([...AUDIENCES].sort());
  expect(labels(questions.theme)).toEqual([...THEMES].sort());
});

test("difficulty is a three-level score and timeBonus is yes/no", () => {
  expect(questions.difficulty.type).toBe("score");
  expect(questions.difficulty.criteria).toHaveLength(3);
  expect(questions.timeBonus.type).toBe("noul");
});
