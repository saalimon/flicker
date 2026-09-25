"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SENS, type SensLevel } from "@/lib/engine/motion";
import { browserStorage, gameProgress, loadSave, rankOf } from "@/lib/engine/progress";
import { createStage, type EndData, type InputKind, type Screen, type StageApi } from "@/lib/engine/stage";
import { PALETTES, type BadgeDef, type GameSpec } from "@/lib/spec";

const LEDE: Record<GameSpec["mode"], string> = {
  classic: "Your camera sees what moves. Wave at the yellow dots before they fade.",
  blitz: "A short, fast round. Wave at the yellow dots before they fade.",
  zen: "No pressure. Wave at the dots whenever you like; letting one fade costs nothing.",
  survival: "No clock. Every dot you miss and every striped dot you touch costs a life.",
};

function Stamp({ b, got }: { b: BadgeDef; got: boolean }) {
  return (
    <li className={"stamp" + (got ? " got" : "")} aria-label={`${b.name}. ${b.desc} ${got ? "Earned." : "Not earned yet."}`}>
      <span className={"stamp-mark" + (got ? " got" : "")} aria-hidden="true">
        {got && (
          <svg viewBox="0 0 24 24">
            <path d="M5 12.5 10 17 19 7" stroke="#1D2340" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span>
        <strong>{b.name}</strong>
        <span className="d">{b.desc}</span>
      </span>
    </li>
  );
}

export default function GameStage({ spec, onExit }: { spec: GameSpec; onExit: () => void }) {
  const C = PALETTES[spec.theme];
  const saveRef = useRef(loadSave(browserStorage()));
  const api = useRef<StageApi | null>(null);
  const r = {
    stage: useRef<HTMLElement>(null), video: useRef<HTMLVideoElement>(null), canvas: useRef<HTMLCanvasElement>(null),
    hud: useRef<HTMLDivElement>(null), pauseBtn: useRef<HTMLButtonElement>(null), score: useRef<HTMLDivElement>(null),
    level: useRef<HTMLDivElement>(null), time: useRef<HTMLDivElement>(null), timeLabel: useRef<HTMLDivElement>(null),
    timeBar: useRef<HTMLSpanElement>(null), timeTag: useRef<HTMLDivElement>(null), mult: useRef<HTMLDivElement>(null),
    combo: useRef<HTMLDivElement>(null), comboTag: useRef<HTMLDivElement>(null), count: useRef<HTMLDivElement>(null),
    banner: useRef<HTMLDivElement>(null), flash: useRef<HTMLDivElement>(null), live: useRef<HTMLDivElement>(null),
    toasts: useRef<HTMLDivElement>(null), meter: useRef<HTMLDivElement>(null), meterFill: useRef<HTMLSpanElement>(null),
    calNote: useRef<HTMLParagraphElement>(null), startPanel: useRef<HTMLElement>(null),
  };

  const [screen, setScreen] = useState<Screen>("start");
  const [input, setInput] = useState<InputKind>(null);
  const [camBlocked, setCamBlocked] = useState(false);
  const [status, setStatus] = useState({ text: "You'll need a webcam. Stand back far enough that both hands fit in the frame.", error: false });
  const [hint, setHint] = useState(false);
  const [toggles, setToggles] = useState({ trails: true, sound: true });
  const [sens, setSens] = useState<SensLevel>(saveRef.current.sens ?? spec.sensDefault);
  const [end, setEnd] = useState<EndData | null>(null);

  useEffect(() => {
    const need = <T,>(x: { current: T | null }) => x.current as T;
    const stage = createStage(
      {
        stage: need(r.stage), video: need(r.video), canvas: need(r.canvas), hud: need(r.hud), pauseBtn: need(r.pauseBtn),
        score: need(r.score), level: need(r.level), time: need(r.time), timeLabel: need(r.timeLabel), timeBar: need(r.timeBar),
        timeTag: need(r.timeTag), mult: need(r.mult), combo: need(r.combo), comboTag: need(r.comboTag), count: need(r.count),
        banner: need(r.banner), flash: need(r.flash), live: need(r.live), toasts: need(r.toasts), meter: need(r.meter),
        meterFill: need(r.meterFill), calNote: need(r.calNote),
        startPanel: () => (r.startPanel.current && !r.startPanel.current.hidden ? r.startPanel.current : null),
      },
      spec,
      saveRef.current,
      {
        screen: setScreen,
        ended: setEnd,
        input: (k, blocked) => {
          setInput(k);
          setCamBlocked(blocked);
        },
        status: (text, error = false) => setStatus({ text, error }),
        hint: setHint,
        toggles: (trails, sound) => setToggles({ trails, sound }),
      },
    );
    api.current = stage;
    return () => {
      stage.destroy();
      api.current = null;
    };
    // The stage is built once per game; `spec` identity changes mean a new game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  useEffect(() => {
    if (screen === "paused") document.getElementById("resumeBtn")?.focus();
    if (screen === "end") document.getElementById("againBtn")?.focus();
  }, [screen]);

  const gp = gameProgress(saveRef.current, spec.id);
  const rank = rankOf(gp.xp, spec.ranks);
  const hasGold = spec.goldRate > 0;
  const hasHazards = spec.level.hazardMax > 0;
  const themeVars = { "--navy": C.navy, "--blue": C.blue, "--pink": C.pink, "--yellow": C.yellow, "--green": C.green, "--orange": C.orange } as CSSProperties;
  const shots = end ? end.stats.hits + end.stats.misses : 0;

  return (
    <main className="stage" ref={r.stage} data-input={input ?? "none"} style={themeVars}>
      <video className="cam" ref={r.video} playsInline muted autoPlay />
      <div className="tint tint-lift" />
      <div className="tint tint-mult" />
      <canvas className="fx" ref={r.canvas} aria-label="Game area" />
      <div className="flash" ref={r.flash} />

      <div className="hud" ref={r.hud} aria-hidden="true">
        <div className="tag hud-score">
          <div className="big" ref={r.score}>0</div>
          <div className="small" ref={r.level}>Level 1</div>
        </div>
        <div className="tag hud-time" ref={r.timeTag}>
          <div className="big" ref={r.time}>{spec.roundMs ? spec.roundMs / 1000 : spec.lives}</div>
          <div className="small" ref={r.timeLabel} />
          <div className="timebar"><span ref={r.timeBar} /></div>
        </div>
        <div className="tag hud-combo" ref={r.comboTag}>
          <div className="big" ref={r.mult}>×1</div>
          <div className="small" ref={r.combo}>Pop {spec.comboPerMult} in a row for ×2</div>
        </div>
      </div>
      <p className="hint" hidden={!hint}>Too much is moving at once. Keep the camera still and step back a little.</p>
      <div className="count" ref={r.count} aria-hidden="true" />
      <div className="banner" ref={r.banner} aria-hidden="true" />
      <div className="toasts" ref={r.toasts} />

      <div className="controls">
        <button className="icon-btn" ref={r.pauseBtn} aria-label="Pause (Space)" onClick={() => (screen === "paused" ? api.current?.resume() : api.current?.pause())}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" /></svg>
        </button>
        <button className="icon-btn" aria-pressed={toggles.trails} aria-label="Show motion trail (M)" onClick={() => api.current?.toggleTrails()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="2.4" fill="currentColor" /><circle cx="12" cy="9" r="1.8" fill="currentColor" /><circle cx="17.5" cy="12" r="1.3" fill="currentColor" /><circle cx="6" cy="14" r="1.8" fill="currentColor" /><circle cx="11" cy="17" r="1.3" fill="currentColor" /><path className="slash" d="M3 21 21 3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
        </button>
        <button className="icon-btn" aria-pressed={toggles.sound} aria-label="Sound" onClick={() => api.current?.toggleSound()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" /><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /><path className="slash" d="M3 21 21 3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
        </button>
      </div>

      <section className="sheet side" ref={r.startPanel} hidden={screen !== "start"} aria-labelledby="gameTitle">
          <button className="btn link back" onClick={onExit}>← Edit game</button>
          <h1 className="title" id="gameTitle">{spec.name}</h1>
          <p className="lede">{LEDE[spec.mode]}</p>
          <ul className="legend">
            <li>
              <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="21.6" cy="18.6" r="14.5" fill="none" stroke={C.blue} strokeWidth="2.4" /><circle cx="20" cy="20" r="14.5" fill={C.yellow} stroke={C.navy} strokeWidth="2.4" /><circle cx="20" cy="20" r="6" fill="none" stroke={C.navy} strokeWidth="2" /></svg>
              <span><strong>Yellow dot</strong>Points. Pop {spec.comboPerMult} in a row to raise your multiplier, up to ×{spec.multCap}.</span>
            </li>
            {hasGold && (
              <li>
                <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="14.5" fill={C.green} stroke={C.navy} strokeWidth="2.4" /><path d="M20 11.5V20l6 3.5" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" /></svg>
                <span><strong>Green clock</strong>Big points and {spec.bonusMs / 1000} extra seconds.</span>
              </li>
            )}
            {hasHazards && (
              <li>
                <svg viewBox="0 0 40 40" aria-hidden="true"><defs><clipPath id="hzc"><circle cx="20" cy="20" r="14.5" /></clipPath></defs><circle cx="20" cy="20" r="14.5" fill={C.orange} /><g clipPath="url(#hzc)" stroke={C.navy} strokeWidth="3.6"><path d="M-20 0 20 40M-10 0 30 40M0 0 40 40M10 0 50 40M20 0 60 40" /></g><circle cx="20" cy="20" r="14.5" fill="none" stroke={C.navy} strokeWidth="2.4" /></svg>
                <span><strong>Striped dot</strong>{spec.lives ? "Costs a life" : `Costs ${spec.penaltyMs / 1000} seconds`} and your combo. Keep clear.</span>
              </li>
            )}
          </ul>

          <p className={"status" + (status.error ? " error" : "")}>{status.text}</p>
          <div className="cal" hidden={input !== "camera"}>
            <div className="cal-row"><label htmlFor="sens">Motion sensitivity</label><output htmlFor="sens">{SENS[sens].name}</output></div>
            <input
              type="range" id="sens" min={1} max={5} step={1} value={sens}
              onChange={(e) => {
                const n = Number(e.target.value) as SensLevel;
                setSens(n);
                api.current?.setSens(n);
              }}
            />
            <div className="cal-row"><span className="muted">Movement right now</span></div>
            <div className="meter" ref={r.meter}><span ref={r.meterFill} /></div>
            <p className="cal-note" ref={r.calNote}>Wave at the practice dot to test it. Raise sensitivity if it’s hard to pop, lower it if it pops on its own.</p>
          </div>
          {input === "pointer" && <p className="cal-note" style={{ marginBottom: 14 }}>Sweep your mouse or finger across the practice dot to try it.</p>}

          <div className="actions">
            {input && <button className="btn primary" onClick={() => api.current?.beginCountdown()}>Start round</button>}
            {input !== "camera" && !camBlocked && (
              <button className={input ? "btn link" : "btn primary"} onClick={() => api.current?.startCamera()}>
                {input === "pointer" ? "Use camera instead" : "Turn on camera"}
              </button>
            )}
            {!input && <button className="btn link" onClick={() => api.current?.usePointer()}>Play with mouse or touch</button>}
          </div>

          <div className="progress">
            <div className="rank-row"><span>Best score <strong>{gp.best.toLocaleString()}</strong></span><span className="rk">{rank.name}</span></div>
            <div className="bar"><span style={{ transform: `scaleX(${rank.frac.toFixed(4)})` }} /></div>
            <p className="muted">{rank.next ? `${(rank.next.xp - gp.xp).toLocaleString()} XP to ${rank.next.name}. Every point you score is XP.` : "Top rank reached."}</p>
            <details>
              <summary>Stamp card <span className="muted">{gp.badges.length} of {spec.badges.length}</span></summary>
              <ul className="stamps">{spec.badges.map((b) => <Stamp key={b.id} b={b} got={gp.badges.includes(b.id)} />)}</ul>
            </details>
          </div>
          <p className="fineprint">Video stays on this device. Frames are compared inside the page and never uploaded.</p>
      </section>

      {end && (
        <section className="sheet side" hidden={screen !== "end"} aria-labelledby="endScore">
          {(() => {
            const notes = [];
            if (end.record.isBest && end.stats.score > 0) notes.push("New personal best");
            if (end.record.rankAfter.i > end.record.rankBefore.i) notes.push("Rank up: " + end.record.rankAfter.name);
            return notes.length ? <p className="end-note">{notes.join(". ")}</p> : null;
          })()}
          <h2 className="end-score" id="endScore">{end.stats.score.toLocaleString()}</h2>
          <p className="muted">points this round</p>
          <dl className="stats">
            <div><dt>{spec.mode === "survival" ? "Survived" : "Accuracy"}</dt><dd>{spec.mode === "survival" ? `${Math.floor(end.stats.survivedMs / 1000)}s` : shots ? Math.round((end.stats.hits / shots) * 100) + "%" : "–"}</dd></div>
            <div><dt>Best combo</dt><dd>{end.stats.maxCombo}</dd></div>
            <div><dt>Level</dt><dd>{end.stats.level}</dd></div>
            <div><dt>Dots popped</dt><dd>{end.stats.popped}</dd></div>
          </dl>
          {end.newBadges.length > 0 && (
            <div>
              <p style={{ margin: "0 0 4px", fontWeight: 700 }}>New stamps</p>
              <ul className="stamps" style={{ marginBottom: 16 }}>{end.newBadges.map((b) => <Stamp key={b.id} b={b} got />)}</ul>
            </div>
          )}
          <div className="progress" style={{ borderTop: 0, paddingTop: 0, marginBottom: 18 }}>
            <div className="rank-row"><span className="rk">{end.record.rankAfter.name}</span><span>+{end.stats.score.toLocaleString()} XP</span></div>
            <div className="bar"><span style={{ transform: `scaleX(${end.record.rankAfter.frac.toFixed(4)})` }} /></div>
            <p className="muted">{end.record.rankAfter.next ? `${(end.record.rankAfter.next.xp - gp.xp).toLocaleString()} XP to ${end.record.rankAfter.next.name}` : "Top rank reached."}</p>
          </div>
          <div className="actions" style={{ marginBottom: 0 }}>
            <button className="btn primary" id="againBtn" onClick={() => api.current?.beginCountdown()}>Play again</button>
            <button className="btn link" onClick={() => api.current?.toMenu()}>Settings and stamps</button>
            <button className="btn link" onClick={onExit}>Edit game</button>
          </div>
        </section>
      )}

      <section className="sheet center" hidden={screen !== "paused"} role="dialog" aria-labelledby="pauseTitle">
        <h2 className="panel-title" id="pauseTitle">Paused</h2>
        <p className="muted" style={{ marginBottom: 16 }}>Your score and time are frozen.</p>
        <div className="actions">
          <button className="btn primary" id="resumeBtn" onClick={() => api.current?.resume()}>Resume</button>
          <button className="btn link" onClick={() => api.current?.quit()}>End round</button>
        </div>
      </section>

      <div className="sr-only" ref={r.live} role="status" aria-live="polite" />
    </main>
  );
}
