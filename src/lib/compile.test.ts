import { describe, expect, test } from "bun:test";
import { compile, nice } from "./compile";
import { mockClassify } from "./jev/mock";

const build = (text: string) => compile(mockClassify(text), text);

describe("compile", () => {
  test("not a game → null", () => {
    expect(build("buy milk and eggs")).toBeNull();
  });

  test("classic defaults match Flicker's original numbers", () => {
    const s = build("a normal dot popping game")!;
    expect(s.mode).toBe("classic");
    expect(s.roundMs).toBe(60_000);
    expect(s.lives).toBeNull();
    expect(s.level.interval0).toBe(1150);
    expect(s.level.life0).toBe(3400);
    expect(s.level.hazard0).toBe(0.12);
    expect(s.goldRate).toBe(0.07);
    expect(s.multCap).toBe(5);
    expect(s.countMisses).toBe(true);
  });

  test("brutal 30 second reflex test → hard blitz, 30s, speed badges", () => {
    const s = build("brutal 30 second reflex test")!;
    expect(s.mode).toBe("blitz");
    expect(s.roundMs).toBe(30_000);
    expect(s.level.interval0).toBe(Math.round(990 * 0.8));
    expect(s.level.hazardStartLevel).toBe(1);
    expect(s.badges.map((b) => b.id)).toContain("speed-b");
    expect(s.ranks[5].name).toBe("Lightning");
  });

  test("zen never has hazards, penalties or miss costs", () => {
    const s = build("relaxing game for my kids, no bombs")!;
    expect(s.mode).toBe("zen");
    expect(s.level.hazardMax).toBe(0);
    expect(s.penaltyMs).toBe(0);
    expect(s.countMisses).toBe(false);
    expect(s.targetScale).toBe(1.3);
    expect(s.sensDefault).toBe(4);
  });

  test("survival has lives, no clock and no bonus clocks", () => {
    const s = build("survive as long as possible, lots of hazards, called Minefield")!;
    expect(s.name).toBe("Minefield");
    expect(s.roundMs).toBeNull();
    expect(s.lives).toBe(3);
    expect(s.goldRate).toBe(0);
    expect(s.level.hazardMax).toBe(0.45);
    expect(s.badges.find((b) => b.id === "mode")!.stat).toBe("survivedMs");
  });

  test("workout pushes targets to the edges and uses the parsed length", () => {
    const s = build("workout game, 2 minutes, keep me moving")!;
    expect(s.roundMs).toBe(120_000);
    expect(s.edgeBias).toBe(0.6);
  });

  test("durations are clamped to 15s–5min", () => {
    expect(build("a 5 second game")!.roundMs).toBe(15_000);
    expect(build("a 10 minute game")!.roundMs).toBe(300_000);
  });

  test("combo focus on hard asks for a 40-pop combo", () => {
    const s = build("hard combo streak game")!;
    expect(s.badges.find((b) => b.id === "combo-b")!.min).toBe(40);
  });

  test("pop N adds a Finish line badge", () => {
    const s = build("pop 100 dots game")!;
    expect(s.badges.find((b) => b.id === "finish")!.min).toBe(100);
  });

  test("about eight badges with unique ids and increasing rank XP", () => {
    const s = build("pop 100 dots game")!;
    const ids = s.badges.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(7);
    expect(ids.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < s.ranks.length; i++) expect(s.ranks[i].xp).toBeGreaterThan(s.ranks[i - 1].xp);
  });

  test("same settings → same id; different settings → different id", () => {
    expect(build("a normal game")!.id).toBe(build("a regular game")!.id);
    expect(build("a normal game")!.id).not.toBe(build("a hard game")!.id);
  });
});

test("nice rounds to readable numbers", () => {
  expect(nice(0.2)).toBe(1);
  expect(nice(16)).toBe(16);
  expect(nice(40)).toBe(40);
  expect(nice(360)).toBe(350);
  expect(nice(2400)).toBe(2500);
});
