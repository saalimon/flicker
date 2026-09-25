import { expect, test } from "bun:test";
import { makeConfig } from "./next.config";

test("server build keeps the API route", () => {
  const c = makeConfig({});
  expect(c.output).toBeUndefined();
  expect(c.pageExtensions).toContain("ts");
});

test("static export drops .ts routes and serves under the Pages base path", () => {
  const c = makeConfig({ STATIC_EXPORT: "1", NEXT_PUBLIC_BASE_PATH: "/flicker" });
  expect(c.output).toBe("export");
  expect(c.pageExtensions).toEqual(["tsx"]);
  expect(c.basePath).toBe("/flicker");
});

test("static export at a domain root has no base path", () => {
  expect(makeConfig({ STATIC_EXPORT: "1", NEXT_PUBLIC_BASE_PATH: "" }).basePath).toBe("");
});
