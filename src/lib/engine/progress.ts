import type { BadgeDef, GameSpec, Rank, StatKey } from "../spec";
import type { RoundStats } from "./game";
import type { SensLevel } from "./motion";

/*
 * Saved progress for this browser only. Every storage access is guarded:
 * private windows and blocked storage just play without saving.
 */

export const SAVE_KEY = "flickerforge.v1";

export type GameProgress = { best: number; rounds: number; xp: number; badges: string[] };
export type SaveData = {
  xp: number; // total across every game
  games: Record<string, GameProgress>;
  sens: SensLevel | null; // null = use the game's default
  trails: boolean;
  sound: boolean;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const fresh = (): SaveData => ({ xp: 0, games: {}, sens: null, trails: true, sound: true });
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

function cleanGame(v: unknown): GameProgress {
  const g = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    best: num(g.best),
    rounds: num(g.rounds),
    xp: num(g.xp),
    badges: Array.isArray(g.badges) ? g.badges.filter((b): b is string => typeof b === "string") : [],
  };
}

export function loadSave(storage: StorageLike | null): SaveData {
  const base = fresh();
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (!p || typeof p !== "object") return base;
    const games: Record<string, GameProgress> = {};
    if (p.games && typeof p.games === "object") for (const [id, g] of Object.entries(p.games)) games[id] = cleanGame(g);
    const sens = typeof p.sens === "number" && p.sens >= 1 && p.sens <= 5 ? (Math.round(p.sens) as SensLevel) : null;
    return {
      xp: num(p.xp),
      games,
      sens,
      trails: typeof p.trails === "boolean" ? p.trails : true,
      sound: typeof p.sound === "boolean" ? p.sound : true,
    };
  } catch {
    return base; // corrupt JSON or storage unavailable
  }
}

export function writeSave(storage: StorageLike | null, data: SaveData) {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* storage full or blocked: keep playing */
  }
}

/** The browser's localStorage, or null when the accessor itself throws. */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function gameProgress(save: SaveData, id: string): GameProgress {
  return (save.games[id] ??= { best: 0, rounds: 0, xp: 0, badges: [] });
}

export function rankOf(xp: number, ranks: Rank[]) {
  let i = 0;
  while (i + 1 < ranks.length && xp >= ranks[i + 1].xp) i++;
  const cur = ranks[i], next = ranks[i + 1] ?? null;
  return { i, name: cur.name, next, frac: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1 };
}

function statValue(stat: StatKey, s: RoundStats, rounds: number) {
  return stat === "rounds" ? rounds : s[stat];
}

/** Badges newly earned now. End-of-round badges are only checked when `atEnd`. */
export function newlyEarned(badges: BadgeDef[], owned: string[], s: RoundStats, rounds: number, atEnd: boolean): BadgeDef[] {
  return badges.filter(
    (b) =>
      !owned.includes(b.id) &&
      (atEnd || !b.end) &&
      statValue(b.stat, s, rounds) >= b.min &&
      (!b.noHazards || s.hazardHits === 0),
  );
}

export type RoundRecord = {
  isBest: boolean;
  rankBefore: ReturnType<typeof rankOf>;
  rankAfter: ReturnType<typeof rankOf>;
  newBadges: BadgeDef[];
};

/** Bank a finished round into `save` (mutates it). Score becomes XP. */
export function recordRound(save: SaveData, spec: GameSpec, s: RoundStats): RoundRecord {
  const gp = gameProgress(save, spec.id);
  const rankBefore = rankOf(gp.xp, spec.ranks);
  gp.rounds++;
  gp.xp += s.score;
  save.xp += s.score;
  const isBest = s.score > gp.best;
  if (isBest) gp.best = s.score;
  const newBadges = newlyEarned(spec.badges, gp.badges, s, gp.rounds, true);
  gp.badges.push(...newBadges.map((b) => b.id));
  return { isBest, rankBefore, rankAfter: rankOf(gp.xp, spec.ranks), newBadges };
}
