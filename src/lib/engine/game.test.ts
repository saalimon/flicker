import { describe, expect, test } from "bun:test";
import { compile } from "../compile";
import { mockClassify } from "../jev/mock";
import type { GameSpec } from "../spec";
import { Game, MAX_DT, type GameEvent, type Layout, type Target } from "./game";

const LAYOUT: Layout = { CW: 800, CH: 600, ox: 0, oy: 0, dw: 800, dh: 600, hudBottom: 100 };
const spec = (text: string) => compile(mockClassify(text), text) as GameSpec;

/** Deterministic PRNG so spawns are repeatable. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Start a round and run through the 3-2-1 countdown. */
function playing(s: GameSpec) {
  const g = new Game(s, LAYOUT, mulberry32(7));
  g.beginCountdown();
  for (let i = 0; i < 60 && g.phase !== "playing"; i++) g.step(MAX_DT);
  expect(g.phase).toBe("playing");
  return g;
}

function run(g: Game, ms: number): GameEvent[] {
  const ev: GameEvent[] = [];
  for (let t = 0; t < ms; t += MAX_DT) ev.push(...g.step(MAX_DT));
  return ev;
}

function addTarget(g: Game, kind: Target["kind"], armedAgo = 1000): Target {
  const t: Target = {
    id: 999 + g.targets.length, kind, practice: false, rf: 0.08, x: 0.5, y: 0.5,
    born: g.clock - armedAgo - 320, armAt: g.clock - armedAgo, dieAt: g.clock + 5000, state: "live", goneAt: 0, hot: 0,
  };
  g.targets.push(t);
  return t;
}

describe("Game — classic", () => {
  test("level curve at level 1 matches Flicker", () => {
    const g = new Game(spec("a normal game"), LAYOUT);
    expect(g.levelCfg(1)).toEqual({ interval: 1150, maxLive: 2, life: 3400, size: 1, hazard: 0, gold: 0.07 });
    expect(g.levelCfg(2).hazard).toBeCloseTo(0.12);
    expect(g.levelCfg(99).interval).toBe(420);
  });

  test("countdown emits 3, 2, 1, Go", () => {
    const g = new Game(spec("a normal game"), LAYOUT);
    const texts = [...g.beginCountdown(), ...run(g, 3000)].filter((e) => e.type === "count").map((e) => (e as { text: string }).text);
    expect(texts).toEqual(["3", "2", "1", "Go"]);
  });

  test("an orb is worth 10 × multiplier, +5 when popped quickly", () => {
    const g = playing(spec("a normal game"));
    g.targets = [];
    const slow = addTarget(g, "orb", 1000);
    expect(g.hit(slow)[0]).toMatchObject({ type: "hit", pts: 10, quick: false });
    const fast = addTarget(g, "orb", 100);
    expect(g.hit(fast)[0]).toMatchObject({ type: "hit", pts: 15, quick: true });
  });

  test("five in a row raises the multiplier, capped at ×5", () => {
    const g = playing(spec("a normal game"));
    g.combo = 4;
    expect(g.hit(addTarget(g, "orb"))[0]).toMatchObject({ multUp: true, pts: 20 });
    g.combo = 100;
    expect(g.multiplier()).toBe(5);
  });

  test("gold gives 50 × mult and bonus time; hazard costs time and combo", () => {
    const g = playing(spec("a normal game"));
    const t0 = g.timeLeft!;
    g.hit(addTarget(g, "gold"));
    expect(g.score).toBe(50);
    expect(g.timeLeft).toBe(t0 + 3000);
    g.combo = 7;
    g.hit(addTarget(g, "hazard"));
    expect(g.combo).toBe(0);
    expect(g.timeLeft).toBe(t0);
  });

  test("levels go up every 8 pops", () => {
    const g = playing(spec("a normal game"));
    const ev: GameEvent[] = [];
    for (let i = 0; i < 8; i++) ev.push(...g.hit(addTarget(g, "orb")));
    expect(g.level).toBe(2);
    expect(ev).toContainEqual({ type: "level", level: 2 });
  });

  test("hazards need two hot frames, orbs need one", () => {
    const g = playing(spec("a normal game"));
    g.targets = [];
    const h = addTarget(g, "hazard");
    g.motion(() => 1, 0.1, false);
    expect(h.state).toBe("live");
    g.motion(() => 1, 0.1, false);
    expect(h.state).toBe("hit");
    const o = addTarget(g, "orb");
    g.motion(() => 1, 0.1, false);
    expect(o.state).toBe("hit");
  });

  test("a noisy frame hits nothing and resets heat", () => {
    const g = playing(spec("a normal game"));
    g.targets = [];
    const h = addTarget(g, "hazard");
    g.motion(() => 1, 0.1, false);
    g.motion(() => 1, 0.1, true);
    expect(h.hot).toBe(0);
    expect(h.state).toBe("live");
  });

  test("a faded orb is a miss and breaks a 3+ combo", () => {
    const g = playing(spec("a normal game"));
    g.targets = [];
    g.combo = 4;
    const o = addTarget(g, "orb");
    o.dieAt = g.clock + 10;
    const ev = g.step(MAX_DT);
    expect(ev).toContainEqual(expect.objectContaining({ type: "miss", comboLost: true, lifeLost: false }));
    expect(g.misses).toBe(1);
  });

  test("always spawns something to hit, never more than maxLive", () => {
    const g = playing(spec("a normal game"));
    run(g, 2000);
    const live = g.targets.filter((t) => t.state === "live");
    expect(live.length).toBeGreaterThan(0);
    expect(live.length).toBeLessThanOrEqual(g.levelCfg(g.level).maxLive);
    for (const t of live) {
      expect(g.dispY(t) - g.rDisp(t)).toBeGreaterThanOrEqual(LAYOUT.hudBottom);
    }
  });

  test("the round ends when time runs out", () => {
    const g = playing(spec("a 15 second game"));
    const ev = run(g, 16_000);
    expect(ev).toContainEqual({ type: "end", reason: "time" });
    expect(g.phase).toBe("over");
    expect(g.timeLeft).toBe(0);
  });

  test("a huge frame gap is clamped, so a background tab can't end the round", () => {
    const g = playing(spec("a normal game"));
    g.step(10_000);
    expect(g.timeLeft).toBe(60_000 - MAX_DT);
    expect(g.phase).toBe("playing");
  });

  test("pause freezes the clock", () => {
    const g = playing(spec("a normal game"));
    g.pause();
    const t = g.timeLeft;
    run(g, 1000);
    expect(g.timeLeft).toBe(t);
    g.resume();
    expect(g.phase).toBe("playing");
  });
});

