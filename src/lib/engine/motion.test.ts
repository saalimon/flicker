import { describe, expect, test } from "bun:test";
import { Motion, SENS } from "./motion";

/** A grey RGBA frame with an optional bright rectangle [x0, x1) × [y0, y1). */
function frame(m: Motion, rect?: [number, number, number, number]) {
  const px = new Uint8ClampedArray(m.PW * m.PH * 4).fill(60);
  if (rect) {
    const [x0, y0, x1, y1] = rect;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const j = (y * m.PW + x) * 4;
        px[j] = px[j + 1] = px[j + 2] = 220;
      }
  }
  return px;
}

describe("Motion (camera)", () => {
  test("allocates PW×PH from the aspect ratio", () => {
    const m = new Motion(128);
    m.alloc(0.75);
    expect(m.PH).toBe(96);
    expect(m.mask.length).toBe(128 * 96);
  });

  test("the first frame never counts as motion", () => {
    const m = new Motion();
    m.diffRGBA(frame(m, [10, 10, 30, 30]), SENS[3].diff);
    expect(m.global).toBe(0);
  });

  test("a moving block covers a target over it and not one elsewhere", () => {
    const m = new Motion();
    m.diffRGBA(frame(m), SENS[3].diff);
    m.diffRGBA(frame(m, [40, 30, 60, 50]), SENS[3].diff);
    expect(m.coverage(50, 40, 8)).toBeGreaterThan(SENS[3].ratio);
    expect(m.coverage(100, 80, 8)).toBe(0);
    expect(m.noisy).toBe(false);
  });

  test("single-pixel noise is removed by the denoise step", () => {
    const m = new Motion();
    m.diffRGBA(frame(m), SENS[3].diff);
    m.diffRGBA(frame(m, [50, 50, 51, 51]), SENS[3].diff);
    expect(m.global).toBe(0);
  });

  test("more than 38% of the frame moving is flagged noisy", () => {
    const m = new Motion();
    m.diffRGBA(frame(m), SENS[3].diff);
    m.diffRGBA(frame(m, [0, 0, m.PW, Math.ceil(m.PH * 0.6)]), SENS[3].diff);
    expect(m.noisy).toBe(true);
  });

  test("heat decays after motion stops", () => {
    const m = new Motion();
    m.diffRGBA(frame(m), SENS[3].diff);
    m.diffRGBA(frame(m, [40, 30, 60, 50]), SENS[3].diff);
    const i = 40 * m.PW + 50;
    expect(m.heat[i]).toBe(1);
    m.diffRGBA(frame(m, [40, 30, 60, 50]), SENS[3].diff);
    expect(m.heat[i]).toBeCloseTo(0.82, 5);
  });
});

describe("Motion (pointer)", () => {
  test("a swipe paints a continuous stroke across its path", () => {
    const m = new Motion();
    m.stampPath([{ x: 10, y: 40 }, { x: 110, y: 40 }], null);
    expect(m.coverage(60, 40, 4)).toBeGreaterThan(0.9);
    expect(m.coverage(60, 80, 4)).toBe(0);
  });
});
