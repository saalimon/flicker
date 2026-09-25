/*
 * Confetti particles and floating score text, ported from Flicker.
 */

const TAU = Math.PI * 2;

export type Particle = {
  x: number; y: number; vx: number; vy: number; life: number; max: number;
  size: number; rot: number; vr: number; color: string; sq: boolean;
};
export type Floater = { x: number; y: number; text: string; color: string; size: number; life: number; max: number };

export class Fx {
  parts: Particle[] = [];
  floats: Floater[] = [];
  constructor(private reduceMotion = false, private rng: () => number = Math.random) {}

  burst(x: number, y: number, colors: string[], n: number) {
    if (this.reduceMotion) n = Math.ceil(n / 3);
    const r = this.rng;
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, sp = 140 + r() * 260;
      this.parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90, life: 0, max: 450 + r() * 350,
        size: 4 + r() * 7, rot: r() * TAU, vr: (r() - 0.5) * 12, color: colors[i % colors.length], sq: r() < 0.5,
      });
    }
  }

  floater(x: number, y: number, text: string, color: string, size: number) {
    this.floats.push({ x, y, text, color, size, life: 0, max: 900 });
  }

  update(dt: number) {
    const s = dt / 1000;
    for (const p of this.parts) {
      p.life += dt;
      p.vy += 700 * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.rot += p.vr * s;
    }
    this.parts = this.parts.filter((p) => p.life < p.max);
    for (const f of this.floats) f.life += dt;
    this.floats = this.floats.filter((f) => f.life < f.max);
  }

  clear() {
    this.parts = [];
    this.floats = [];
  }
}
