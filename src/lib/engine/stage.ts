import { PALETTES, type BadgeDef, type GameSpec } from "../spec";
import { cameraGate } from "./camera";
import { Fx } from "./fx";
import { Game, type GameEvent, type Layout, type Region, type RoundStats, type Target } from "./game";
import { Motion, SENS, captureFrame, type Pt, type SensLevel } from "./motion";
import { browserStorage, gameProgress, newlyEarned, recordRound, writeSave, type RoundRecord, type SaveData } from "./progress";
import { DISPLAY_FONT, renderFrame } from "./render";
import { createSfx } from "./sfx";

/*
 * Browser glue for one game: camera/pointer input, the frame loop, HUD text and
 * effects. Ported from Flicker's IIFE. React owns the panels; this owns the canvas,
 * the HUD and every per-frame update, so React never re-renders during play.
 */

export type Screen = "start" | "countdown" | "playing" | "paused" | "over" | "end";
export type InputKind = "camera" | "pointer" | null;
export type EndData = { stats: RoundStats; record: RoundRecord; newBadges: BadgeDef[] };

export type StageEls = {
  stage: HTMLElement; video: HTMLVideoElement; canvas: HTMLCanvasElement; hud: HTMLElement; pauseBtn: HTMLElement;
  score: HTMLElement; level: HTMLElement; time: HTMLElement; timeLabel: HTMLElement; timeBar: HTMLElement; timeTag: HTMLElement;
  mult: HTMLElement; combo: HTMLElement; comboTag: HTMLElement;
  count: HTMLElement; banner: HTMLElement; flash: HTMLElement; live: HTMLElement; toasts: HTMLElement;
  meter: HTMLElement; meterFill: HTMLElement; calNote: HTMLElement;
  startPanel: () => HTMLElement | null;
};

export type StageUi = {
  screen(s: Screen): void;
  ended(d: EndData): void;
  input(k: InputKind, camBlocked: boolean): void;
  status(text: string, error?: boolean): void;
  hint(on: boolean): void;
  toggles(trails: boolean, sound: boolean): void;
};

export type StageApi = ReturnType<typeof createStage>;

const CHECK_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17 19 7" stroke="#1D2340" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CAL_NOTE = "Wave at the practice dot to test it. Raise sensitivity if it’s hard to pop, lower it if it pops on its own.";

