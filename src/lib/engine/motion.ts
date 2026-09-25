/*
 * Motion engine: pixel diff on a tiny frame, ported from Flicker.
 *   1. Mirrored video drawn into a 128 px wide canvas (see captureFrame).
 *   2. Luma per pixel: (77R + 150G + 29B) >> 8.
 *   3. |luma - previous| > threshold → moving.
 *   4. Denoise: keep a moving pixel only if 2+ of its 4 neighbours moved.
 *   5. global = share of the frame moving; > NOISY_SHARE means shake/lighting change.
 *   6. coverage(): share of a target circle that is moving.
 *   7. heat decays by 0.82 per frame for the halftone trail.
 * Pointer input stamps its path into the same mask, so game logic is identical.
 */

export const SENS = [
  null,
  { diff: 44, ratio: 0.24, name: "Lowest" },
  { diff: 34, ratio: 0.18, name: "Low" },
  { diff: 26, ratio: 0.13, name: "Medium" },
  { diff: 20, ratio: 0.1, name: "High" },
  { diff: 15, ratio: 0.075, name: "Highest" },
] as const;
export type SensLevel = 1 | 2 | 3 | 4 | 5;

export const NOISY_SHARE = 0.38;
const HEAT_DECAY = 0.82;

export type Pt = { x: number; y: number };

export class Motion {
  readonly PW: number;
  PH = 96;
  prev = new Uint8ClampedArray(0);
  mask = new Uint8Array(0);
  clean = new Uint8Array(0);
  heat = new Float32Array(0);
  global = 0;
  frames = 0;

  constructor(pw = 128) {
    this.PW = pw;
    this.alloc(0.75);
  }

  /** aspect = height / width of the source. */
  alloc(aspect: number) {
    this.PH = Math.max(40, Math.round(this.PW * aspect));
    const n = this.PW * this.PH;
    this.prev = new Uint8ClampedArray(n);
    this.mask = new Uint8Array(n);
    this.clean = new Uint8Array(n);
    this.heat = new Float32Array(n);
    this.frames = 0;
    this.global = 0;
  }

  /** Diff an RGBA frame of PW×PH against the previous one. */
  diffRGBA(rgba: Uint8ClampedArray, threshold: number) {
    const { prev, mask } = this;
    const n = this.PW * this.PH;
    const first = this.frames === 0;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const g = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
      mask[i] = !first && Math.abs(g - prev[i]) > threshold ? 1 : 0;
      prev[i] = g;
    }
    this.frames++;
    this.finish(true);
  }

  /** Stamp a pointer path (processing-pixel coords) into the mask. `last` continues the stroke. */
  stampPath(pts: Pt[], last: Pt | null) {
    this.mask.fill(0);
    const rad = Math.max(3, this.PW * 0.045);
    let a = last;
    for (const b of pts) {
      if (a) {
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (rad * 0.6)));
        for (let s = 1; s <= steps; s++) this.stampDisc(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps, rad);
      } else this.stampDisc(b.x, b.y, rad);
      a = b;
    }
    this.frames++;
    this.finish(false);
  }

  private stampDisc(px: number, py: number, rad: number) {
    const { PW, PH, mask } = this;
    const r2 = rad * rad;
    const x0 = Math.max(0, Math.floor(px - rad)), x1 = Math.min(PW - 1, Math.ceil(px + rad));
    const y0 = Math.max(0, Math.floor(py - rad)), y1 = Math.min(PH - 1, Math.ceil(py + rad));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - px, dy = y + 0.5 - py;
        if (dx * dx + dy * dy <= r2) mask[y * PW + x] = 1;
      }
  }

  private finish(denoise: boolean) {
    const { PW, PH, mask, clean, heat } = this;
    let count = 0;
    if (denoise) {
      clean.fill(0);
      for (let y = 1; y < PH - 1; y++) {
        const row = y * PW;
        for (let x = 1; x < PW - 1; x++) {
          const i = row + x;
          if (!mask[i]) continue;
          if (mask[i - 1] + mask[i + 1] + mask[i - PW] + mask[i + PW] >= 2) {
            clean[i] = 1;
            count++;
          }
        }
      }
    } else {
      for (let i = 0; i < mask.length; i++) {
        clean[i] = mask[i];
        count += mask[i];
      }
    }
    for (let i = 0; i < heat.length; i++) heat[i] = clean[i] ? 1 : heat[i] * HEAT_DECAY;
    this.global = count / (PW * PH);
  }

  get noisy() {
    return this.global > NOISY_SHARE;
  }

  /** Share (0..1) of the circle at (cx, cy) radius r, in processing pixels, that is moving. */
  coverage(cx: number, cy: number, r: number): number {
    const { PW, PH, clean } = this;
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(PW - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(PH - 1, Math.ceil(cy + r));
    let tot = 0, on = 0;
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        if (dx * dx + dy * dy <= r2) {
          tot++;
          on += clean[y * PW + x];
        }
      }
    }
    return tot ? on / tot : 0;
  }
}

/** Browser only: draw the mirrored video into `canvas` (PW×PH) and return its pixels. */
export function captureFrame(video: HTMLVideoElement, ctx: CanvasRenderingContext2D, pw: number, ph: number): Uint8ClampedArray {
  if (ctx.canvas.width !== pw || ctx.canvas.height !== ph) {
    ctx.canvas.width = pw;
    ctx.canvas.height = ph;
  }
  ctx.setTransform(-1, 0, 0, 1, pw, 0); // mirror so it matches what the player sees
  ctx.drawImage(video, 0, 0, pw, ph);
  return ctx.getImageData(0, 0, pw, ph).data;
}
