import type { GameSpec } from "../spec";

/*
 * Round rules, ported from Flicker with every constant taken from the GameSpec.
 * No DOM and no drawing: the stage feeds in time, layout and motion, and turns
 * the returned events into sound, particles and HUD updates.
 */

/** Display-space layout. The video is drawn at (ox, oy) with size dw×dh (object-fit: cover). */
export type Layout = { CW: number; CH: number; ox: number; oy: number; dw: number; dh: number; hudBottom: number };
export type Region = { x0: number; x1: number; y0: number; y1: number };

export type TargetKind = "orb" | "gold" | "hazard";
export type Target = {
  id: number;
  kind: TargetKind;
  practice: boolean;
  rf: number; // radius as a fraction of min(CW, CH)
  x: number; // 0..1 across the displayed video
  y: number;
  born: number;
  armAt: number;
  dieAt: number;
  state: "live" | "hit" | "gone";
  goneAt: number;
  hot: number; // consecutive motion frames over the threshold
};

export type Phase = "idle" | "countdown" | "playing" | "paused" | "over";

export type GameEvent =
  | { type: "count"; text: string; go: boolean }
  | { type: "hit"; kind: "orb" | "gold"; x: number; y: number; pts: number; quick: boolean; multUp: boolean; combo: number }
  | { type: "practiceHit"; x: number; y: number }
  | { type: "hazard"; x: number; y: number; lifeLost: boolean }
  | { type: "miss"; x: number; y: number; comboLost: boolean; lifeLost: boolean }
  | { type: "level"; level: number }
  | { type: "tick" }
  | { type: "end"; reason: "time" | "lives" | "quit" };

export type RoundStats = {
  score: number; hits: number; misses: number; maxCombo: number; quick: number; goldHits: number;
  hazardHits: number; level: number; popped: number; survivedMs: number; accuracy: number;
};

export const MAX_DT = 64;
const ARM_MS = 320;
const FADE_MS = 450;
const QUICK_MS = 550;
const COUNT_STEP_MS = 800;

export class Game {
  readonly spec: GameSpec;
  private rng: () => number;
  layout: Layout;

  phase: Phase = "idle";
  clock = 0;
  targets: Target[] = [];
  private seq = 0;
  private practiceAt = 0;
  private cd = 0;
  private cdT = 0;

  score = 0; combo = 0; maxCombo = 0; hits = 0; misses = 0; popped = 0; quick = 0;
  goldHits = 0; hazardHits = 0; level = 1; survivedMs = 0;
  timeLeft: number | null = null;
  lives: number | null = null;
  private spawnIn = 0;
  private lastSec = 0;

  constructor(spec: GameSpec, layout: Layout, rng: () => number = Math.random) {
    this.spec = spec;
    this.layout = layout;
    this.rng = rng;
    this.resetRound();
  }

  setLayout(l: Layout) {
    this.layout = l;
  }

  resetRound() {
    Object.assign(this, {
      targets: [], score: 0, combo: 0, maxCombo: 0, hits: 0, misses: 0, popped: 0, quick: 0,
      goldHits: 0, hazardHits: 0, level: 1, survivedMs: 0, spawnIn: 500,
      timeLeft: this.spec.roundMs, lives: this.spec.lives,
      lastSec: this.spec.roundMs ? Math.ceil(this.spec.roundMs / 1000) + 1 : 0,
    });
  }

  // ---- geometry
  dispX = (t: Target) => this.layout.ox + t.x * this.layout.dw;
  dispY = (t: Target) => this.layout.oy + t.y * this.layout.dh;
  rDisp = (t: Target) => t.rf * Math.min(this.layout.CW, this.layout.CH);

  // ---- rules
  multiplier() {
    return Math.min(this.spec.multCap, 1 + Math.floor(this.combo / this.spec.comboPerMult));
  }

  levelCfg(L: number) {
    const c = this.spec.level;
    return {
      interval: Math.max(c.intervalMin, c.interval0 - (L - 1) * c.intervalStep),
      maxLive: Math.min(c.maxLiveCap, c.maxLive0 + Math.floor(L / 2)),
      life: Math.max(c.lifeMin, c.life0 - (L - 1) * c.lifeStep),
      size: Math.max(c.sizeMin, c.size0 - (L - 1) * c.sizeStep),
      hazard: L < c.hazardStartLevel ? 0 : Math.min(c.hazardMax, c.hazard0 + (L - c.hazardStartLevel) * c.hazardStep),
      gold: this.spec.goldRate,
    };
  }

  // ---- flow
  toIdle() {
    this.phase = "idle";
    this.targets = [];
    this.practiceAt = this.clock + 300;
  }

  beginCountdown(): GameEvent[] {
    this.resetRound();
    this.phase = "countdown";
    this.cd = 3;
    this.cdT = 0;
    return [{ type: "count", text: "3", go: false }];
  }

  pause() {
    if (this.phase === "playing") this.phase = "paused";
  }

