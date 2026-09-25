export const MODES = ["classic", "survival", "zen", "blitz", "none"] as const;
export type ModeKey = (typeof MODES)[number];
export type GameMode = Exclude<ModeKey, "none">;

export const PACES = ["chill", "steady", "frantic"] as const;
export type Pace = (typeof PACES)[number];

export const HAZARDS = ["none", "few", "many"] as const;
export type Hazards = (typeof HAZARDS)[number];

export const REWARD_FOCI = ["combo", "speed", "accuracy", "collecting"] as const;
export type RewardFocus = (typeof REWARD_FOCI)[number];

export const AUDIENCES = ["general", "kids", "workout"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const THEMES = ["flicker", "neon", "pastel", "mono"] as const;
export type Theme = (typeof THEMES)[number];

export type Difficulty = 1 | 2 | 3;

export type Signal<T> = { value: T; confidence: number };

/** Same shape whether it came from real Jev or the offline mock. */
export type IntentResult = {
  source: "jev" | "mock";
  model: string;
  latencyMs: number;
  mode: { value: ModeKey; confidence: number; probabilities: Record<ModeKey, number> };
  difficulty: { score: Difficulty; confidence: number };
  pace: Signal<Pace>;
  hazards: Signal<Hazards>;
  timeBonus: Signal<boolean>;
  rewardFocus: Signal<RewardFocus>;
  audience: Signal<Audience>;
  theme: Signal<Theme>;
  error?: boolean;
};

/** Longest description we classify; longer input is cut before classifying. */
export const MAX_TEXT = 500;