export function createStage(els: StageEls, spec: GameSpec, save: SaveData, ui: StageUi) {
  const storage = browserStorage();
  const persist = () => writeSave(storage, save);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const C = PALETTES[spec.theme];
  const sfx = createSfx(() => save.sound);
  const motion = new Motion(128);
  const fx = new Fx(reduceMotion);
  const L: Layout = { CW: 1, CH: 1, ox: 0, oy: 0, dw: 1, dh: 1, hudBottom: 12 };
  const game = new Game(spec, L);
  const ctx = els.canvas.getContext("2d")!;
  const pctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const gp = gameProgress(save, spec.id);
  const sensLevel = (): SensLevel => save.sens ?? spec.sensDefault;
  const fmt = (n: number) => Math.round(n).toLocaleString();
  const font = getComputedStyle(els.stage).getPropertyValue("--display").trim() || DISPLAY_FONT;

  let input: InputKind = null;
  let camBlocked = false;
  let stream: MediaStream | null = null;
  const camGate = cameraGate();
  let dpr = 1;
  let raf = 0;
  let lastT = performance.now();
  let procAcc = 0;
  let newVideoFrame = false;
  let rvfc = false;
  let hudDirty = true;
  let noisyFor = 0;
  let hintShown = false;
  let meterNoisy: boolean | null = null;
  let roundBadges: BadgeDef[] = [];
  let destroyed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!destroyed) fn();
    }, ms);
    timers.add(id);
  };

  // ---------------------------------------------------------------- layout
  function measureHud() {
    if (els.hud.hidden) {
      L.hudBottom = 12;
      return;
    }
    const sr = els.stage.getBoundingClientRect(), hr = els.hud.getBoundingClientRect();
    L.hudBottom = hr.bottom - sr.top + 10;
  }

  function layout() {
    const r = els.stage.getBoundingClientRect();
    L.CW = Math.max(1, r.width);
    L.CH = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    els.canvas.width = Math.round(L.CW * dpr);
    els.canvas.height = Math.round(L.CH * dpr);
    let vw = L.CW, vh = L.CH;
    if (input === "camera" && els.video.videoWidth) {
      vw = els.video.videoWidth;
      vh = els.video.videoHeight;
    }
    const s = Math.max(L.CW / vw, L.CH / vh);
    L.dw = vw * s;
    L.dh = vh * s;
    L.ox = (L.CW - L.dw) / 2;
    L.oy = (L.CH - L.dh) / 2;
    const wantPH = Math.max(40, Math.round((motion.PW * vh) / vw));
    if (wantPH !== motion.PH) motion.alloc(vh / vw);
    measureHud();
    if (game.phase === "idle") game.clearPractice(); // the practice dot may now sit under the panel
  }

  function practiceRegion(r: number): Region | null {
    const panel = els.startPanel();
    if (!panel) return null;
    const sr = els.stage.getBoundingClientRect(), pr = panel.getBoundingClientRect();
    const pRight = pr.right - sr.left, pTop = pr.top - sr.top;
    if (L.CW - pRight > 2 * r + 70) return { x0: pRight + r + 36, x1: L.CW - r - 30, y0: r + 30, y1: L.CH - r - 80 };
    if (pTop > 2 * r + 50) return { x0: r + 24, x1: L.CW - r - 24, y0: r + 20, y1: pTop - r - 20 };
    return null;
  }

  // ---------------------------------------------------------------- effects
  const restart = (el: HTMLElement, cls: string) => {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  };
  function kick() {
    restart(els.flash, "on");
    if (!reduceMotion) restart(els.stage, "shake");
  }
  function showCount(text: string, word: boolean) {
    els.count.textContent = text;
    els.count.classList.toggle("word", word);
    restart(els.count, "pop");
  }
  function showBanner(text: string) {
    els.banner.textContent = text;
    restart(els.banner, "show");
  }
  function announce(msg: string) {
    els.live.textContent = "";
    later(() => (els.live.textContent = msg), 30);
  }
  function toast(b: BadgeDef) {
    const el = document.createElement("div");
    el.className = "toast";
    const mark = document.createElement("span");
    mark.className = "stamp-mark got";
    mark.innerHTML = CHECK_SVG;
    const txt = document.createElement("span");
    const s = document.createElement("strong");
    s.textContent = "Stamp earned: " + b.name;
    const d = document.createElement("span");
    d.className = "d";
    d.textContent = b.desc;
    txt.append(s, d);
    el.append(mark, txt);
    els.toasts.append(el);
    later(() => {
      el.classList.add("out");
      later(() => el.remove(), 320);
    }, 3200);
  }
  function setHint(on: boolean) {
    if (on !== hintShown) {
      hintShown = on;
      ui.hint(on);
    }
  }

  // ---------------------------------------------------------------- events
  function checkBadges() {
    for (const b of newlyEarned(spec.badges, gp.badges, game.stats(), gp.rounds, false)) {
      gp.badges.push(b.id);
      roundBadges.push(b);
      persist();
      toast(b);
      sfx.badge();
      announce(`Stamp earned: ${b.name}`);
    }
  }

  function handle(evs: GameEvent[]) {
    for (const e of evs) {
      switch (e.type) {
        case "count":
          showCount(e.text, e.go);
          sfx.count(e.go);
          if (e.go) {
            motion.frames = 0;
            els.pauseBtn.hidden = false;
            ui.screen("playing");
          }
          break;
        case "practiceHit":
          fx.burst(e.x, e.y, [C.yellow, C.pink, C.navy], 16);
          fx.floater(e.x, e.y, "Nice", C.navy, 30);
          sfx.pop(4);
          break;
        case "hit":
          if (e.kind === "gold") {
            fx.burst(e.x, e.y, [C.green, C.yellow, C.white], 24);
            fx.floater(e.x, e.y - 26, `+${spec.bonusMs / 1000}s`, C.green, 30);
            sfx.gold();
          } else {
            if (e.quick) fx.floater(e.x, e.y - 30, "Quick", C.blue, 22);
            fx.burst(e.x, e.y, [C.yellow, C.pink, C.navy], 16);
            sfx.pop(e.combo);
          }
          fx.floater(e.x, e.y, "+" + e.pts, C.navy, 36);
          if (e.multUp) restart(els.comboTag, "pulse");
          hudDirty = true;
          checkBadges();
          break;
        case "hazard":
          fx.burst(e.x, e.y, [C.orange, C.navy], 22);
          fx.floater(e.x, e.y, e.lifeLost ? "−1 life" : `−${spec.penaltyMs / 1000}s`, C.orange, 40);
          sfx.hazard();
          kick();
          hudDirty = true;
          break;
        case "miss":
          if (e.comboLost) fx.floater(e.x, e.y, "Combo lost", C.navy, 24);
          if (e.lifeLost) fx.floater(e.x, e.y + 30, "−1 life", C.orange, 28);
          sfx.miss();
          hudDirty = true;
          break;
        case "level":
          showBanner("Level " + e.level);
          sfx.level();
          announce("Level " + e.level);
          break;
        case "tick":
          sfx.tick();
          break;
        case "end":
          finishRound(e.reason);
          break;
      }
    }
  }

  function finishRound(reason: "time" | "lives" | "quit") {
    els.pauseBtn.hidden = true;
    setHint(false);
    hudDirty = true;
    const stats = game.stats();
    const record = recordRound(save, spec, stats);
    persist();
    sfx.end();
    ui.screen("over");
    showCount(reason === "lives" ? "Out of lives" : reason === "time" ? "Time’s up" : "Round over", true);
    const newBadges = [...roundBadges, ...record.newBadges];
    later(() => {
      if (game.phase !== "over") return;
      els.hud.hidden = true;
      ui.ended({ stats, record, newBadges });
      ui.screen("end");
      announce(`Round over. ${fmt(stats.score)} points.`);
    }, 1000);
  }

  // ---------------------------------------------------------------- motion
  const coverage = (t: Target) => motion.coverage(t.x * motion.PW, t.y * motion.PH, (game.rDisp(t) / (L.dw / motion.PW)) * 0.9);

  function updateMeter() {
    els.meterFill.style.transform = `scaleX(${Math.min(1, motion.global / 0.12).toFixed(3)})`;
    const noisy = motion.noisy;
    if (noisy !== meterNoisy) {
      meterNoisy = noisy;
      els.meter.classList.toggle("noisy", noisy);
      els.calNote.textContent = noisy ? "Too much is moving at once. Keep the camera still and check the lighting." : CAL_NOTE;
    }
  }

  function motionTick() {
    const cam = input === "camera";
    if (cam && game.phase === "idle") updateMeter();
    const noisy = cam && motion.noisy;
    if (game.phase === "playing") {
      noisyFor = noisy ? noisyFor + 33 : 0;
      setHint(noisyFor > 700);
    }
    handle(game.motion(coverage, SENS[sensLevel()].ratio, noisy || motion.frames < 3));
  }

  // pointer input writes into the same mask
  let pts: Pt[] = [];
  let lastPt: Pt | null = null;
  const toProc = (e: PointerEvent): Pt => {
    const r = els.stage.getBoundingClientRect();
    return { x: ((e.clientX - r.left - L.ox) / L.dw) * motion.PW, y: ((e.clientY - r.top - L.oy) / L.dh) * motion.PH };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (input === "pointer") pts.push(toProc(e));
  };
  const onPointerDown = (e: PointerEvent) => {
    if (input === "pointer") {
      lastPt = null;
      pts.push(toProc(e));
    }
  };
  const onPointerLeave = () => (lastPt = null);

  // ---------------------------------------------------------------- HUD + loop
  function drawHud() {
    hudDirty = false;
    els.score.textContent = fmt(game.score);
    els.level.textContent = "Level " + game.level;
    if (game.timeLeft !== null) {
      const sec = Math.max(0, Math.ceil(game.timeLeft / 1000));
      els.time.textContent = String(sec);
      els.timeTag.classList.toggle("low", game.phase === "playing" && sec <= 10);
    } else {
      els.time.textContent = String(game.lives ?? 0);
      els.timeTag.classList.toggle("low", game.phase === "playing" && (game.lives ?? 0) <= 1);
    }
    els.mult.textContent = "×" + game.multiplier();
    els.combo.textContent = game.combo === 0 ? `Pop ${spec.comboPerMult} in a row for ×2` : `${game.combo} in a row`;
  }

  let lastShownSec = -1;
  function frame(t: number) {
    const dt = Math.min(64, t - lastT);
    lastT = t;
    if (input === "camera") {
      if (!rvfc) {
        procAcc += dt;
        if (procAcc >= 33) {
          procAcc = 0;
          newVideoFrame = true;
        }
      }
      if (newVideoFrame && els.video.readyState >= 2 && els.video.videoWidth) {
        newVideoFrame = false;
        motion.diffRGBA(captureFrame(els.video, pctx, motion.PW, motion.PH), SENS[sensLevel()].diff);
        motionTick();
      }
    } else if (input === "pointer") {
      procAcc += dt;
      if (procAcc >= 33) {
        procAcc = 0;
        motion.stampPath(pts, lastPt);
        if (pts.length) lastPt = pts[pts.length - 1];
        pts = [];
        motionTick();
      }
    }

    handle(game.step(dt));
    if (game.phase === "idle" && input) game.idle(practiceRegion);
    if (game.phase !== "paused") fx.update(dt);
    renderFrame(ctx, game, motion, fx, C, L, { dpr, trails: save.trails && input !== null, font });
    if (game.phase === "playing" && game.timeLeft !== null && spec.roundMs) {
      els.timeBar.style.transform = `scaleX(${Math.min(1, Math.max(0, game.timeLeft / spec.roundMs)).toFixed(4)})`;
      const sec = Math.ceil(game.timeLeft / 1000);
      if (sec !== lastShownSec) {
        lastShownSec = sec;
        hudDirty = true;
      }
    }
    if (hudDirty) drawHud();
    raf = requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- camera
  const inFrame = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  function policyBlocksCamera(): boolean | null {
    try {
      const d = document as unknown as { permissionsPolicy?: { allowsFeature(f: string): boolean }; featurePolicy?: { allowsFeature(f: string): boolean } };
      const fp = d.permissionsPolicy ?? d.featurePolicy;
      if (fp && typeof fp.allowsFeature === "function") return !fp.allowsFeature("camera");
    } catch {
      /* unknown */
    }
    return null;
  }
  async function cameraPermission() {
    try {
      return (await navigator.permissions.query({ name: "camera" as PermissionName })).state;
    } catch {
      return null;
    }
  }
  function showBlocked() {
    camBlocked = true;
    ui.status("This page is embedded somewhere that doesn’t allow the camera. Open it in its own browser tab to use your camera, or play with mouse or touch here.", true);
    ui.input(input, camBlocked);
  }

  async function startCamera() {
    sfx.unlock();
    if (!navigator.mediaDevices?.getUserMedia) {
      ui.status("This browser can’t open a camera on this page. Try a current Chrome, Edge, Safari or Firefox over https, or play with mouse or touch.", true);
      return;
    }
    if (policyBlocksCamera() === true) return showBlocked();
    const token = camGate.begin();
    if (token === null) return; // already waiting for permission
    ui.status("Waiting for camera permission…");
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      if (!camGate.settle(token, next)) return; // the player moved on; the late stream was stopped
      stopStream();
      stream = next;
      els.video.srcObject = stream;
      await els.video.play().catch(() => {});
      if (!els.video.videoWidth) await new Promise((res) => els.video.addEventListener("loadedmetadata", res, { once: true }));
      if (!camGate.isCurrent(token)) return; // switched to pointer or left while the video started
      input = "camera";
      if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
        rvfc = true;
        const onFrame = () => {
          newVideoFrame = true;
          if (!destroyed) els.video.requestVideoFrameCallback(onFrame);
        };
        els.video.requestVideoFrameCallback(onFrame);
      }
      els.video.addEventListener("resize", layout);
      ui.input(input, camBlocked);
      layout();
      ui.status("Camera is on. Your movement shows up as pink dots.");
    } catch (err) {
      const stale = !camGate.isCurrent(token);
      camGate.settle(token, null);
      if (stale) return;
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        const state = await cameraPermission();
        if (state === "denied") ui.status("The camera is turned off for this site. Allow it from the camera or lock icon in the address bar, then press Turn on camera again.", true);
        else if (inFrame) showBlocked();
        else ui.status("Camera access was refused. Allow the camera from the address bar and try again, or play with mouse or touch.", true);
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        ui.status("No camera was found. Connect one and try again, or play with mouse or touch.", true);
      } else if (name === "NotReadableError") {
        ui.status("The camera is in use by another app. Close it there and try again.", true);
      } else {
        ui.status("The camera didn’t start. Try again, or play with mouse or touch.", true);
      }
    }
  }

  function stopStream() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  function usePointer() {
    sfx.unlock();
    camGate.cancel();
    stopStream();
    input = "pointer";
    ui.input(input, camBlocked);
    layout();
    ui.status("Mouse and touch mode. Your pointer paints the pink dots the camera would.");
  }

  // ---------------------------------------------------------------- flow
  function beginCountdown() {
    sfx.unlock();
    if (!input) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    roundBadges = [];
    fx.clear();
    els.hud.hidden = false;
    els.timeLabel.textContent = spec.roundMs ? "" : "lives";
    els.timeBar.parentElement!.hidden = !spec.roundMs;
    els.timeBar.style.transform = "scaleX(1)";
    ui.screen("countdown");
    handle(game.beginCountdown());
    measureHud();
    hudDirty = true;
  }
  function pause() {
    if (game.phase !== "playing") return;
    game.pause();
    ui.screen("paused");
  }
  function resume() {
    if (game.phase !== "paused") return;
    motion.frames = 0; // re-prime the diff so a stale frame can't fire hits
    game.resume();
    ui.screen("playing");
    (document.activeElement as HTMLElement | null)?.blur?.();
  }
  function quit() {
    handle(game.end("quit"));
  }
  function toMenu() {
    game.toIdle();
    els.hud.hidden = true;
    els.pauseBtn.hidden = true;
    setHint(false);
    measureHud();
    ui.screen("start");
  }

  // ---------------------------------------------------------------- settings
  function setSens(n: SensLevel) {
    save.sens = n;
    persist();
  }
  function toggleTrails() {
    save.trails = !save.trails;
    persist();
    ui.toggles(save.trails, save.sound);
  }
  function toggleSound() {
    save.sound = !save.sound;
    persist();
    ui.toggles(save.trails, save.sound);
    if (save.sound) sfx.unlock();
  }

  // ---------------------------------------------------------------- wiring
  const onKey = (e: KeyboardEvent) => {
    const inField = (e.target as HTMLElement | null)?.closest?.("input, textarea, select");
    if (e.key === " " || e.key === "p" || e.key === "P" || e.key === "Escape") {
      if (game.phase === "playing") {
        e.preventDefault();
        return pause();
      }
      if (game.phase === "paused" && e.key !== "Escape" && !(e.key === " " && (e.target as HTMLElement | null)?.tagName === "BUTTON")) {
        e.preventDefault();
        return resume();
      }
    }
    if ((e.key === "m" || e.key === "M") && !inField) toggleTrails();
  };
  const onVisibility = () => {
    if (document.hidden) pause();
    else {
      motion.frames = 0;
      lastT = performance.now();
    }
  };
  els.stage.addEventListener("pointermove", onPointerMove);
  els.stage.addEventListener("pointerdown", onPointerDown);
  els.stage.addEventListener("pointerleave", onPointerLeave);
  window.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVisibility);
  const ro = new ResizeObserver(() => layout());
  ro.observe(els.stage);

  els.hud.hidden = true;
  els.pauseBtn.hidden = true;
  if (policyBlocksCamera() === true) showBlocked();
  layout();
  game.toIdle();
  drawHud();
  ui.toggles(save.trails, save.sound);
  raf = requestAnimationFrame((t) => {
    lastT = t;
    raf = requestAnimationFrame(frame);
  });

  function destroy() {
    destroyed = true;
    camGate.cancel();
    cancelAnimationFrame(raf);
    for (const id of timers) clearTimeout(id);
    ro.disconnect();
    els.stage.removeEventListener("pointermove", onPointerMove);
    els.stage.removeEventListener("pointerdown", onPointerDown);
    els.stage.removeEventListener("pointerleave", onPointerLeave);
    els.video.removeEventListener("resize", layout);
    window.removeEventListener("keydown", onKey);
    document.removeEventListener("visibilitychange", onVisibility);
    stopStream();
  }

  return { startCamera, usePointer, beginCountdown, pause, resume, quit, toMenu, setSens, toggleTrails, toggleSound, sensLevel, destroy };
}
