import { expect, test } from "bun:test";
import { Fx } from "./fx";

test("burst spawns n particles, a third with reduced motion", () => {
  const a = new Fx(false);
  a.burst(0, 0, ["#000"], 16);
  expect(a.parts).toHaveLength(16);
  const b = new Fx(true);
  b.burst(0, 0, ["#000"], 16);
  expect(b.parts).toHaveLength(6);
});

test("particles and floaters expire", () => {
  const fx = new Fx();
  fx.burst(0, 0, ["#000", "#fff"], 10);
  fx.floater(0, 0, "+10", "#000", 30);
  fx.update(500);
  expect(fx.floats).toHaveLength(1);
  fx.update(500);
  expect(fx.parts).toHaveLength(0);
  expect(fx.floats).toHaveLength(0);
});
