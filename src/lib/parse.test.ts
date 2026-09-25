import { describe, expect, test } from "bun:test";
import { parseDurationMs, parseName, parseTargetCount } from "./parse";

describe("parseDurationMs", () => {
  test.each([
    ["brutal 30s test", 30_000],
    ["45 seconds of chaos", 45_000],
    ["a 30 second round", 30_000],
    ["2 min workout", 120_000],
    ["1.5 minutes please", 90_000],
    ["one minute game", 60_000],
    ["two-minute drill", 120_000],
    ["half a minute", 30_000],
    ["10 hours", null],
    ["no time mentioned", null],
  ])("%p → %p", (text, ms) => {
    expect(parseDurationMs(text)).toBe(ms);
  });
});

describe("parseTargetCount", () => {
  test("reads pop N and N dots", () => {
    expect(parseTargetCount("pop 100 dots")).toBe(100);
    expect(parseTargetCount("collect 50 targets")).toBe(50);
    expect(parseTargetCount("a fast game")).toBeNull();
    expect(parseTargetCount("pop 0")).toBeNull();
  });
});

describe("parseName", () => {
  test("reads the name after called/named and stops at the next clause", () => {
    expect(parseName("survive as long as possible, called Minefield")).toBe("Minefield");
    expect(parseName("a game called Dot Storm with no bombs")).toBe("Dot Storm");
    expect(parseName('named "Neon Rush"')).toBe("Neon Rush");
    expect(parseName("called Super Mega Dot Storm Deluxe")).toBe("Super Mega Dot Storm");
    expect(parseName("no name here")).toBeNull();
  });
});
