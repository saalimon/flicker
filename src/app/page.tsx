"use client";

import { useEffect, useMemo, useState } from "react";
import GameCard from "@/components/GameCard";
import GameStage from "@/components/GameStage";
import Prompt from "@/components/Prompt";
import { classify } from "@/lib/classify";
import { compile } from "@/lib/compile";
import { activeMode, decide, force, initialMemory, promote } from "@/lib/decide";
import { browserStorage, loadSave } from "@/lib/engine/progress";
import type { GameMode, IntentResult } from "@/lib/jev/types";
import type { GameSpec } from "@/lib/spec";

const DEBOUNCE_MS = 120;

export default function Home() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<IntentResult | null>(null);
  const [mem, setMem] = useState(initialMemory);
  const [playing, setPlaying] = useState<GameSpec | null>(null);
  const [totalXp, setTotalXp] = useState(0);

  useEffect(() => setTotalXp(loadSave(browserStorage()).xp), [playing]);

  useEffect(() => {
    if (!text.trim()) {
      setResult(null);
      setMem(initialMemory);
      return;
    }
    const ac = new AbortController();
    const id = setTimeout(() => {
      classify(text, ac.signal)
        .then((r) => {
          setResult(r);
          setMem((m) => decide(m, r, text));
        })
        .catch(() => {
          /* aborted: a newer keystroke owns the card now */
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
      ac.abort();
    };
  }, [text]);

  const mode = activeMode(mem.ui);
  const spec = useMemo(
    () => (result && mode ? compile({ ...result, mode: { ...result.mode, value: mode } }, text) : null),
    [result, mode, text],
  );

  const play = () => {
    if (!spec) return;
    setMem((m) => promote(m));
    setPlaying(spec);
  };

  if (playing) return <GameStage spec={playing} onExit={() => setPlaying(null)} />;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="m-0 font-display text-7xl font-black leading-[.82] text-title [text-shadow:4px_3px_0_var(--pink)] sm:text-8xl">
          Flicker Forge
        </h1>
        <p className="mt-3 max-w-prose text-lg">
          Describe a camera motion game in plain words. Jev reads it and builds one you can play with your webcam, mouse or finger.
        </p>
        {totalXp > 0 && <p className="text-sm text-ink-soft">Total XP across your games: {totalXp.toLocaleString()}</p>}
      </header>

      <section className="rounded-2xl border-2 border-line bg-sheet p-5">
        <Prompt
          text={text}
          ui={mem.ui}
          active={mode}
          result={result}
          onText={setText}
          onForce={(m: GameMode) => setMem(force(m, text))}
          onPromote={() => setMem((m) => promote(m))}
          onPlay={play}
        />
      </section>

      {spec && result && <GameCard spec={spec} result={result} ghost={mem.ui.kind === "ghost"} onPlay={play} />}

      <footer className="text-sm text-ink-soft">
        Runs entirely in your browser. Video never leaves this device.{" "}
        <a className="underline" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/classic.html`}>Play the original Flicker</a>
      </footer>
    </main>
  );
}
