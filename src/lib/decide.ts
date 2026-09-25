import type { GameMode, IntentResult, ModeKey } from "./jev/types";

/*
 * Calm UI state machine, ported from shapeshift's decide.ts.
 * Turns a flickery stream of classifier results into stable card states:
 * a committed mode only changes when a challenger wins twice in a row or is very sure.
 */

export type UiState =
  | { kind: "input" }
  | { kind: "ghost"; mode: GameMode }
  | { kind: "choose"; options: [GameMode, GameMode] }
  | { kind: "committed"; mode: GameMode; forced?: boolean };

export const THRESHOLDS = {
  inputBelow: 0.4,
  commitAt: 0.7,
  chooseGap: 0.15,
  chooseFloor: 0.25,
  challengerOverride: 0.85,
  challengerWins: 2,
  dropBelow: 0.3,
  forcedChangeRatio: 0.3,
} as const;

export type DecideMemory = {
  ui: UiState;
  /** A different mode currently beating the committed one. */
  challenger: { mode: GameMode; wins: number } | null;
  /** Text at the moment the user forced a mode with a chip. */
  forcedText: string | null;
};

export const initialMemory: DecideMemory = { ui: { kind: "input" }, challenger: null, forcedText: null };

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function changedSubstantially(from: string, to: string) {
  const len = Math.max(from.length, to.length, 1);
  return levenshtein(from, to) > THRESHOLDS.forcedChangeRatio * len;
}

function ranked(result: IntentResult): [ModeKey, number][] {
  return (Object.entries(result.mode.probabilities) as [ModeKey, number][]).sort((a, b) => b[1] - a[1]);
}

function nearTie(result: IntentResult): [GameMode, GameMode] | null {
  const r = ranked(result).filter(([k]) => k !== "none");
  if (r.length < 2) return null;
  const [[a, pa], [b, pb]] = r;
  if (pa > THRESHOLDS.chooseFloor && pb > THRESHOLDS.chooseFloor && pa - pb < THRESHOLDS.chooseGap) {
    return [a as GameMode, b as GameMode];
  }
  return null;
}

/** Stateless mapping from a single result to a UI state. */
export function rawState(result: IntentResult): UiState {
  const top = result.mode.value;
  const conf = result.mode.confidence;
  if (top === "none" || conf < THRESHOLDS.inputBelow) {
    // A near-tie can still be worth offering even when neither side is confident.
    const tie = top !== "none" ? nearTie(result) : null;
    return tie ? { kind: "choose", options: tie } : { kind: "input" };
  }
  const tie = nearTie(result);
  if (tie) return { kind: "choose", options: tie };
  if (conf < THRESHOLDS.commitAt) return { kind: "ghost", mode: top };
  return { kind: "committed", mode: top };
}

/** `text` is the text the result was computed for. */
export function decide(mem: DecideMemory, result: IntentResult, text: string): DecideMemory {
  if (!text.trim()) return initialMemory;

  const prev = mem.ui;

  // Forced modes stay until the text changes substantially.
  if (prev.kind === "committed" && prev.forced && mem.forcedText !== null) {
    if (!changedSubstantially(mem.forcedText, text)) return mem;
  }

  const raw = rawState(result);

  if (prev.kind === "committed" && !prev.forced) {
    const current = prev.mode;
    const top = result.mode.value;
    const topConf = result.mode.confidence;
    const currentP = result.mode.probabilities[current] ?? 0;

    if (top === current) return { ui: prev, challenger: null, forcedText: null };

    if (top === "none") {
      if (currentP < THRESHOLDS.dropBelow) return initialMemory;
      return { ...mem, challenger: null };
    }

    if (topConf >= THRESHOLDS.challengerOverride) {
      return { ui: { kind: "committed", mode: top }, challenger: null, forcedText: null };
    }
    const wins = mem.challenger?.mode === top ? mem.challenger.wins + 1 : 1;
    if (wins >= THRESHOLDS.challengerWins && topConf >= THRESHOLDS.inputBelow) {
      return { ui: raw, challenger: null, forcedText: null };
    }
    if (currentP < THRESHOLDS.dropBelow && topConf < THRESHOLDS.inputBelow) return initialMemory;
    return { ui: prev, challenger: { mode: top, wins }, forcedText: null };
  }

  return { ui: raw, challenger: null, forcedText: null };
}

/** User picked a mode chip. */
export function force(mode: GameMode, text: string): DecideMemory {
  return { ui: { kind: "committed", mode, forced: true }, challenger: null, forcedText: text };
}

/** Tab on a ghost: promote without locking. */
export function promote(mem: DecideMemory): DecideMemory {
  if (mem.ui.kind !== "ghost") return mem;
  return { ui: { kind: "committed", mode: mem.ui.mode }, challenger: null, forcedText: null };
}

export function activeMode(ui: UiState): GameMode | null {
  return ui.kind === "committed" || ui.kind === "ghost" ? ui.mode : null;
}
