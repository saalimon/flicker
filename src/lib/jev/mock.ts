import {
  MAX_TEXT,
  MODES,
  type Audience,
  type Difficulty,
  type GameMode,
  type Hazards,
  type IntentResult,
  type ModeKey,
  type Pace,
  type RewardFocus,
  type Signal,
  type Theme,
} from "./types";

/*
 * Offline Jev: a keyword classifier with exactly the same output shape as the
 * real model. Deterministic: the same text always gives the same result.
 */

const GAME_WORDS = /\b(game|round|dots?|pop(ping)?|play|level|score|targets?|challenge|test|arcade)\b/;

const MODE_CUES: Record<GameMode, RegExp[]> = {
  survival: [
    /\bsurviv(e|al|ing)\b/,
    /\blives\b/,
    /\b(endless|forever|infinite)\b/,
    /\bas long as (possible|you can|i can)\b/,
    /\blast (one|man|person) standing\b/,
  ],
  zen: [
    /\b(relax(ing|ed)?|calm(ing)?|chill|zen|peaceful|gentle|soothing|cozy)\b/,
    /\bno (bombs?|hazards?|stripes?|striped dots?|pressure|timer|penalt(y|ies))\b/,
    /\b(meditat\w*|unwind|stress[- ]free)\b/,
  ],
  blitz: [
    /\b(quick|fast|rapid|blitz|lightning|brutal|insane|frantic)\b/,
    /\breflex(es)?\b/,
    /\b([5-9]|1\d|2\d|30) ?(s|secs?|seconds?)\b/,
    /\bsprint\b/,
  ],
  classic: [
    /\b(classic|normal|standard|regular|original)\b/,
    /\b(60|sixty) ?(s|secs?|seconds?)\b|\b(1|one) ?min(ute)?\b/,
    /\bdot ?popping\b|\bpop(ping)? (the )?dots\b/,
  ],
};

const CUE_WEIGHT = 3;
const CLASSIC_BASE = 1.5; // any game-ish text leans classic
const NONE_SCORE = 3; // nothing game-like at all
const TEMPERATURE = 1.5;

const count = (t: string, res: RegExp[]) => res.reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);

function softmax(scores: Record<ModeKey, number>): Record<ModeKey, number> {
  const exps = MODES.map((k) => Math.exp(scores[k] / TEMPERATURE));
  const sum = exps.reduce((a, b) => a + b, 0);
  const out = {} as Record<ModeKey, number>;
  MODES.forEach((k, i) => (out[k] = exps[i] / sum));
  return out;
}

/** Pick the option with the most matching cues; ties go to the earlier option. */
function pick<T extends string>(t: string, cues: [T, RegExp[]][], fallback: T): Signal<T> {
  let best: T = fallback;
  let bestN = 0;
  for (const [value, res] of cues) {
    const n = count(t, res);
    if (n > bestN) {
      best = value;
      bestN = n;
    }
  }
  return bestN === 0 ? { value: fallback, confidence: 0.4 } : { value: best, confidence: Math.min(0.95, 0.75 + 0.1 * bestN) };
}

const HARD = [/\b(hard|brutal|insane|difficult|expert|intense|tough|challenging|nightmare)\b/];
const EASY = [/\b(easy|kids?|children|beginners?|simple|gentle|relax\w*|toddlers?)\b/];

function difficulty(t: string): { score: Difficulty; confidence: number } {
  const hard = count(t, HARD);
  const easy = count(t, EASY);
  if (hard > easy) return { score: 3, confidence: 0.85 };
  if (easy > hard) return { score: 1, confidence: 0.85 };
  return { score: 2, confidence: hard ? 0.5 : 0.4 };
}

export function mockClassify(input: string): IntentResult {
  const t = input.slice(0, MAX_TEXT).toLowerCase();
  const scores = {} as Record<ModeKey, number>;
  let anyCue = false;
  for (const m of ["classic", "survival", "zen", "blitz"] as const) {
    const n = count(t, MODE_CUES[m]);
    scores[m] = n * CUE_WEIGHT;
    if (n) anyCue = true;
  }
  const gameish = anyCue || GAME_WORDS.test(t);
  if (gameish) scores.classic += CLASSIC_BASE;
  scores.none = gameish ? 0 : NONE_SCORE;

  const probabilities = softmax(scores);
  let value: ModeKey = "none";
  for (const k of MODES) if (probabilities[k] > probabilities[value]) value = k;

  const pace = pick<Pace>(
    t,
    [
      ["frantic", [/\b(frantic|fast|quick|rapid|hectic|crazy|intense)\b/, /\b(workout|exercise|cardio|sweat)\b|\bkeep me moving\b/]],
      ["chill", [/\b(chill|slow|relax\w*|calm|zen|gentle|lazy|peaceful)\b/]],
    ],
    "steady",
  );

  let hazards = pick<Hazards>(
    t,
    [
      ["none", [/\b(no|without) (bombs?|hazards?|stripes?|striped dots?|traps?|mines?)\b/, /\bsafe\b/]],
      ["many", [/\b(lots of|many|tons of|full of|loads of|plenty of) (bombs?|hazards?|traps?|mines?)\b/, /\b(minefield|dangerous|deadly)\b/]],
      ["few", [/\b(some|few|a few|a little|little) (bombs?|hazards?|traps?|mines?)\b/]],
    ],
    "few",
  );
  // Mutual exclusion: a clearly relaxed game never has hazards.
  if (value === "zen" && probabilities.zen >= 0.5) hazards = { value: "none", confidence: Math.max(hazards.confidence, 0.8) };

  const noBonus = /\b(no|without) (bonus(es)?|clocks?|extra time|power-?ups?)\b/.test(t);
  const bonus = /\b(bonus(es)?|clocks?|extra time|power-?ups?)\b/.test(t);
  const timeBonus: Signal<boolean> = noBonus
    ? { value: false, confidence: 0.85 }
    : { value: true, confidence: bonus ? 0.85 : 0.5 };

  const rewardFocus = pick<RewardFocus>(
    t,
    [
      ["combo", [/\b(combos?|streaks?|chains?|multiplier)\b|\bin a row\b/]],
      ["speed", [/\b(reflex(es)?|speed|reaction|react)\b/]],
      ["accuracy", [/\b(accura\w*|precis\w*|careful|aim|perfect|mistakes?)\b/]],
      ["collecting", [/\b(collect\w*|badges?|stamps?|achievements?)\b|\bpop \d+\b|\b\d+ (dots|targets|pops)\b/]],
    ],
    "combo",
  );

  const audience = pick<Audience>(
    t,
    [
      ["kids", [/\b(kids?|child(ren)?|toddlers?|son|daughter|family|little ones)\b/]],
      ["workout", [/\b(workout|exercise|fitness|cardio|gym|warm ?up|sweat|active)\b|\bkeep me moving\b/]],
    ],
    "general",
  );

  const theme = pick<Theme>(
    t,
    [
      ["neon", [/\b(neon|cyber\w*|synthwave|glow\w*|arcade)\b/]],
      ["pastel", [/\b(pastel|soft|cute|kawaii|candy)\b/]],
      ["mono", [/\b(mono(chrome)?|grayscale|greyscale|minimal\w*)\b|\bblack and white\b/]],
    ],
    "flicker",
  );

  return {
    source: "mock",
    model: "mock",
    latencyMs: 0,
    mode: { value, confidence: probabilities[value], probabilities },
    difficulty: difficulty(t),
    pace,
    hazards,
    timeBonus,
    rewardFocus,
    audience,
    theme,
  };
}
