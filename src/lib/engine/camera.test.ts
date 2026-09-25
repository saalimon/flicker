import { describe, expect, test } from "bun:test";
import { cameraGate } from "./camera";

/** A fake MediaStream that records whether its tracks were stopped. */
function fakeStream() {
  const track = { stopped: false, stop() { this.stopped = true; } };
  return { track, getTracks: () => [track] };
}

describe("cameraGate", () => {
  test("a second click while permission is pending is ignored", () => {
    const gate = cameraGate();
    expect(gate.begin()).not.toBeNull();
    expect(gate.begin()).toBeNull();
  });

  test("a granted request is used and frees the gate", () => {
    const gate = cameraGate();
    const token = gate.begin()!;
    const s = fakeStream();
    expect(gate.settle(token, s)).toBe(true);
    expect(s.track.stopped).toBe(false);
    expect(gate.isCurrent(token)).toBe(true);
    expect(gate.begin()).not.toBeNull();
  });

  test("a grant that arrives after the player switched to pointer is stopped, not used", () => {
    const gate = cameraGate();
    const token = gate.begin()!;
    gate.cancel(); // "Play with mouse or touch", or the game was left
    const late = fakeStream();
    expect(gate.settle(token, late)).toBe(false);
    expect(late.track.stopped).toBe(true);
    expect(gate.isCurrent(token)).toBe(false);
  });

  test("a failed request frees the gate for another try", () => {
    const gate = cameraGate();
    const token = gate.begin()!;
    expect(gate.settle(token, null)).toBe(false);
    expect(gate.begin()).not.toBeNull();
  });
});
