import type { IntentResult, Pace, RewardFocus } from "./jev/types";
import { parseDurationMs, parseName, parseTargetCount } from "./parse";
import { specId, type BadgeDef, type GameSpec, type LevelCurve, type Rank } from "./spec";

/*
 * "Jev decides, code computes": turn classifier answers plus the raw text into
 * exact game numbers. The baseline is Flicker's original constants.
 */

export const MIN_ROUND_MS = 15_000;
export const MAX_ROUND_MS = 300_000;

const BASE_CURVE: LevelCurve = {
  interval0: 1150, intervalStep: 80, intervalMin: 420,
  maxLive0: 2, maxLiveCap: 6,
  life0: 3400, lifeStep: 210, lifeMin: 1500,
  size0: 1, sizeStep: 0.05, sizeMin: 0.6,
  hazardStartLevel: 2, hazard0: 0.12, hazardStep: 0.03, hazardMax: 0.32,
  popsPerLevel: 8, maxLevel: 10,
};

const PACE_MUL: Record<Pace, number> = { chill: 1.25, steady: 1, frantic: 0.8 };

const RANK_NAMES: Record<RewardFocus, string[]> = {
  combo: ["Rookie", "Chain starter", "Streaker", "Unbroken", "Combo king", "Flicker master"],
  speed: ["Rookie", "Quick", "Snappy", "Reflex", "Blur", "Lightning"],
  accuracy: ["Rookie", "Steady hand", "Marksman", "Sharpshooter", "Sniper", "Deadeye"],
  collecting: ["Rookie", "Gatherer", "Collector", "Curator", "Hoarder", "Treasure keeper"],
};
const RANK_XP = [0, 600, 2000, 5000, 10000, 20000];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Round to a number that reads well on a badge: 7, 15, 350, 1500. Never below 1. */
export function nice(n: number): number {
  const step = n < 20 ? 1 : n < 100 ? 5 : n < 1000 ? 50 : 500;
  return Math.max(1, Math.round(n / step) * step);
}

function focusBadges(focus: RewardFocus, f: number): BadgeDef[] {
  switch (focus) {
    case "combo":
      return [
        { id: "combo-a", name: "On a roll", desc: `Reach a ${nice(10 * f)}-pop combo.`, stat: "maxCombo", min: nice(10 * f) },
        { id: "combo-b", name: "Unbroken", desc: `Reach a ${nice(25 * f)}-pop combo.`, stat: "maxCombo", min: nice(25 * f) },
      ];
    case "speed":
      return [
        { id: "speed-a", name: "Reflexes", desc: `Land ${nice(10 * f)} quick pops in one round.`, stat: "quick", min: nice(10 * f) },
        { id: "speed-b", name: "Lightning", desc: `Land ${nice(25 * f)} quick pops in one round.`, stat: "quick", min: nice(25 * f) },
      ];
    case "accuracy":
      return [
        { id: "acc-a", name: "Clean hands", desc: `Score ${nice(300 * f)}+ without touching a striped dot.`, stat: "score", min: nice(300 * f), end: true, noHazards: true },
        { id: "acc-b", name: "Sharpshooter", desc: "Finish a round with 90% accuracy.", stat: "accuracy", min: 90, end: true },
      ];
    case "collecting":
      return [
        { id: "col-a", name: "Collector", desc: `Pop ${nice(40 * f)} dots in one round.`, stat: "popped", min: nice(40 * f) },
        { id: "col-b", name: "Hoarder", desc: `Pop ${nice(100 * f)} dots in one round.`, stat: "popped", min: nice(100 * f) },
      ];
  }
}

