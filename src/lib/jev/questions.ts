import { choice, noul, score } from "@typesafe-ai/sdk";

/*
 * The questions Jev answers about a game description, all in one parallel call.
 * Rules (from shapeshift): each question is self-contained, options don't overlap,
 * and every question has a neutral option so Jev never has to guess.
 * Jev only classifies. Numbers (durations, counts, names) are parsed by code.
 */
export const questions = {
  mode: choice(
    "The text describes a game someone wants to play. Which style of round does it describe?",
    {
      classic: "A normal timed round: pop targets for points before the clock runs out.",
      survival: "No clock. The player has lives and plays until they run out, surviving as long as possible.",
      zen: "Relaxed and low pressure: no penalties or hazards, just calm popping.",
      blitz: "A very short, fast, intense round that tests reflexes.",
      none: "The text is not describing a game at all.",
    },
  ),
  difficulty: score("How hard should the game be?", [
    "Easy: gentle, beginner or child friendly.",
    "Normal: no particular difficulty asked for.",
    "Hard: brutal, expert, intense or challenging.",
  ]),
  pace: choice("How fast should targets appear?", {
    chill: "Slow and relaxed.",
    steady: "Normal speed, or no pace mentioned.",
    frantic: "Fast, hectic, or meant to keep the player constantly moving.",
  }),
  hazards: choice("How many hazards (bombs, traps, striped dots to avoid) should there be?", {
    none: "Explicitly no hazards, or a relaxed game.",
    few: "Some hazards, or not mentioned.",
    many: "Lots of hazards, dangerous, a minefield.",
  }),
  timeBonus: noul("Should the game include bonus pickups that add extra time?", {
    true: "Bonus clocks, extra time or power-ups are wanted, or not mentioned.",
    false: "The text says no bonuses or no extra time.",
  }),
  rewardFocus: choice("What achievement does the player care about most?", {
    combo: "Long streaks and combos, or not mentioned.",
    speed: "Fast reactions and reflexes.",
    accuracy: "Precision and not making mistakes.",
    collecting: "Popping a large number of targets or collecting badges.",
  }),
  audience: choice("Who is the game for?", {
    general: "Anyone, or not mentioned.",
    kids: "Children or family.",
    workout: "Exercise, fitness, or getting the body moving.",
  }),
  theme: choice("Which visual style fits the description?", {
    flicker: "Default printed-poster look, or not mentioned.",
    neon: "Neon, cyber, arcade, glowing.",
    pastel: "Soft, cute, pastel colours.",
    mono: "Black and white, minimal.",
  }),
};

export type JevQuestions = typeof questions;
