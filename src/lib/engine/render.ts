import type { Palette } from "../spec";
import type { Fx } from "./fx";
import type { Game, Layout } from "./game";
import type { Motion } from "./motion";

/*
 * Canvas drawing, ported from Flicker. Colours come from the game's theme palette.
 */

const TAU = Math.PI * 2;
export const DISPLAY_FONT = '"Big Shoulders Display","Big Shoulders","Oswald",Impact,sans-serif';

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const easeOutBack = (k: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};
const easeOut = (k: number) => 1 - (1 - k) * (1 - k);

/** `font` is the display font stack; next/font renames the family, so the stage reads it from CSS. */
export type RenderOpts = { dpr: number; trails: boolean; font: string };

export function renderFrame(ctx: CanvasRenderingContext2D, game: Game, motion: Motion, fx: Fx, C: Palette, L: Layout, o: RenderOpts) {
  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  ctx.clearRect(0, 0, L.CW, L.CH);
  if (o.trails) drawTrails(ctx, motion, C, L);
  drawTargets(ctx, game, C);
  drawParticles(ctx, fx);
  drawFloats(ctx, fx, C, o.font);
}

/** Halftone trail: one dot per 2×2 block, sized by recent motion. */
function drawTrails(ctx: CanvasRenderingContext2D, m: Motion, C: Palette, L: Layout) {
  const { PW, PH, heat } = m;
  const ppx = L.dw / PW, ppy = L.dh / PH;
  const maxR = Math.min(ppx, ppy) * 1.02;
  ctx.fillStyle = C.pink;
  ctx.globalAlpha = 0.88;
  ctx.beginPath();
  for (let y = 0; y < PH - 1; y += 2) {
    const cy = L.oy + (y + 1) * ppy;
    if (cy < -maxR || cy > L.CH + maxR) continue;
    const row = y * PW;
    for (let x = 0; x < PW - 1; x += 2) {
      const i = row + x;
      const h = Math.max(heat[i], heat[i + 1], heat[i + PW], heat[i + PW + 1]);
      if (h < 0.12) continue;
      const cx = L.ox + (x + 1) * ppx, r = maxR * h;
      ctx.moveTo(cx + r, cy);
      ctx.arc(cx, cy, r, 0, TAU);
    }
  }
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawTargets(ctx: CanvasRenderingContext2D, g: Game, C: Palette) {
  for (const tg of g.targets) {
    const x = g.dispX(tg), y = g.dispY(tg), R = g.rDisp(tg);
    let sc = 1, alpha = 1;
    if (tg.state === "live") {
      sc = easeOutBack(clamp((g.clock - tg.born) / 280, 0, 1));
      if (g.clock < tg.armAt) alpha = 0.75;
    } else {
      const k = clamp((g.clock - tg.goneAt) / (tg.state === "hit" ? 220 : 400), 0, 1);
      if (tg.state === "hit") { sc = 1 + 0.4 * k; alpha = 1 - k; } else { sc = 1 - 0.6 * k; alpha = 1 - k; }
    }
    if (alpha <= 0 || sc <= 0) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    if (tg.kind === "hazard") drawHazard(ctx, R, g.clock, C);
    else if (tg.kind === "gold") drawClock(ctx, R, g.clock, C);
    else drawOrb(ctx, R, C);
    ctx.restore();
    if (tg.state === "live" && !tg.practice && tg.kind !== "hazard" && g.clock >= tg.armAt) {
      drawRing(ctx, x, y, R, clamp((tg.dieAt - g.clock) / (tg.dieAt - tg.armAt), 0, 1), C);
    }
  }
}

function drawOrb(ctx: CanvasRenderingContext2D, R: number, C: Palette) {
  ctx.lineWidth = Math.max(2, R * 0.07);
  ctx.strokeStyle = C.blue; // misregistered print outline
  ctx.beginPath(); ctx.arc(R * 0.1, -R * 0.08, R, 0, TAU); ctx.stroke();
  ctx.fillStyle = C.yellow;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
  ctx.strokeStyle = C.navy; ctx.stroke();
  ctx.lineWidth = Math.max(1.5, R * 0.055);
  ctx.beginPath(); ctx.arc(0, 0, R * 0.42, 0, TAU); ctx.stroke();
}

function drawClock(ctx: CanvasRenderingContext2D, R: number, clock: number, C: Palette) {
  ctx.lineWidth = Math.max(2, R * 0.07);
  ctx.strokeStyle = C.blue;
  ctx.beginPath(); ctx.arc(R * 0.1, -R * 0.08, R, 0, TAU); ctx.stroke();
  ctx.fillStyle = C.green;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
  ctx.strokeStyle = C.navy; ctx.stroke();
  const a = clock / 260;
  ctx.strokeStyle = C.white; ctx.lineCap = "round"; ctx.lineWidth = Math.max(2.5, R * 0.13);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -R * 0.58); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5); ctx.stroke();
}

function drawHazard(ctx: CanvasRenderingContext2D, R: number, clock: number, C: Palette) {
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU);
  ctx.fillStyle = C.orange; ctx.fill();
  ctx.clip();
  ctx.rotate(clock / 1500);
  ctx.strokeStyle = C.navy; ctx.lineWidth = R * 0.17;
  const sp = R * 0.46;
  ctx.beginPath();
  for (let k = -4; k <= 4; k++) { ctx.moveTo(k * sp - R * 1.6, -R * 1.6); ctx.lineTo(k * sp + R * 1.6, R * 1.6); }
  ctx.stroke();
  ctx.restore();
  ctx.lineWidth = Math.max(2, R * 0.08); ctx.strokeStyle = C.navy;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
}

function drawRing(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, frac: number, C: Palette) {
  const rr = R + Math.max(6, R * 0.17), a0 = -Math.PI / 2, a1 = a0 + TAU * frac;
  ctx.lineCap = "round";
  ctx.strokeStyle = C.navy; ctx.lineWidth = Math.max(5, R * 0.12) + 3;
  ctx.beginPath(); ctx.arc(x, y, rr, a0, a1); ctx.stroke();
  ctx.strokeStyle = frac < 0.3 ? C.orange : C.white; ctx.lineWidth = Math.max(5, R * 0.12);
  ctx.beginPath(); ctx.arc(x, y, rr, a0, a1); ctx.stroke();
}

function drawParticles(ctx: CanvasRenderingContext2D, fx: Fx) {
  for (const p of fx.parts) {
    ctx.globalAlpha = 1 - p.life / p.max;
    ctx.fillStyle = p.color;
    if (p.sq) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore();
    } else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, TAU); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}

function drawFloats(ctx: CanvasRenderingContext2D, fx: Fx, C: Palette, font: string) {
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
  for (const f of fx.floats) {
    const k = f.life / f.max;
    ctx.globalAlpha = 1 - k * k;
    ctx.font = `800 ${f.size}px ${font}`;
    const y = f.y - 54 * easeOut(k);
    ctx.lineWidth = 6; ctx.strokeStyle = C.paper; ctx.strokeText(f.text, f.x, y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, y);
  }
  ctx.globalAlpha = 1;
}
