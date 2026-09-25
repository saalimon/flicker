import { describe, expect, test } from "bun:test";
import { mockClassify } from "./mock";
import { MODES } from "./types";

describe("mockClassify", () => {
  test("relaxing game for my kids, no bombs → zen, easy, kids, no hazards", () => {
    const r = mockClassify("relaxing game for my kids, no bombs");
    expect(r.mode.value).toBe("zen");
    expect(r.difficulty.score).toBe(1);
    expect(r.audience.value).toBe("kids");
    expect(r.hazards.value).toBe("none");
  });

  test("brutal 30 second reflex test → blitz, hard, speed", () => {
    const r = mockClassify("brutal 30 second reflex test");
    expect(r.mode.value).toBe("blitz");
    expect(r.difficulty.score).toBe(3);
    expect(r.rewardFocus.value).toBe("speed");
  });

  test("survive as long as possible, lots of hazards → survival, many hazards", () => {
    const r = mockClassify("survive as long as possible, lots of hazards, called Minefield");
    expect(r.mode.value).toBe("survival");
    expect(r.hazards.value).toBe("many");
  });

  test("a normal 60 second dot popping game → classic, normal", () => {
    const r = mockClassify("a normal 60 second dot popping game");
    expect(r.mode.value).toBe("classic");
    expect(r.difficulty.score).toBe(2);
  });

  test("workout game, 2 minutes, keep me moving → classic, workout, frantic", () => {
    const r = mockClassify("workout game, 2 minutes, keep me moving");
    expect(r.mode.value).toBe("classic");
    expect(r.audience.value).toBe("workout");
    expect(r.pace.value).toBe("frantic");
  });

  test.each([
    ["hard mode with lots of bombs", "classic"],
    ["make it neon", "classic"],
    ["2 minute workout to keep me moving", "classic"],
  ])("a description without the word 'game' still counts: %p → %p", (text, mode) => {
    expect(mockClassify(text).mode.value).toBe(mode);
  });

  test("text that is not a game → none", () => {
    expect(mockClassify("buy milk and eggs").mode.value).toBe("none");
    expect(mockClassify("").mode.value).toBe("none");
  });

  test("probabilities cover every mode and sum to 1", () => {
    const r = mockClassify("fast neon combo game");
    expect(Object.keys(r.mode.probabilities).sort()).toEqual([...MODES].sort());
    const sum = Object.values(r.mode.probabilities).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
    expect(r.mode.confidence).toBe(r.mode.probabilities[r.mode.value]);
  });

  test("is deterministic and labels itself as the mock", () => {
    const a = mockClassify("chill pastel game with bonus clocks");
    expect(mockClassify("chill pastel game with bonus clocks")).toEqual(a);
    expect(a.source).toBe("mock");
    expect(a.theme.value).toBe("pastel");
    expect(a.timeBonus.value).toBe(true);
  });

  test("handles very long pasted input quickly", () => {
    const huge = "fast game ".repeat(5000) + "🎮".repeat(1000);
    const t0 = performance.now();
    const r = mockClassify(huge);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(r.mode.value).toBe("blitz");
  });
});
