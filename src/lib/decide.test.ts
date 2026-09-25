import { describe, expect, test } from "bun:test";
import { activeMode, decide, force, initialMemory, promote, rawState, type DecideMemory } from "./decide";
import { mockClassify } from "./jev/mock";
import type { IntentResult, ModeKey } from "./jev/types";

/** A result whose mode probabilities are given explicitly (the rest sums to "none"). */
function result(probs: Partial<Record<ModeKey, number>>): IntentResult {
  const base = mockClassify("a normal game");
  const p: Record<ModeKey, number> = { classic: 0, survival: 0, zen: 0, blitz: 0, none: 0, ...probs };
  const rest = 1 - Object.values(p).reduce((a, b) => a + b, 0);
  p.none += Math.max(0, rest);
  let value: ModeKey = "none";
  for (const k of Object.keys(p) as ModeKey[]) if (p[k] > p[value]) value = k;
  return { ...base, mode: { value, confidence: p[value], probabilities: p } };
}

const committed = (mode: "classic" | "zen" | "blitz" | "survival"): DecideMemory => ({
  ui: { kind: "committed", mode },
  challenger: null,
  forcedText: null,
});

describe("rawState", () => {
  test("confident → committed, medium → ghost, low → input", () => {
    expect(rawState(result({ zen: 0.9 }))).toEqual({ kind: "committed", mode: "zen" });
    expect(rawState(result({ zen: 0.55 }))).toEqual({ kind: "ghost", mode: "zen" });
    expect(rawState(result({ zen: 0.2 }))).toEqual({ kind: "input" });
  });

  test("near-tie between two modes → choose", () => {
    expect(rawState(result({ zen: 0.4, classic: 0.35 }))).toEqual({ kind: "choose", options: ["zen", "classic"] });
  });
});

describe("decide", () => {
  test("empty text resets", () => {
    expect(decide(committed("zen"), result({ zen: 0.9 }), "  ")).toEqual(initialMemory);
  });

  test("a challenger needs two wins in a row", () => {
    const blitz = result({ blitz: 0.75, classic: 0.2 });
    const once = decide(committed("classic"), blitz, "a fast game");
    expect(once.ui).toEqual({ kind: "committed", mode: "classic" });
    expect(once.challenger).toEqual({ mode: "blitz", wins: 1 });
    const twice = decide(once, blitz, "a fast game!");
    expect(twice.ui).toEqual({ kind: "committed", mode: "blitz" });
  });

  test("a very confident challenger wins at once", () => {
    const next = decide(committed("classic"), result({ blitz: 0.9 }), "brutal blitz");
    expect(next.ui).toEqual({ kind: "committed", mode: "blitz" });
  });

  test("the current mode staying on top clears the challenger", () => {
    const mem = { ...committed("classic"), challenger: { mode: "blitz" as const, wins: 1 } };
    expect(decide(mem, result({ classic: 0.8 }), "normal game").challenger).toBeNull();
  });

  test("forced mode survives small edits and drops after a big change", () => {
    const f = force("survival", "a normal game");
    expect(decide(f, result({ zen: 0.95 }), "a normal game!")).toBe(f);
    expect(decide(f, result({ zen: 0.95 }), "totally different relaxing thing").ui).toEqual({ kind: "committed", mode: "zen" });
  });

  test("promote turns a ghost into a committed card", () => {
    const ghost: DecideMemory = { ui: { kind: "ghost", mode: "zen" }, challenger: null, forcedText: null };
    expect(promote(ghost).ui).toEqual({ kind: "committed", mode: "zen" });
    expect(activeMode(promote(ghost).ui)).toBe("zen");
    expect(activeMode({ kind: "input" })).toBeNull();
  });
});
