import type { GameMode, Theme } from "./jev/types";

/** Numbers that shape difficulty per level (Flicker's levelCfg, parameterised). */
export type LevelCurve = {
  interval0: number; intervalStep: number; intervalMin: number;
  maxLive0: number; maxLiveCap: number;
  life0: number; lifeStep: number; lifeMin: number;
  size0: number; sizeStep: number; sizeMin: number;
  hazardStartLevel: number; hazard0: number; hazardStep: number; hazardMax: number;
  popsPerLevel: number; maxLevel: number;
};

/** Round stats a badge can test. `accuracy` is a percentage, `survivedMs` counts play time. */
export type StatKey =
  | "hits" | "maxCombo" | "score" | "quick" | "goldHits" | "level" | "popped" | "survivedMs" | "accuracy" | "rounds";

/** Plain data so it can be hashed and saved. Earned when stat ≥ min (and no hazards hit, if set). */
export type BadgeDef = { id: string; name: string; desc: string; stat: StatKey; min: number; end?: boolean; noHazards?: boolean };

export type Rank = { xp: number; name: string };

export type GameSpec = {
  id: string;
  name: string;
  mode: GameMode;
  theme: Theme;
  roundMs: number | null; // null = no clock (survival)
  lives: number | null; // null = no lives (everything but survival)
  countMisses: boolean; // false in zen: letting a dot fade costs nothing
  level: LevelCurve;
  goldRate: number;
  bonusMs: number;
  penaltyMs: number;
  multCap: number;
  comboPerMult: number;
  sensDefault: 1 | 2 | 3 | 4 | 5;
  targetScale: number;
  edgeBias: number; // 0..1, share of spawns pushed to the frame edges (workout)
  badges: BadgeDef[];
  ranks: Rank[];
};

export type Palette = { navy: string; blue: string; pink: string; yellow: string; green: string; orange: string; paper: string; white: string };

export const PALETTES: Record<Theme, Palette> = {
  flicker: { navy: "#1D2340", blue: "#3255A4", pink: "#FF48B0", yellow: "#FFE800", green: "#00A95C", orange: "#FF6C2F", paper: "#F4F6F0", white: "#FFFFFF" },
  neon: { navy: "#0B0F2A", blue: "#00E5FF", pink: "#FF2BD6", yellow: "#F9FF3B", green: "#39FF88", orange: "#FF7A1A", paper: "#F4F6F0", white: "#FFFFFF" },
  pastel: { navy: "#3A3450", blue: "#8FB3FF", pink: "#FFA8D9", yellow: "#FFF3A3", green: "#9EE6B8", orange: "#FFB48F", paper: "#FBF8F3", white: "#FFFFFF" },
  mono: { navy: "#111111", blue: "#6B6B6B", pink: "#8C8C8C", yellow: "#FFFFFF", green: "#BDBDBD", orange: "#7A7A7A", paper: "#F4F4F4", white: "#FFFFFF" },
};

/** FNV-1a over the spec's content (not the text typed), so equal games share progress. */
export function specId(spec: Omit<GameSpec, "id">): string {
  const s = JSON.stringify(spec);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