export function compile(result: IntentResult, text: string): GameSpec | null {
  const mode = result.mode.value;
  if (mode === "none") return null;

  const difficulty = result.difficulty.score;
  const audience = result.audience.value;
  let pace: Pace = result.pace.value;
  if (mode === "blitz") pace = "frantic";
  else if (mode === "zen" && result.pace.confidence < 0.6) pace = "chill";

  // --- round length / lives
  const defaultMs = mode === "blitz" ? 30_000 : mode === "zen" ? 90_000 : 60_000;
  const parsedMs = parseDurationMs(text);
  const roundMs = mode === "survival" ? null : Math.min(MAX_ROUND_MS, Math.max(MIN_ROUND_MS, parsedMs ?? defaultMs));
  const lives = mode === "survival" ? 3 : null;

  // --- level curve
  const c: LevelCurve = { ...BASE_CURVE };
  if (difficulty === 1) Object.assign(c, { interval0: 1350, life0: 4000, size0: 1.15, hazardStartLevel: 3 });
  if (difficulty === 3) Object.assign(c, { interval0: 990, life0: 2980, size0: 0.9, hazardStartLevel: 1, hazard0: 0.18 });
  const pm = PACE_MUL[pace];
  c.interval0 = Math.round(c.interval0 * pm);
  c.intervalMin = Math.round(c.intervalMin * pm);
  c.life0 = Math.round(c.life0 * pm);
  c.lifeMin = Math.round(c.lifeMin * pm);
  if (mode === "blitz") c.popsPerLevel = 5;

  const hazards = mode === "zen" ? "none" : result.hazards.value;
  if (hazards === "none") Object.assign(c, { hazard0: 0, hazardStep: 0, hazardMax: 0 });
  if (hazards === "many") Object.assign(c, { hazard0: +(c.hazard0 * 1.8).toFixed(3), hazardStep: +(c.hazardStep * 1.8).toFixed(3), hazardMax: 0.45 });
  if (audience === "kids") c.hazardStartLevel = Math.max(c.hazardStartLevel, 3);

  // --- badges and ranks
  const f = difficulty === 1 ? 0.6 : difficulty === 3 ? 1.6 : 1;
  const scale = f * (roundMs ? roundMs / 60_000 : 1);
  const badges: BadgeDef[] = [
    { id: "first", name: "First contact", desc: "Pop your first dot.", stat: "hits", min: 1 },
    ...focusBadges(result.rewardFocus.value, f),
    { id: "score-a", name: "Warmed up", desc: `Score ${nice(500 * scale).toLocaleString("en")} in one round.`, stat: "score", min: nice(500 * scale) },
    { id: "score-b", name: "Blur", desc: `Score ${nice(1500 * scale).toLocaleString("en")} in one round.`, stat: "score", min: nice(1500 * scale) },
  ];
  if (mode === "classic") badges.push({ id: "mode", name: "Deep end", desc: "Reach level 6.", stat: "level", min: 6 });
  if (mode === "blitz") badges.push({ id: "mode", name: "Photo finish", desc: "Reach level 4.", stat: "level", min: 4 });
  if (mode === "zen") badges.push({ id: "mode", name: "Flow state", desc: `Pop ${nice(60 * f)} dots in one round.`, stat: "popped", min: nice(60 * f) });
  if (mode === "survival") badges.push({ id: "mode", name: "Last one standing", desc: "Survive for 90 seconds.", stat: "survivedMs", min: 90_000 });
  const target = parseTargetCount(text);
  if (target) badges.push({ id: "finish", name: "Finish line", desc: `Pop ${target} dots in one round.`, stat: "popped", min: target });
  badges.push({ id: "regular", name: "Regular", desc: "Finish 5 rounds.", stat: "rounds", min: 5, end: true });

  const ranks: Rank[] = RANK_NAMES[result.rewardFocus.value].map((name, i) => ({ name, xp: i === 0 ? 0 : nice(RANK_XP[i] * scale) }));

  const body: Omit<GameSpec, "id"> = {
    name: parseName(text) ?? `${cap(pace)} ${cap(mode)}`,
    mode,
    theme: result.theme.value,
    roundMs,
    lives,
    countMisses: mode !== "zen",
    level: c,
    goldRate: mode === "survival" || !result.timeBonus.value ? 0 : 0.07,
    bonusMs: 3000,
    penaltyMs: mode === "zen" ? 0 : 3000,
    multCap: 5,
    comboPerMult: 5,
    sensDefault: audience === "kids" ? 4 : 3,
    targetScale: audience === "kids" ? 1.3 : 1,
    edgeBias: audience === "workout" ? 0.6 : 0,
    badges,
    ranks,
  };
  return { id: specId(body), ...body };
}
