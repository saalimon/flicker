"use client";

import type { UiState } from "@/lib/decide";
import type { GameMode, IntentResult } from "@/lib/jev/types";

export const EXAMPLES = [
  "relaxing game for my kids, no bombs",
  "brutal 30 second reflex test",
  "survive as long as possible, lots of hazards, called Minefield",
  "workout game, 2 minutes, keep me moving",
  "neon combo game with bonus clocks",
];

const MODE_LABEL: Record<GameMode, string> = { classic: "Classic", survival: "Survival", zen: "Zen", blitz: "Blitz" };
const CHIPS: GameMode[] = ["classic", "blitz", "survival", "zen"];

type Props = {
  text: string;
  ui: UiState;
  active: GameMode | null;
  result: IntentResult | null;
  onText(text: string): void;
  onForce(mode: GameMode): void;
  onPromote(): void;
  onPlay(): void;
};

export default function Prompt({ text, ui, active, result, onText, onForce, onPromote, onPlay }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="prompt" className="font-bold">Describe your game</label>
      <textarea
        id="prompt"
        rows={3}
        value={text}
        maxLength={500}
        placeholder="e.g. brutal 30 second reflex test with lots of bombs"
        onChange={(e) => onText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Tab" && ui.kind === "ghost") {
            e.preventDefault();
            onPromote();
          }
          if (e.key === "Enter" && !e.shiftKey && active) {
            e.preventDefault();
            onPlay();
          }
        }}
        className="w-full resize-none rounded-xl border-2 border-line bg-sheet p-4 text-lg text-ink shadow-[5px_5px_0_var(--pink)] outline-none focus:border-pink"
      />

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Game mode">
        {CHIPS.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={active === m}
            onClick={() => onForce(m)}
            className={
              "rounded-full border-2 border-navy px-3 py-1 text-sm font-bold " +
              (active === m ? "bg-yellow text-navy" : "bg-sheet text-ink")
            }
          >
            {MODE_LABEL[m]}
          </button>
        ))}
        {result && (
          <span className="ml-auto text-sm text-ink-soft" aria-live="polite">
            {result.source === "mock" ? "Offline Jev" : `Jev · ${result.model} · ${result.latencyMs}ms`}
          </span>
        )}
      </div>

      {ui.kind === "choose" && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span>Did you mean</span>
          {ui.options.map((m, i) => (
            <span key={m} className="flex items-center gap-2">
              {i > 0 && <span>or</span>}
              <button type="button" className="font-bold underline underline-offset-4" onClick={() => onForce(m)}>{MODE_LABEL[m]}</button>
            </span>
          ))}
          <span>?</span>
        </p>
      )}
      {ui.kind === "ghost" && <p className="text-sm text-ink-soft">Looks like {MODE_LABEL[ui.mode]}. Press Tab to confirm, or pick a mode.</p>}

      {!text.trim() || (ui.kind === "input" && !active) ? (
        <div>
          <p className="mb-2 text-sm text-ink-soft">{text.trim() ? "That doesn’t sound like a game yet. Try one of these:" : "Try one of these:"}</p>
          <ul className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <button type="button" onClick={() => onText(ex)} className="rounded-lg border-2 border-dashed border-ink-soft px-3 py-1 text-left text-sm">
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