describe("Game — other modes", () => {
  test("zen: faded dots cost nothing", () => {
    const g = playing(spec("relaxing game for my kids, no bombs"));
    g.targets = [];
    g.combo = 6;
    const o = addTarget(g, "orb");
    o.dieAt = g.clock + 10;
    expect(g.step(MAX_DT).some((e) => e.type === "miss")).toBe(false);
    expect(g.combo).toBe(6);
    expect(g.misses).toBe(0);
  });

  test("survival: no clock, three lives, ends on the last one", () => {
    const g = playing(spec("survive as long as possible"));
    expect(g.timeLeft).toBeNull();
    expect(g.lives).toBe(3);
    g.hit(addTarget(g, "hazard"));
    g.hit(addTarget(g, "hazard"));
    expect(g.lives).toBe(1);
    const ev = g.hit(addTarget(g, "hazard"));
    expect(ev).toContainEqual({ type: "end", reason: "lives" });
    expect(g.phase).toBe("over");
  });

  test("survival counts time survived", () => {
    const g = playing(spec("survive as long as possible"));
    g.targets = [];
    g.step(MAX_DT);
    expect(g.stats().survivedMs).toBe(MAX_DT);
  });

  test("workout pushes most spawns toward the edges", () => {
    const g = playing(spec("workout game, keep me moving"));
    let edge = 0, total = 0;
    for (let i = 0; i < 200; i++) {
      g.targets = [];
      g.step(MAX_DT);
      run(g, 400);
      for (const t of g.targets) {
        total++;
        if (t.x < 0.3 || t.x > 0.7) edge++;
      }
    }
    expect(total).toBeGreaterThan(50);
    expect(edge / total).toBeGreaterThan(0.55);
  });
});

describe("Game — idle practice", () => {
  test("keeps one practice dot in the free region, and popping it doesn't score", () => {
    const g = new Game(spec("a normal game"), LAYOUT, mulberry32(3));
    g.toIdle();
    g.step(MAX_DT * 6);
    for (let i = 0; i < 6; i++) g.step(MAX_DT);
    g.idle(() => ({ x0: 500, x1: 700, y0: 100, y1: 400 }));
    const p = g.targets.find((t) => t.practice)!;
    expect(g.dispX(p)).toBeGreaterThanOrEqual(500);
    for (let i = 0; i < 6; i++) g.step(MAX_DT); // arm it
    const ev = g.motion(() => 1, 0.1, false);
    expect(ev[0].type).toBe("practiceHit");
    expect(g.score).toBe(0);
  });

  test("no free region → no practice dot", () => {
    const g = new Game(spec("a normal game"), LAYOUT);
    g.toIdle();
    for (let i = 0; i < 10; i++) g.step(MAX_DT);
    g.idle(() => null);
    expect(g.targets).toHaveLength(0);
  });
});
