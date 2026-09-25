import { describe, expect, test } from "bun:test";
import { classify } from "./classify";
import { mockClassify } from "./jev/mock";

const jevLike = { ...mockClassify("brutal blitz"), source: "jev" as const, model: "jev-1.13.0" };
const respond = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("classify", () => {
  test("mock mode never touches the network", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    const r = await classify("zen game", undefined, { useMock: true, fetchImpl });
    expect(called).toBe(false);
    expect(r.source).toBe("mock");
  });

  test("uses the route answer, under the base path", async () => {
    let url = "";
    const fetchImpl = (async (u: string) => {
      url = u;
      return new Response(JSON.stringify(jevLike));
    }) as unknown as typeof fetch;
    const r = await classify("brutal blitz", undefined, { useMock: false, basePath: "/flicker", fetchImpl });
    expect(url).toBe("/flicker/api/intent");
    expect(r.source).toBe("jev");
  });

  test.each([
    ["404 (static host, no route)", respond(404, {})],
    ["error body", respond(200, { error: true })],
    ["network failure", (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch],
  ])("falls back to the offline classifier on %s", async (_name, fetchImpl) => {
    const r = await classify("relaxing zen game", undefined, { useMock: false, fetchImpl });
    expect(r.source).toBe("mock");
    expect(r.mode.value).toBe("zen");
  });

  test("falls back when the route is too slow", async () => {
    const slow = ((_u: string, init: RequestInit) =>
      new Promise((_res, rej) => init.signal!.addEventListener("abort", () => rej(new DOMException("t", "TimeoutError"))))) as unknown as typeof fetch;
    const r = await classify("zen game", undefined, { useMock: false, fetchImpl: slow, timeoutMs: 20 });
    expect(r.source).toBe("mock");
  });

  test("a cancelled request rejects instead of returning a stale result", async () => {
    const ac = new AbortController();
    const hang = ((_u: string, init: RequestInit) =>
      new Promise((_res, rej) => init.signal!.addEventListener("abort", () => rej(new DOMException("a", "AbortError"))))) as unknown as typeof fetch;
    const p = classify("zen game", ac.signal, { useMock: false, fetchImpl: hang });
    ac.abort();
    await expect(p).rejects.toThrow("Aborted");
  });

  test("still falls back when the browser has no AbortSignal.any (Safari < 17.4)", async () => {
    const any = AbortSignal.any;
    // @ts-expect-error simulate an older browser
    delete AbortSignal.any;
    try {
      const r = await classify("relaxing zen game", new AbortController().signal, { useMock: false, fetchImpl: respond(404, {}) });
      expect(r.source).toBe("mock");
      expect(r.mode.value).toBe("zen");
    } finally {
      AbortSignal.any = any;
    }
  });

  test("cuts very long input before sending it", async () => {
    let sent = "";
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string).text;
      return new Response(JSON.stringify(jevLike));
    }) as unknown as typeof fetch;
    await classify("x".repeat(10_000), undefined, { useMock: false, fetchImpl });
    expect(sent.length).toBe(500);
  });
});
