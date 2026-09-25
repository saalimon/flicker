"use client";

import type { IntentResult } from "@/lib/jev/types";
import { PALETTES, type GameSpec } from "@/lib/spec";

const DIFFICULTY = { 1: "Easy", 2: "Normal", 3: "Hard" } as const;

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="border-t-[3px] border-ink pt-1">
      <dt className="text-xs text-ink-soft">{k}</dt>
      <dd className="m-0 font-display text-2xl font-extrabold leading-none">{v}</dd>
    </div>
  );
}

export default function GameCard({ spec, result, ghost, onPlay }: { spec: GameSpec; result: IntentResult; ghost: boolean; onPlay(): void }) {
  const C = PALETTES[spec.theme];
  const hazards = spec.level.hazardMax === 0 ? "None" : spec.level.hazardMax > 0.32 ? "Many" : "Some";
  return (
    <article
      aria-label={`Game: ${spec.name}`}
      className={
        "rounded-2xl border-2 border-line bg-sheet p-6 shadow-[7px_7px_0_var(--pink)] transition-opacity " + (ghost ? "opacity-60" : "")
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="m-0 text-sm font-bold uppercase tracking-wide text-ink-soft">{spec.mode}</p>
          <h2 className="m-0 font-display text-6xl font-black leading-[.85] text-title [text-shadow:4px_3px_0_var(--pink)]">{spec.name}</h2>
        </div>
        <div className="flex gap-1" aria-label={`Theme: ${spec.theme}`}>
          {[C.yellow, C.pink, C.green, C.orange, C.blue].map((c) => (
            <span key={c} className="block h-5 w-5 rounded-full border-2 border-navy" style={{ background: c }} />
          ))}
        </div>
      </div>

      <dl className="my-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Row k={spec.roundMs ? "Round" : "Lives"} v={spec.roundMs ? `${spec.roundMs / 1000}s` : String(spec.lives)} />
        <Row k="Difficulty" v={DIFFICULTY[result.difficulty.score]} />
        <Row k="Hazards" v={hazards} />
        <Row k="Bonus clocks" v={spec.goldRate > 0 ? "Yes" : "No"} />
      </dl>

      <details>
        <summary className="cursor-pointer font-bold">{spec.badges.length} stamps to earn · ranks {spec.ranks[0].name} → {spec.ranks[spec.ranks.length - 1].name}</summary>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {spec.badges.map((b) => (
            <li key={b.id} className="text-sm">
              <strong className="block">{b.name}</strong>
              <span className="text-ink-soft">{b.desc}</span>
            </li>
          ))}
        </ul>
      </details>

      <button
        type="button"
        onClick={onPlay}
        className="mt-5 cursor-pointer rounded-[10px] border-2 border-navy bg-yellow px-6 pt-2.5 pb-3 font-display text-2xl font-extrabold leading-none text-navy active:translate-x-0.5 active:translate-y-0.5"
      >
        Play {spec.name}
      </button>
    </article>
  );
}