  resume() {
    if (this.phase !== "paused") return;
    for (const t of this.targets) t.hot = 0;
    this.phase = "playing";
  }

  end(reason: "time" | "lives" | "quit"): GameEvent[] {
    if (this.phase !== "playing" && this.phase !== "paused") return [];
    this.phase = "over";
    if (this.timeLeft !== null) this.timeLeft = Math.max(0, this.timeLeft);
    for (const t of this.targets)
      if (t.state === "live") {
        t.state = "gone";
        t.goneAt = this.clock;
      }
    return [{ type: "end", reason }];
  }

  /** Advance time. `dt` is clamped so a long stall (tab switch, debugger) can't skip the round. */
  step(rawDt: number): GameEvent[] {
    const dt = Math.min(MAX_DT, Math.max(0, rawDt));
    if (this.phase === "paused") return [];
    this.clock += dt;
    if (this.phase === "countdown") return this.tickCountdown(dt);
    if (this.phase === "playing") return this.update(dt);
    if (this.phase === "over") this.targets = this.targets.filter((t) => this.clock - t.goneAt < FADE_MS);
    return [];
  }

  private tickCountdown(dt: number): GameEvent[] {
    this.cdT += dt;
    if (this.cdT < COUNT_STEP_MS) return [];
    this.cdT = 0;
    this.cd--;
    if (this.cd > 0) return [{ type: "count", text: String(this.cd), go: false }];
    this.phase = "playing";
    return [{ type: "count", text: "Go", go: true }];
  }

  private update(dt: number): GameEvent[] {
    const ev: GameEvent[] = [];
    this.survivedMs += dt;
    if (this.timeLeft !== null) {
      this.timeLeft -= dt;
      const sec = Math.max(0, Math.ceil(this.timeLeft / 1000));
      if (sec !== this.lastSec) {
        if (sec <= 5 && sec > 0 && sec < this.lastSec) ev.push({ type: "tick" });
        this.lastSec = sec;
      }
      if (this.timeLeft <= 0) return [...ev, ...this.end("time")];
    }

    for (const t of this.targets) {
      if (t.state === "live" && this.clock >= t.dieAt) {
        t.state = "gone";
        t.goneAt = this.clock;
        if (t.kind === "orb" && !t.practice) ev.push(...this.miss(t));
        if (this.phase !== "playing") return ev;
      }
    }
    this.targets = this.targets.filter((t) => t.state === "live" || this.clock - t.goneAt < FADE_MS);

    const cfg = this.levelCfg(this.level);
    const live = this.targets.filter((t) => t.state === "live");
    const good = live.filter((t) => t.kind !== "hazard").length;
    this.spawnIn -= dt;
    if (good === 0 && this.spawnIn > 350) this.spawnIn = 350; // never leave the player with nothing to hit
    if (this.spawnIn <= 0) {
      if (live.length < cfg.maxLive) this.spawn(cfg, good === 0);
      this.spawnIn = cfg.interval * (0.75 + this.rng() * 0.5);
    }
    return ev;
  }

  /** Idle screen: keep one practice dot alive inside the region the panel leaves free. */
  idle(regionFor: (r: number) => Region | null) {
    if (this.phase !== "idle") return;
    this.targets = this.targets.filter((t) => t.state === "live" || this.clock - t.goneAt < FADE_MS);
    if (this.targets.some((t) => t.practice && t.state === "live") || this.clock < this.practiceAt) return;
    const rf = 0.075;
    const reg = regionFor(rf * Math.min(this.layout.CW, this.layout.CH));
    if (!reg || reg.x1 < reg.x0 || reg.y1 < reg.y0) {
      this.practiceAt = this.clock + 1000;
      return;
    }
    const dx = reg.x0 + this.rng() * (reg.x1 - reg.x0);
    const dy = reg.y0 + this.rng() * (reg.y1 - reg.y0);
    this.targets.push(this.makeTarget("orb", dx, dy, rf, Infinity, true));
  }

  /** Drop practice dots, e.g. after a resize put them under the panel. */
  clearPractice() {
    this.targets = this.targets.filter((t) => !t.practice);
    this.practiceAt = this.clock + 250;
  }

  private makeTarget(kind: TargetKind, dx: number, dy: number, rf: number, life: number, practice: boolean): Target {
    const L = this.layout;
    return {
      id: ++this.seq, kind, practice, rf,
      x: (dx - L.ox) / L.dw, y: (dy - L.oy) / L.dh,
      born: this.clock, armAt: this.clock + ARM_MS, dieAt: this.clock + ARM_MS + life,
      state: "live", goneAt: 0, hot: 0,
    };
  }

  /** 0..1 along an axis; with edgeBias, part of the picks land in the outer quarter on either side. */
  private axis() {
    if (this.spec.edgeBias > 0 && this.rng() < this.spec.edgeBias) {
      const u = this.rng() * 0.25;
      return this.rng() < 0.5 ? u : 1 - u;
    }
    return this.rng();
  }

