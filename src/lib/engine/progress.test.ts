import { describe, expect, test } from "bun:test";
import { compile } from "../compile";
import { mockClassify } from "../jev/mock";
import type { GameSpec } from "../spec";
import type { RoundStats } from "./game";
import { SAVE_KEY, gameProgress, loadSave, newlyEarned, rankOf, recordRound, writeSave } from "./progress";

const spec = compile(mockClassify("a normal combo game"), "a normal combo game") as GameSpec;
const stats = (over: Partial<RoundStats> = {}): RoundStats => ({
  score: 0, hits: 0, misses: 0, maxCombo: 0, quick: 0, goldHits: 0, hazardHits: 0, level: 1, popped: 0, survivedMs: 0, accuracy: 0,
  ...over,
});

function memStorage(initial?: string) {
  const m = new Map<string, string>();
  if (initial !== undefined) m.set(SAVE_KEY, initial);
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("loadSave / writeSave", () => {
  test("round-trips", () => {
    const st = memStorage();
    const s = loadSave(st);
    s.xp = 42;
    s.sens = 4;
    gameProgress(s, "abc").best = 99;
    writeSave(st, s);
    expect(loadSave(st)).toEqual(s);
  });

  test("corrupt or hostile data falls back to safe defaults", () => {
    expect(loadSave(memStorage("{not json")).xp).toBe(0);
    const s = loadSave(memStorage(JSON.stringify({ xp: -5, sens: 9, trails: "yes", games: { a: { best: "x", badges: [1, "first"] } } })));
    expect(s.xp).toBe(0);
    expect(s.sens).toBeNull();
    expect(s.trails).toBe(true);
    expect(s.games.a).toEqual({ best: 0, rounds: 0, xp: 0, badges: ["first"] });
  });

  test("storage that throws is ignored", () => {
    const boom = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadSave(boom).xp).toBe(0);
    expect(() => writeSave(boom, loadSave(null))).not.toThrow();
  });
});

describe("ranks and badges", () => {
  test("rankOf walks the ladder", () => {
    const ranks = [{ xp: 0, name: "A" }, { xp: 100, name: "B" }, { xp: 300, name: "C" }];
    expect(rankOf(0, ranks)).toMatchObject({ name: "A", frac: 0 });
    expect(rankOf(200, ranks)).toMatchObject({ name: "B", frac: 0.5 });
    expect(rankOf(999, ranks)).toMatchObject({ name: "C", next: null, frac: 1 });
  });

  test("mid-round checks skip end-of-round badges", () => {
    const got = newlyEarned(spec.badges, [], stats({ hits: 1, score: 10_000 }), 99, false).map((b) => b.id);
    expect(got).toContain("first");
    expect(got).not.toContain("regular");
  });

  test("already-owned badges are not earned twice", () => {
    expect(newlyEarned(spec.badges, ["first"], stats({ hits: 5 }), 0, false).map((b) => b.id)).not.toContain("first");
  });

  test("noHazards badges need a clean round", () => {
    const acc = compile(mockClassify("careful accuracy game"), "careful accuracy game") as GameSpec;
    const clean = acc.badges.find((b) => b.noHazards)!;
    expect(newlyEarned([clean], [], stats({ score: 5000, hazardHits: 1 }), 1, true)).toHaveLength(0);
    expect(newlyEarned([clean], [], stats({ score: 5000 }), 1, true)).toHaveLength(1);
  });
});

describe("recordRound", () => {
  test("banks score as XP per game and in total, tracks best and badges", () => {
    const save = loadSave(null);
    const r1 = recordRound(save, spec, stats({ score: 700, hits: 30 }));
    expect(r1.isBest).toBe(true);
    expect(save.xp).toBe(700);
    expect(save.games[spec.id]).toMatchObject({ best: 700, rounds: 1, xp: 700 });
    expect(r1.newBadges.map((b) => b.id)).toContain("first");
    expect(r1.rankAfter.i).toBeGreaterThan(r1.rankBefore.i);
    const r2 = recordRound(save, spec, stats({ score: 100, hits: 5 }));
    expect(r2.isBest).toBe(false);
    expect(r2.newBadges.map((b) => b.id)).not.toContain("first");
    expect(save.games[spec.id].best).toBe(700);
  });
});