  private spawn(cfg: ReturnType<Game["levelCfg"]>, forceOrb: boolean) {
    let kind: TargetKind = "orb";
    if (!forceOrb) {
      const roll = this.rng();
      if (roll < cfg.hazard) kind = "hazard";
      else if (roll < cfg.hazard + cfg.gold) kind = "gold";
    }
    const L = this.layout;
    const rf = 0.085 * cfg.size * this.spec.targetScale * (kind === "gold" ? 0.85 : 1);
    const r = rf * Math.min(L.CW, L.CH);
    const left = r + 16, right = L.CW - r - 16;
    const top = L.hudBottom + r + 6, bottom = L.CH - r - 68;
    if (right <= left || bottom <= top) return;
    for (let k = 0; k < 14; k++) {
      const dx = left + this.axis() * (right - left);
      const dy = top + this.axis() * (bottom - top);
      const clear = this.targets.every(
        (o) => o.state !== "live" || Math.hypot(this.dispX(o) - dx, this.dispY(o) - dy) > this.rDisp(o) + r + 24,
      );
      if (clear) {
        const life = kind === "hazard" ? cfg.life * 1.25 : kind === "gold" ? cfg.life * 0.8 : cfg.life;
        this.targets.push(this.makeTarget(kind, dx, dy, rf, life, false));
        return;
      }
    }
  }

  /**
   * Feed one motion frame. `coverage(t)` is the share of t's circle that moved;
   * `blocked` is true while the frame is too noisy or the diff isn't primed yet.
   */
  motion(coverage: (t: Target) => number, ratio: number, blocked: boolean): GameEvent[] {
    if (this.phase !== "playing" && this.phase !== "idle") return [];
    if (blocked) {
      for (const t of this.targets) t.hot = 0;
      return [];
    }
    const ev: GameEvent[] = [];
    for (const t of this.targets) {
      if (t.state !== "live" || this.clock < t.armAt) continue;
      if (this.phase === "idle" && !t.practice) continue;
      t.hot = coverage(t) > ratio ? t.hot + 1 : 0;
      // hazards need 2 frames: forgiving for good things, strict for bad ones
      if (t.hot >= (t.kind === "hazard" ? 2 : 1)) ev.push(...this.hit(t));
      if (this.phase !== "playing" && this.phase !== "idle") break;
    }
    return ev;
  }

  hit(t: Target): GameEvent[] {
    t.state = "hit";
    t.goneAt = this.clock;
    const x = this.dispX(t), y = this.dispY(t);
    if (t.practice) {
      this.practiceAt = this.clock + 650;
      return [{ type: "practiceHit", x, y }];
    }
    if (t.kind === "hazard") {
      this.hazardHits++;
      this.combo = 0;
      if (this.timeLeft !== null) this.timeLeft = Math.max(0, this.timeLeft - this.spec.penaltyMs);
      const lifeLost = this.loseLife();
      const ev: GameEvent[] = [{ type: "hazard", x, y, lifeLost }];
      if (this.lives === 0) ev.push(...this.end("lives"));
      return ev;
    }
    const before = this.multiplier();
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.popped++;
    this.hits++;
    const mult = this.multiplier();
    let pts: number;
    let quick = false;
    if (t.kind === "gold") {
      pts = 50 * mult;
      this.goldHits++;
      if (this.timeLeft !== null) this.timeLeft += this.spec.bonusMs;
    } else {
      pts = 10 * mult;
      if (this.clock - t.armAt < QUICK_MS) {
        pts += 5;
        this.quick++;
        quick = true;
      }
    }
    this.score += pts;
    const ev: GameEvent[] = [{ type: "hit", kind: t.kind, x, y, pts, quick, multUp: mult > before, combo: this.combo }];
    const newLevel = Math.min(this.spec.level.maxLevel, 1 + Math.floor(this.popped / this.spec.level.popsPerLevel));
    if (newLevel > this.level) {
      this.level = newLevel;
      ev.push({ type: "level", level: newLevel });
    }
    return ev;
  }

  private miss(t: Target): GameEvent[] {
    if (!this.spec.countMisses) return [];
    this.misses++;
    const comboLost = this.combo >= 3;
    this.combo = 0;
    const lifeLost = this.loseLife();
    const ev: GameEvent[] = [{ type: "miss", x: this.dispX(t), y: this.dispY(t), comboLost, lifeLost }];
    if (this.lives === 0) ev.push(...this.end("lives"));
    return ev;
  }

  private loseLife() {
    if (this.lives === null) return false;
    this.lives = Math.max(0, this.lives - 1);
    return true;
  }

  stats(): RoundStats {
    const shots = this.hits + this.misses;
    return {
      score: this.score, hits: this.hits, misses: this.misses, maxCombo: this.maxCombo, quick: this.quick,
      goldHits: this.goldHits, hazardHits: this.hazardHits, level: this.level, popped: this.popped,
      survivedMs: Math.round(this.survivedMs),
      accuracy: shots >= 10 ? Math.round((this.hits / shots) * 100) : 0,
    };
  }
}
