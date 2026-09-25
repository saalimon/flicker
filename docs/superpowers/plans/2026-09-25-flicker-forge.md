# Flicker Forge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shapeshift-style Next.js app where a plain-language game description is classified by Jev (offline mock by default) and compiled into a playable Flicker camera game, deployed to GitHub Pages by GitHub Actions.

**Architecture:** Pure, unit-tested TypeScript modules do all the thinking — `jev/*` (questions, offline mock, real-Jev mapping), `parse`, `compile` (answers → `GameSpec`), `decide` (calm UI state machine), and `engine/*` (motion diff, game rules, progress). A thin browser layer (`engine/stage.ts`, `GameStage.tsx`, `Prompt.tsx`, `GameCard.tsx`, `page.tsx`) wires them to the DOM. One codebase builds two ways: a static export for GitHub Pages (offline Jev only) and a server build whose `/api/intent` route calls real Jev when `TYPESAFE_API_KEY` is set.

**Tech Stack:** Bun 1.4, Next.js 16.3 (App Router, Turbopack), React 19.2, TypeScript 5 strict, Tailwind CSS 4, `@typesafe-ai/sdk` 0.6, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-09-25-flicker-forge-design.md`

## Global Constraints

- Offline first: with `NEXT_PUBLIC_USE_MOCK=true` the browser never makes a network request to classify.
- The TypeSafe API key is read only in server code (`src/lib/jev/client.ts`, which imports `server-only`); never `NEXT_PUBLIC_*`.
- Static export: `STATIC_EXPORT=1` → `output: "export"`, `pageExtensions: ["tsx"]`, `basePath = NEXT_PUBLIC_BASE_PATH`.
- Real Jev call: `timeout: 2500`, `retry: { maxRetries: 0 }`, model `JEV_MODEL || "jev-latest"`.
- Browser route timeout 2.5 s; any failure falls back to the offline mock; aborted requests reject and never produce a result.
- Input is cut to `MAX_TEXT = 500` characters before classifying.
- Round length clamped to 15 s – 5 min; survival has no clock and 3 lives.
- Baseline game numbers equal Flicker's: 60 s, interval 1150 − 80/level (min 420), life 3400 − 210/level (min 1500), size 1 − 0.05/level (min 0.6), hazards from level 2 at 0.12 + 0.03/level (max 0.32), gold 0.07, ×5 multiplier cap, 5 pops per multiplier step, 8 pops per level, ±3 s.
- Storage key `flickerforge.v1`; every storage access wrapped in try/catch.
- Keep Flicker's accessibility: live region, `prefers-reduced-motion`, Space/P/Esc pause, M toggles trail, auto-pause when the tab is hidden, all camera error messages.
- Visual language: Flicker palette and fonts (Big Shoulders 700–900, Atkinson Hyperlegible 400/700 via `next/font`), light and dark.
- Commit after every task on branch `feat/flicker-forge`; commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **GitHub Pages sub-path** — the site is served from `/<repo>/`; every asset, the `classic.html` link and any fetch must include the base path (pinned in Task 1 `next.config.test.ts` and Task 10 `classify.test.ts` "under the base path").
2. **Very long or pasted input** — 10,000 characters or a wall of emoji must classify in under 50 ms and send at most 500 characters (Task 3 "handles very long pasted input quickly", Task 10 "cuts very long input").
3. **Stale results while typing fast** — an older request finishing after a newer keystroke must not overwrite the card (Task 10 "a cancelled request rejects").
4. **Corrupt or blocked localStorage** — hand-edited JSON, wrong types, or a throwing `localStorage` must load safe defaults and keep the game playable (Task 9 "corrupt or hostile data", "storage that throws").
5. **Frame-time spikes** — a background tab or debugger pause must not skip the round or fire a burst of misses; `dt` is clamped to 64 ms (Task 8 "a huge frame gap is clamped").

---

### Task 0: Branch, commit the design, install Bun

**Files:**
- Existing: `docs/superpowers/specs/2026-09-25-flicker-forge-design.md`, `.github/workflows/pages.yml`, `flicker-play-locally.html`

- [ ] **Step 1: Create the feature branch**

```bash
cd /Users/deduqair/Development/flicker
git checkout -b feat/flicker-forge
```

- [ ] **Step 2: Install Bun (not installed on this machine)**

```bash
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"   # the installer also adds this to your shell profile
bun --version
```
Expected: `1.4.x` or newer.

- [ ] **Step 3: Commit the spec, the plan, the workflow and the original game**

```bash
git add docs .github flicker-play-locally.html
git commit -m "docs: Flicker Forge design, plan and Pages workflow

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: Next.js scaffold with the two build modes

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `next.config.test.ts`, `postcss.config.mjs`, `.gitignore`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx` (placeholder), `src/components/stage.css`, `public/classic.html`

**Interfaces:**
- Produces: `makeConfig(env: Record<string, string | undefined>): NextConfig` (default export `makeConfig(process.env)`); CSS tokens `--navy --blue --pink --yellow --green --orange --sheet --ink --ink-soft --line --stage --dots --title --tint --track --display --body`; Tailwind colours `navy blue pink yellow green orange sheet ink ink-soft line stage dots title track` and fonts `font-display font-body`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "flicker-forge",
  "version": "0.1.0",
  "private": true,
  "description": "Describe a camera motion game in plain words; Jev turns it into one you can play.",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "check": "bun run typecheck && bun test"
  },
  "dependencies": {
    "@typesafe-ai/sdk": "^0.6.0",
    "next": "16.3.6",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "server-only": "^0.0.1"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/bun": "^1.4.2",
    "@types/node": "^22",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "tailwindcss": "^4",
    "typescript": "^5"
  },
  "packageManager": "bun@1.4.2",
  "license": "MIT"
}
```

Run: `bun install`
Expected: creates `bun.lock` and `node_modules/`.

- [ ] **Step 2: Write `tsconfig.json`, `postcss.config.mjs`, `.gitignore`**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "types": ["bun", "node"],
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules", "out"]
}
```

`postcss.config.mjs`:
```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

`.gitignore`:
```
node_modules/
.next/
out/
next-env.d.ts
*.tsbuildinfo
.env*.local
.DS_Store
```

- [ ] **Step 3: Write the failing config test `next.config.test.ts`**

```ts
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
```

- [ ] **Step 4: Run it to see it fail**

Run: `bun test next.config.test.ts`
Expected: FAIL — `Cannot find module './next.config'`.

- [ ] **Step 5: Write `next.config.ts`**

```ts
import type { NextConfig } from "next";

/*
 * Two builds from one codebase:
 *   STATIC_EXPORT=1 → static files for GitHub Pages. The .ts API route is left out
 *                     (pageExtensions: tsx only) and the browser uses offline Jev.
 *   default         → server build (dev / Vercel) with /api/intent calling real Jev.
 */
export function makeConfig(env: Record<string, string | undefined>): NextConfig {
  if (env.STATIC_EXPORT !== "1") return { pageExtensions: ["tsx", "ts"] };
  const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";
  return {
    output: "export",
    pageExtensions: ["tsx"],
    basePath,
    trailingSlash: true,
    images: { unoptimized: true },
  };
}

export default makeConfig(process.env);
```

- [ ] **Step 6: Run the test to see it pass**

Run: `bun test next.config.test.ts`
Expected: 3 pass.

- [ ] **Step 7: Global styles, fonts and the ported stage CSS**

`src/app/globals.css`:
```css
@import "tailwindcss";

/* Flicker's print palette, light and dark. Fonts come from next/font (layout.tsx). */
:root {
  --navy: #1D2340; --blue: #3255A4; --pink: #FF48B0; --yellow: #FFE800; --green: #00A95C; --orange: #FF6C2F;
  --sheet: #F4F6F0; --ink: #1D2340; --ink-soft: #4F5775; --line: #1D2340;
  --stage: #C3CEEA; --dots: #AAB8E0; --title: #3255A4; --tint: #A9C0F0; --track: #DCE2F2;
  --display: var(--nf-display), "Big Shoulders Display", "Oswald", "Arial Narrow", Impact, sans-serif;
  --body: var(--nf-body), "Atkinson Hyperlegible", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --sheet: #161B33; --ink: #EEF1F8; --ink-soft: #A9B1CE; --line: #8391C4;
    --stage: #0F1328; --dots: #1D2548; --title: #8FAEF5; --tint: #8AA3DE; --track: #262E52;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --sheet: #161B33; --ink: #EEF1F8; --ink-soft: #A9B1CE; --line: #8391C4;
  --stage: #0F1328; --dots: #1D2548; --title: #8FAEF5; --tint: #8AA3DE; --track: #262E52;
  color-scheme: dark;
}

@theme inline {
  --color-navy: var(--navy);
  --color-blue: var(--blue);
  --color-pink: var(--pink);
  --color-yellow: var(--yellow);
  --color-green: var(--green);
  --color-orange: var(--orange);
  --color-sheet: var(--sheet);
  --color-ink: var(--ink);
  --color-ink-soft: var(--ink-soft);
  --color-line: var(--line);
  --color-stage: var(--stage);
  --color-dots: var(--dots);
  --color-title: var(--title);
  --color-track: var(--track);
  --font-display: var(--display);
  --font-body: var(--body);
}

html, body { min-height: 100%; }
body {
  margin: 0;
  background-color: var(--stage);
  background-image: radial-gradient(var(--dots) 1.7px, transparent 2px);
  background-size: 18px 18px;
  color: var(--ink);
  font-family: var(--body);
  -webkit-font-smoothing: antialiased;
}
:focus-visible { outline: 3px solid var(--pink); outline-offset: 3px; }
```

`src/app/layout.tsx`:
```tsx
import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Big_Shoulders } from "next/font/google";
import "./globals.css";
import "../components/stage.css";

// next/font self-hosts the fonts at build time, so the exported site needs no font CDN.
const display = Big_Shoulders({ subsets: ["latin"], weight: ["700", "800", "900"], variable: "--nf-display", adjustFontFallback: false });
const body = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--nf-body" });

export const metadata: Metadata = {
  title: "Flicker Forge",
  description: "Describe a camera motion game in plain words. Jev turns it into one you can play.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

`src/components/stage.css` — Flicker's stage/HUD/sheet styles (from `flicker-play-locally.html` lines 59–205) with `.stage` made a fixed full-screen overlay and `body[data-input]` selectors moved onto `.stage`:
```css
/*
 * Game stage styles, ported from flicker-play-locally.html.
 * Colour tokens live in globals.css; GameStage overrides the palette per theme.
 */
.stage [hidden]{display:none !important}
.stage button{font:inherit;color:inherit}
.stage .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.stage .stamp-mark.got{border:2px solid #1D2340;background:var(--pink);transform:rotate(-10deg);flex:none}
.stage .back{display:block;margin:-6px 0 6px;padding:0}

/* ---------- stage ---------- */
.stage{position:fixed;inset:0;z-index:50;width:100%;height:100%;overflow:hidden;isolation:isolate;touch-action:none;
  background-color:var(--stage);
  background-image:radial-gradient(var(--dots) 1.7px, transparent 2px);
  background-size:18px 18px}
.cam{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1);
  filter:grayscale(1) contrast(1.25) brightness(1.08);opacity:0;transition:opacity .5s}
.stage[data-input="camera"] .cam{opacity:1}
.tint{position:absolute;inset:0;pointer-events:none;display:none}
.stage[data-input="camera"] .tint{display:block}
.tint-lift{background:var(--navy);mix-blend-mode:lighten}
.tint-mult{background:var(--tint);mix-blend-mode:multiply}
.fx{position:absolute;inset:0;width:100%;height:100%;z-index:2;display:block}
.stage[data-input="pointer"] .fx{cursor:crosshair}
.stage.shake{animation:shake .32s linear}
@keyframes shake{
  0%,100%{transform:translate(0,0)} 20%{transform:translate(-9px,4px)} 40%{transform:translate(8px,-5px)}
  60%{transform:translate(-6px,-3px)} 80%{transform:translate(5px,4px)}
}
.flash{position:absolute;inset:0;pointer-events:none;z-index:3}
.flash.on{animation:flash .45s ease-out}
@keyframes flash{from{box-shadow:inset 0 0 0 16px var(--orange)}to{box-shadow:inset 0 0 0 0 var(--orange)}}

/* ---------- HUD ---------- */
.hud{position:absolute;top:12px;left:12px;right:12px;z-index:3;display:grid;grid-template-columns:1fr auto 1fr;align-items:start;gap:10px;pointer-events:none}
.tag{background:var(--sheet);color:var(--ink);border:2px solid var(--line);border-radius:8px;padding:6px 14px 8px;min-width:0}
.hud-score{justify-self:start}
.hud-time{justify-self:center;text-align:center;min-width:6.5rem}
.hud-combo{justify-self:end;text-align:right}
.big{font-family:var(--display);font-weight:800;font-size:clamp(2.3rem,6.4vw,4.4rem);line-height:.92;font-variant-numeric:tabular-nums;letter-spacing:.01em}
.small{font-size:.9rem;color:var(--ink-soft);white-space:nowrap}
.timebar{height:6px;margin-top:6px;background:var(--track);border-radius:3px;overflow:hidden}
.timebar span{display:block;height:100%;background:var(--ink);transform-origin:left center}
.hud-time.low{background:var(--pink);border-color:var(--navy);color:var(--navy)}
.hud-time.low .timebar{background:rgba(29,35,64,.2)}
.hud-time.low .timebar span{background:var(--navy)}
.pulse{animation:pulse .35s ease-out}
@keyframes pulse{0%{transform:scale(1)}40%{transform:scale(1.12)}100%{transform:scale(1)}}
.hint{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);z-index:3;background:var(--orange);color:var(--navy);
  border:2px solid var(--navy);border-radius:8px;padding:8px 14px;font-weight:700;max-width:min(90%,420px);text-align:center;pointer-events:none}

.controls{position:absolute;right:12px;bottom:12px;z-index:4;display:flex;gap:8px}
.icon-btn{width:46px;height:46px;border-radius:50%;border:2px solid var(--line);background:var(--sheet);color:var(--ink);display:grid;place-items:center;cursor:pointer;padding:0}
.icon-btn svg{width:22px;height:22px}
.icon-btn[aria-pressed="false"]{opacity:.62}
.icon-btn .slash{display:none}
.icon-btn[aria-pressed="false"] .slash{display:inline}

/* ---------- big type moments ---------- */
.count{position:absolute;inset:0;z-index:4;display:grid;place-items:center;pointer-events:none;
  font-family:var(--display);font-weight:900;font-size:clamp(7rem,30vw,17rem);line-height:1;color:var(--yellow);
  -webkit-text-stroke:3px var(--navy);text-shadow:9px 7px 0 var(--pink)}
.count.word{font-size:clamp(4rem,16vw,10rem)}
.count.pop{animation:countpop .7s ease-out both}
@keyframes countpop{0%{transform:scale(.55);opacity:0}25%{transform:scale(1.06);opacity:1}70%{transform:scale(1);opacity:1}100%{transform:scale(1);opacity:0}}
.banner{position:absolute;left:0;right:0;top:32%;z-index:4;text-align:center;pointer-events:none;
  font-family:var(--display);font-weight:900;font-size:clamp(3rem,10vw,6rem);color:var(--yellow);-webkit-text-stroke:2px var(--navy);text-shadow:6px 5px 0 var(--pink);opacity:0}
.banner.show{animation:banner 1.3s ease-out both}
@keyframes banner{0%{opacity:0;transform:translateY(14px)}15%{opacity:1;transform:none}75%{opacity:1}100%{opacity:0}}

.toasts{position:absolute;right:12px;top:clamp(110px,16vh,150px);z-index:6;display:flex;flex-direction:column;gap:8px;align-items:flex-end;pointer-events:none}
.toast{display:flex;gap:10px;align-items:center;background:var(--sheet);color:var(--ink);border:2px solid var(--line);border-radius:10px;padding:9px 14px 9px 10px;max-width:290px;animation:toastin .3s ease-out both}
.toast.out{animation:toastout .3s ease-in both}
.toast strong{display:block;font-size:.95rem}
.toast span.d{font-size:.85rem;color:var(--ink-soft)}
@keyframes toastin{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
@keyframes toastout{to{opacity:0;transform:translateX(24px)}}

/* ---------- sheets ---------- */
.sheet{position:absolute;z-index:5;background:var(--sheet);color:var(--ink);border:2px solid var(--line);border-radius:16px;
  box-shadow:7px 7px 0 var(--pink);padding:clamp(18px,2.6vw,28px);overflow:auto;touch-action:auto;overscroll-behavior:contain}
.sheet.side{left:clamp(12px,4vw,56px);top:50%;transform:translateY(-50%);width:min(440px,calc(100% - 24px));max-height:calc(100% - 32px)}
.sheet.center{left:50%;top:50%;transform:translate(-50%,-50%);width:min(360px,calc(100% - 32px));text-align:center}

.title{margin:0 0 6px;font-family:var(--display);font-weight:900;font-size:clamp(4.2rem,11vw,7rem);line-height:.82;letter-spacing:.005em;color:var(--title);text-shadow:4px 3px 0 var(--pink)}
.lede{margin:10px 0 16px;font-size:1.08rem;max-width:34ch}
.legend{list-style:none;margin:0 0 18px;padding:0;display:grid;gap:10px}
.legend li{display:grid;grid-template-columns:34px 1fr;gap:12px;align-items:start;font-size:.95rem}
.legend svg{width:34px;height:34px}
.legend strong{display:block}
.status{margin:0 0 12px;font-size:.95rem;color:var(--ink-soft)}
.status.error{color:var(--ink);background:rgba(255,108,47,.18);border-left:4px solid var(--orange);padding:8px 10px;border-radius:0 6px 6px 0}
.cal{margin:0 0 14px;padding:12px 0 0;border-top:2px dashed var(--track)}
.cal-row{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.cal label{font-weight:700}
.cal output{color:var(--ink-soft);font-size:.92rem}
input[type=range]{width:100%;margin:8px 0 12px;accent-color:var(--pink)}
.meter{height:10px;background:var(--track);border-radius:5px;overflow:hidden;margin:6px 0 8px}
.meter span{display:block;height:100%;background:var(--pink);transform-origin:left center;transform:scaleX(0);transition:transform .08s linear}
.meter.noisy span{background:var(--orange)}
.cal-note{margin:0;font-size:.9rem;color:var(--ink-soft)}

.actions{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;margin:4px 0 18px}
.btn{cursor:pointer;border-radius:10px;border:2px solid var(--navy);padding:10px 22px 12px;font-family:var(--display);font-weight:800;font-size:1.5rem;line-height:1;letter-spacing:.01em}
.btn.primary{background:var(--yellow);color:var(--navy)}
.btn.primary:hover{background:#FFF15C}
.btn.primary:active{transform:translate(2px,2px)}
.btn.link{border:0;background:none;padding:6px 2px;font-family:var(--body);font-weight:700;font-size:1rem;text-decoration:underline;text-underline-offset:3px;color:var(--ink)}

.progress{border-top:2px dashed var(--track);padding-top:14px}
.rank-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:.95rem}
.rank-row .rk{font-family:var(--display);font-weight:800;font-size:1.35rem}
.bar{height:8px;background:var(--track);border-radius:4px;overflow:hidden;margin:6px 0 4px}
.bar span{display:block;height:100%;background:var(--blue);transform-origin:left center}
:root:not([data-theme="light"]) .bar span{background:var(--title)}
.muted{color:var(--ink-soft);font-size:.9rem;margin:0}
details{margin-top:12px}
summary{cursor:pointer;font-weight:700;padding:4px 0}
summary .muted{font-weight:400;display:inline}
.stamps{list-style:none;padding:0;margin:10px 0 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px 14px}
.stamp{display:grid;grid-template-columns:34px 1fr;gap:10px;align-items:center}
.stamp-mark{width:34px;height:34px;border-radius:50%;border:2px dashed var(--ink-soft);display:grid;place-items:center}
.stamp.got .stamp-mark{border:2px solid var(--navy);background:var(--pink);transform:rotate(-10deg)}
.stamp-mark svg{width:18px;height:18px}
.stamp strong{display:block;font-size:.92rem;line-height:1.2}
.stamp .d{font-size:.8rem;color:var(--ink-soft);line-height:1.3}
.stamp:not(.got) strong{color:var(--ink-soft)}
.fineprint{margin:14px 0 0;font-size:.8rem;color:var(--ink-soft)}

.end-note{margin:0 0 4px;font-weight:700;color:var(--ink);background:var(--yellow);color:var(--navy);display:inline-block;padding:2px 8px;border-radius:4px}
.end-score{margin:4px 0 0;font-family:var(--display);font-weight:900;font-size:clamp(4.5rem,13vw,7.5rem);line-height:.85;color:var(--title);text-shadow:4px 3px 0 var(--pink);font-variant-numeric:tabular-nums}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:18px 0}
.stats div{border-top:3px solid var(--ink);padding-top:6px}
.stats dt{font-size:.8rem;color:var(--ink-soft)}
.stats dd{margin:0;font-family:var(--display);font-weight:800;font-size:1.9rem;line-height:1}
.panel-title{margin:0 0 8px;font-family:var(--display);font-weight:900;font-size:3rem;line-height:.9;color:var(--title)}
.center .actions{justify-content:center;margin-bottom:0}

@media (max-width:720px){
  .sheet.side{left:8px;right:8px;width:auto;top:auto;bottom:8px;transform:none;max-height:64%;box-shadow:4px 4px 0 var(--pink);border-radius:14px}
  .title{font-size:3.6rem}
  .lede{margin:6px 0 12px}
  .legend{gap:8px}
  .stats{grid-template-columns:repeat(2,1fr)}
  .tag{padding:4px 10px 6px}
  .small{font-size:.78rem;white-space:normal;max-width:9.5rem}
  .hud-combo .small{margin-left:auto}
  .hud-time{min-width:4.8rem}
  .toasts{left:12px;right:12px;align-items:stretch}
  .toast{max-width:none}
}
@media (prefers-reduced-motion: reduce){
  .stage.shake,.pulse,.flash.on{animation:none}
  .count.pop{animation-duration:.01s;animation-delay:0s}
  .banner.show{animation:banner 1.3s steps(1) both}
  .toast,.toast.out{animation-duration:.01s}
}
```

Placeholder `src/app/page.tsx` (replaced in Task 12):
```tsx
export default function Home() {
  return <main className="p-10 font-display text-6xl text-title">Flicker Forge</main>;
}
```

Copy the original game so it stays playable at `/classic.html`:
```bash
mkdir -p public && cp flicker-play-locally.html public/classic.html
```

- [ ] **Step 8: Verify both builds**

Run:
```bash
bun run typecheck
STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/flicker NEXT_PUBLIC_USE_MOCK=true bun run build && ls out
rm -rf out && bun run build
```
Expected: typecheck clean; static build lists `index.html`, `classic.html`, `_next/` in `out/`; server build finishes. A "Failed to find font override values for font `Big Shoulders`" warning is expected and harmless.

- [ ] **Step 9: Commit**

```bash
git add package.json bun.lock tsconfig.json next.config.ts next.config.test.ts postcss.config.mjs .gitignore src public
git commit -m "feat: Next.js scaffold with static-export and server build modes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Jev types and the question schema

**Files:**
- Create: `src/lib/jev/types.ts`, `src/lib/jev/questions.ts`
- Test: `src/lib/jev/questions.test.ts`

**Interfaces:**
- Produces: `MODES, PACES, HAZARDS, REWARD_FOCI, AUDIENCES, THEMES` (readonly tuples); types `ModeKey, GameMode, Pace, Hazards, RewardFocus, Audience, Theme, Difficulty (1|2|3), Signal<T>, IntentResult`; `MAX_TEXT = 500`; `questions` (SDK question object) and `JevQuestions = typeof questions`.

- [ ] **Step 1: Write the failing test `src/lib/jev/questions.test.ts`**

```ts
import { expect, test } from "bun:test";
import { questions } from "./questions";
import { AUDIENCES, HAZARDS, MODES, PACES, REWARD_FOCI, THEMES } from "./types";

// The mock and real Jev must speak the same labels, or compile() gets values it can't handle.
test("Jev choice labels match the app's option lists", () => {
  const labels = (q: { criteria: object }) => Object.keys(q.criteria).sort();
  expect(labels(questions.mode)).toEqual([...MODES].sort());
  expect(labels(questions.pace)).toEqual([...PACES].sort());
  expect(labels(questions.hazards)).toEqual([...HAZARDS].sort());
  expect(labels(questions.rewardFocus)).toEqual([...REWARD_FOCI].sort());
  expect(labels(questions.audience)).toEqual([...AUDIENCES].sort());
  expect(labels(questions.theme)).toEqual([...THEMES].sort());
});

test("difficulty is a three-level score and timeBonus is yes/no", () => {
  expect(questions.difficulty.type).toBe("score");
  expect(questions.difficulty.criteria).toHaveLength(3);
  expect(questions.timeBonus.type).toBe("noul");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test src/lib/jev/questions.test.ts`
Expected: FAIL — `Cannot find module './questions'`.

- [ ] **Step 3: Write `src/lib/jev/types.ts`**

```ts
export const MODES = ["classic", "survival", "zen", "blitz", "none"] as const;
export type ModeKey = (typeof MODES)[number];
export type GameMode = Exclude<ModeKey, "none">;

export const PACES = ["chill", "steady", "frantic"] as const;
export type Pace = (typeof PACES)[number];

export const HAZARDS = ["none", "few", "many"] as const;
export type Hazards = (typeof HAZARDS)[number];

export const REWARD_FOCI = ["combo", "speed", "accuracy", "collecting"] as const;
export type RewardFocus = (typeof REWARD_FOCI)[number];

export const AUDIENCES = ["general", "kids", "workout"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const THEMES = ["flicker", "neon", "pastel", "mono"] as const;
export type Theme = (typeof THEMES)[number];

export type Difficulty = 1 | 2 | 3;

export type Signal<T> = { value: T; confidence: number };

/** Same shape whether it came from real Jev or the offline mock. */
export type IntentResult = {
  source: "jev" | "mock";
  model: string;
  latencyMs: number;
  mode: { value: ModeKey; confidence: number; probabilities: Record<ModeKey, number> };
  difficulty: { score: Difficulty; confidence: number };
  pace: Signal<Pace>;
  hazards: Signal<Hazards>;
  timeBonus: Signal<boolean>;
  rewardFocus: Signal<RewardFocus>;
  audience: Signal<Audience>;
  theme: Signal<Theme>;
  error?: boolean;
};

/** Longest description we classify; longer input is cut before classifying. */
export const MAX_TEXT = 500;
```

- [ ] **Step 4: Write `src/lib/jev/questions.ts`**

```ts
import { choice, noul, score } from "@typesafe-ai/sdk";

/*
 * The questions Jev answers about a game description, all in one parallel call.
 * Rules (from shapeshift): each question is self-contained, options don't overlap,
 * and every question has a neutral option so Jev never has to guess.
 * Jev only classifies. Numbers (durations, counts, names) are parsed by code.
 */
export const questions = {
  mode: choice(
    "The text describes a game someone wants to play. Which style of round does it describe?",
    {
      classic: "A normal timed round: pop targets for points before the clock runs out.",
      survival: "No clock. The player has lives and plays until they run out, surviving as long as possible.",
      zen: "Relaxed and low pressure: no penalties or hazards, just calm popping.",
      blitz: "A very short, fast, intense round that tests reflexes.",
      none: "The text is not describing a game at all.",
    },
  ),
  difficulty: score("How hard should the game be?", [
    "Easy: gentle, beginner or child friendly.",
    "Normal: no particular difficulty asked for.",
    "Hard: brutal, expert, intense or challenging.",
  ]),
  pace: choice("How fast should targets appear?", {
    chill: "Slow and relaxed.",
    steady: "Normal speed, or no pace mentioned.",
    frantic: "Fast, hectic, or meant to keep the player constantly moving.",
  }),
  hazards: choice("How many hazards (bombs, traps, striped dots to avoid) should there be?", {
    none: "Explicitly no hazards, or a relaxed game.",
    few: "Some hazards, or not mentioned.",
    many: "Lots of hazards, dangerous, a minefield.",
  }),
  timeBonus: noul("Should the game include bonus pickups that add extra time?", {
    true: "Bonus clocks, extra time or power-ups are wanted, or not mentioned.",
    false: "The text says no bonuses or no extra time.",
  }),
  rewardFocus: choice("What achievement does the player care about most?", {
    combo: "Long streaks and combos, or not mentioned.",
    speed: "Fast reactions and reflexes.",
    accuracy: "Precision and not making mistakes.",
    collecting: "Popping a large number of targets or collecting badges.",
  }),
  audience: choice("Who is the game for?", {
    general: "Anyone, or not mentioned.",
    kids: "Children or family.",
    workout: "Exercise, fitness, or getting the body moving.",
  }),
  theme: choice("Which visual style fits the description?", {
    flicker: "Default printed-poster look, or not mentioned.",
    neon: "Neon, cyber, arcade, glowing.",
    pastel: "Soft, cute, pastel colours.",
    mono: "Black and white, minimal.",
  }),
};

export type JevQuestions = typeof questions;
```

- [ ] **Step 5: Run the test to see it pass**

Run: `bun test src/lib/jev/questions.test.ts`
Expected: 2 pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/jev
git commit -m "feat: Jev question schema and shared intent types

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Offline Jev (keyword mock)

**Files:**
- Create: `src/lib/jev/mock.ts`
- Test: `src/lib/jev/mock.test.ts`

**Interfaces:**
- Consumes: types and `MAX_TEXT` from Task 2.
- Produces: `mockClassify(input: string): IntentResult` — deterministic, `source: "mock"`, `model: "mock"`, `latencyMs: 0`.

- [ ] **Step 1: Write the failing test `src/lib/jev/mock.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { mockClassify } from "./mock";
import { MODES } from "./types";

describe("mockClassify", () => {
  test("relaxing game for my kids, no bombs → zen, easy, kids, no hazards", () => {
    const r = mockClassify("relaxing game for my kids, no bombs");
    expect(r.mode.value).toBe("zen");
    expect(r.difficulty.score).toBe(1);
    expect(r.audience.value).toBe("kids");
    expect(r.hazards.value).toBe("none");
  });

  test("brutal 30 second reflex test → blitz, hard, speed", () => {
    const r = mockClassify("brutal 30 second reflex test");
    expect(r.mode.value).toBe("blitz");
    expect(r.difficulty.score).toBe(3);
    expect(r.rewardFocus.value).toBe("speed");
  });

  test("survive as long as possible, lots of hazards → survival, many hazards", () => {
    const r = mockClassify("survive as long as possible, lots of hazards, called Minefield");
    expect(r.mode.value).toBe("survival");
    expect(r.hazards.value).toBe("many");
  });

  test("a normal 60 second dot popping game → classic, normal", () => {
    const r = mockClassify("a normal 60 second dot popping game");
    expect(r.mode.value).toBe("classic");
    expect(r.difficulty.score).toBe(2);
  });

  test("workout game, 2 minutes, keep me moving → classic, workout, frantic", () => {
    const r = mockClassify("workout game, 2 minutes, keep me moving");
    expect(r.mode.value).toBe("classic");
    expect(r.audience.value).toBe("workout");
    expect(r.pace.value).toBe("frantic");
  });

  test("text that is not a game → none", () => {
    expect(mockClassify("buy milk and eggs").mode.value).toBe("none");
    expect(mockClassify("").mode.value).toBe("none");
  });

  test("probabilities cover every mode and sum to 1", () => {
    const r = mockClassify("fast neon combo game");
    expect(Object.keys(r.mode.probabilities).sort()).toEqual([...MODES].sort());
    const sum = Object.values(r.mode.probabilities).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
    expect(r.mode.confidence).toBe(r.mode.probabilities[r.mode.value]);
  });

  test("is deterministic and labels itself as the mock", () => {
    const a = mockClassify("chill pastel game with bonus clocks");
    expect(mockClassify("chill pastel game with bonus clocks")).toEqual(a);
    expect(a.source).toBe("mock");
    expect(a.theme.value).toBe("pastel");
    expect(a.timeBonus.value).toBe(true);
  });

  test("handles very long pasted input quickly", () => {
    const huge = "fast game ".repeat(5000) + "🎮".repeat(1000);
    const t0 = performance.now();
    const r = mockClassify(huge);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(r.mode.value).toBe("blitz");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test src/lib/jev/mock.test.ts`
Expected: FAIL — `Cannot find module './mock'`.

- [ ] **Step 3: Write `src/lib/jev/mock.ts`**

```ts
import {
  MAX_TEXT,
  MODES,
  type Audience,
  type Difficulty,
  type GameMode,
  type Hazards,
  type IntentResult,
  type ModeKey,
  type Pace,
  type RewardFocus,
  type Signal,
  type Theme,
} from "./types";

/*
 * Offline Jev: a keyword classifier with exactly the same output shape as the
 * real model. Deterministic: the same text always gives the same result.
 */

const GAME_WORDS = /\b(game|round|dots?|pop(ping)?|play|level|score|targets?|challenge|test|arcade)\b/;

const MODE_CUES: Record<GameMode, RegExp[]> = {
  survival: [
    /\bsurviv(e|al|ing)\b/,
    /\blives\b/,
    /\b(endless|forever|infinite)\b/,
    /\bas long as (possible|you can|i can)\b/,
    /\blast (one|man|person) standing\b/,
  ],
  zen: [
    /\b(relax(ing|ed)?|calm(ing)?|chill|zen|peaceful|gentle|soothing|cozy)\b/,
    /\bno (bombs?|hazards?|stripes?|striped dots?|pressure|timer|penalt(y|ies))\b/,
    /\b(meditat\w*|unwind|stress[- ]free)\b/,
  ],
  blitz: [
    /\b(quick|fast|rapid|blitz|lightning|brutal|insane|frantic)\b/,
    /\breflex(es)?\b/,
    /\b([5-9]|1\d|2\d|30) ?(s|secs?|seconds?)\b/,
    /\bsprint\b/,
  ],
  classic: [
    /\b(classic|normal|standard|regular|original)\b/,
    /\b(60|sixty) ?(s|secs?|seconds?)\b|\b(1|one) ?min(ute)?\b/,
    /\bdot ?popping\b|\bpop(ping)? (the )?dots\b/,
  ],
};

const CUE_WEIGHT = 3;
const CLASSIC_BASE = 1.5; // any game-ish text leans classic
const NONE_SCORE = 3; // nothing game-like at all
const TEMPERATURE = 1.5;

const count = (t: string, res: RegExp[]) => res.reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);

function softmax(scores: Record<ModeKey, number>): Record<ModeKey, number> {
  const exps = MODES.map((k) => Math.exp(scores[k] / TEMPERATURE));
  const sum = exps.reduce((a, b) => a + b, 0);
  const out = {} as Record<ModeKey, number>;
  MODES.forEach((k, i) => (out[k] = exps[i] / sum));
  return out;
}

/** Pick the option with the most matching cues; ties go to the earlier option. */
function pick<T extends string>(t: string, cues: [T, RegExp[]][], fallback: T): Signal<T> {
  let best: T = fallback;
  let bestN = 0;
  for (const [value, res] of cues) {
    const n = count(t, res);
    if (n > bestN) {
      best = value;
      bestN = n;
    }
  }
  return bestN === 0 ? { value: fallback, confidence: 0.4 } : { value: best, confidence: Math.min(0.95, 0.75 + 0.1 * bestN) };
}

const HARD = [/\b(hard|brutal|insane|difficult|expert|intense|tough|challenging|nightmare)\b/];
const EASY = [/\b(easy|kids?|children|beginners?|simple|gentle|relax\w*|toddlers?)\b/];

function difficulty(t: string): { score: Difficulty; confidence: number } {
  const hard = count(t, HARD);
  const easy = count(t, EASY);
  if (hard > easy) return { score: 3, confidence: 0.85 };
  if (easy > hard) return { score: 1, confidence: 0.85 };
  return { score: 2, confidence: hard ? 0.5 : 0.4 };
}

export function mockClassify(input: string): IntentResult {
  const t = input.slice(0, MAX_TEXT).toLowerCase();
  const scores = {} as Record<ModeKey, number>;
  let anyCue = false;
  for (const m of ["classic", "survival", "zen", "blitz"] as const) {
    const n = count(t, MODE_CUES[m]);
    scores[m] = n * CUE_WEIGHT;
    if (n) anyCue = true;
  }
  const gameish = anyCue || GAME_WORDS.test(t);
  if (gameish) scores.classic += CLASSIC_BASE;
  scores.none = gameish ? 0 : NONE_SCORE;

  const probabilities = softmax(scores);
  let value: ModeKey = "none";
  for (const k of MODES) if (probabilities[k] > probabilities[value]) value = k;

  const pace = pick<Pace>(
    t,
    [
      ["frantic", [/\b(frantic|fast|quick|rapid|hectic|crazy|intense)\b/, /\b(workout|exercise|cardio|sweat)\b|\bkeep me moving\b/]],
      ["chill", [/\b(chill|slow|relax\w*|calm|zen|gentle|lazy|peaceful)\b/]],
    ],
    "steady",
  );

  let hazards = pick<Hazards>(
    t,
    [
      ["none", [/\b(no|without) (bombs?|hazards?|stripes?|striped dots?|traps?|mines?)\b/, /\bsafe\b/]],
      ["many", [/\b(lots of|many|tons of|full of|loads of|plenty of) (bombs?|hazards?|traps?|mines?)\b/, /\b(minefield|dangerous|deadly)\b/]],
      ["few", [/\b(some|few|a few|a little|little) (bombs?|hazards?|traps?|mines?)\b/]],
    ],
    "few",
  );
  // Mutual exclusion: a clearly relaxed game never has hazards.
  if (value === "zen" && probabilities.zen >= 0.5) hazards = { value: "none", confidence: Math.max(hazards.confidence, 0.8) };

  const noBonus = /\b(no|without) (bonus(es)?|clocks?|extra time|power-?ups?)\b/.test(t);
  const bonus = /\b(bonus(es)?|clocks?|extra time|power-?ups?)\b/.test(t);
  const timeBonus: Signal<boolean> = noBonus
    ? { value: false, confidence: 0.85 }
    : { value: true, confidence: bonus ? 0.85 : 0.5 };

  const rewardFocus = pick<RewardFocus>(
    t,
    [
      ["combo", [/\b(combos?|streaks?|chains?|multiplier)\b|\bin a row\b/]],
      ["speed", [/\b(reflex(es)?|speed|reaction|react)\b/]],
      ["accuracy", [/\b(accura\w*|precis\w*|careful|aim|perfect|mistakes?)\b/]],
      ["collecting", [/\b(collect\w*|badges?|stamps?|achievements?)\b|\bpop \d+\b|\b\d+ (dots|targets|pops)\b/]],
    ],
    "combo",
  );

  const audience = pick<Audience>(
    t,
    [
      ["kids", [/\b(kids?|child(ren)?|toddlers?|son|daughter|family|little ones)\b/]],
      ["workout", [/\b(workout|exercise|fitness|cardio|gym|warm ?up|sweat|active)\b|\bkeep me moving\b/]],
    ],
    "general",
  );

  const theme = pick<Theme>(
    t,
    [
      ["neon", [/\b(neon|cyber\w*|synthwave|glow\w*|arcade)\b/]],
      ["pastel", [/\b(pastel|soft|cute|kawaii|candy)\b/]],
      ["mono", [/\b(mono(chrome)?|grayscale|greyscale|minimal\w*)\b|\bblack and white\b/]],
    ],
    "flicker",
  );

  return {
    source: "mock",
    model: "mock",
    latencyMs: 0,
    mode: { value, confidence: probabilities[value], probabilities },
    difficulty: difficulty(t),
    pace,
    hazards,
    timeBonus,
    rewardFocus,
    audience,
    theme,
  };
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `bun test src/lib/jev/mock.test.ts`
Expected: 9 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jev/mock.ts src/lib/jev/mock.test.ts
git commit -m "feat: offline Jev keyword classifier with Jev-shaped output

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Deterministic parsers

**Files:**
- Create: `src/lib/parse.ts`
- Test: `src/lib/parse.test.ts`

**Interfaces:**
- Produces: `parseDurationMs(text): number | null` (unclamped ms), `parseTargetCount(text): number | null`, `parseName(text): string | null`.

- [ ] **Step 1: Write the failing test `src/lib/parse.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test src/lib/parse.test.ts`
Expected: FAIL — `Cannot find module './parse'`.

- [ ] **Step 3: Write `src/lib/parse.ts`**

```ts
/*
 * Deterministic parsers: the numbers Jev never guesses.
 */

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, "forty-five": 45, fifty: 50, sixty: 60, ninety: 90,
};
const NUM = `(\\d+(?:\\.\\d+)?|${Object.keys(WORD_NUMBERS).join("|")})`;
const DURATION = new RegExp(`\\b${NUM}[\\s-]*(seconds?|secs?|s|minutes?|mins?)\\b`, "i");
const HALF_MINUTE = /\bhalf (a )?minute\b/i;

const toNumber = (s: string) => WORD_NUMBERS[s.toLowerCase()] ?? parseFloat(s);

/** "30s", "45 seconds", "2 min", "1.5 minutes", "one minute", "half a minute" → ms. Unclamped. */
export function parseDurationMs(text: string): number | null {
  if (HALF_MINUTE.test(text)) return 30_000;
  const m = DURATION.exec(text);
  if (!m) return null;
  const n = toNumber(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2].toLowerCase();
  return Math.round(unit.startsWith("m") ? n * 60_000 : n * 1000);
}

/** "pop 100", "100 dots", "50 targets" → 100 / 100 / 50. */
export function parseTargetCount(text: string): number | null {
  const m = /\bpop\s+(\d{1,4})\b/i.exec(text) ?? /\b(\d{1,4})\s+(dots|targets|pops)\b/i.exec(text);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n > 0 ? n : null;
}

/** 'called Dot Storm with no bombs' → "Dot Storm". Up to 4 words, 32 chars. */
export function parseName(text: string): string | null {
  const m = /\b(?:called|named|titled)\s+["“']?([^"”',.!?\n]{1,60})/i.exec(text);
  if (!m) return null;
  const cut = m[1].split(/\s+(?:with|and|that|where|for|in|on|but)\b/i)[0];
  const name = cut.trim().split(/\s+/).slice(0, 4).join(" ").slice(0, 32).trim();
  return name || null;
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `bun test src/lib/parse.test.ts`
Expected: 12 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/parse.ts src/lib/parse.test.ts
git commit -m "feat: parse durations, target counts and game names

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: GameSpec and the compiler

**Files:**
- Create: `src/lib/spec.ts`, `src/lib/compile.ts`
- Test: `src/lib/compile.test.ts`

**Interfaces:**
- Consumes: `IntentResult`, `Pace`, `RewardFocus`, `GameMode`, `Theme` (Task 2); `mockClassify` (Task 3, tests only); parsers (Task 4).
- Produces: types `LevelCurve, StatKey, BadgeDef, Rank, GameSpec, Palette`; `PALETTES: Record<Theme, Palette>`; `specId(spec: Omit<GameSpec, "id">): string`; `compile(result: IntentResult, text: string): GameSpec | null`; `nice(n: number): number`; `MIN_ROUND_MS = 15000`, `MAX_ROUND_MS = 300000`.

- [ ] **Step 1: Write the failing test `src/lib/compile.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { compile, nice } from "./compile";
import { mockClassify } from "./jev/mock";

const build = (text: string) => compile(mockClassify(text), text);

describe("compile", () => {
  test("not a game → null", () => {
    expect(build("buy milk and eggs")).toBeNull();
  });

  test("classic defaults match Flicker's original numbers", () => {
    const s = build("a normal dot popping game")!;
    expect(s.mode).toBe("classic");
    expect(s.roundMs).toBe(60_000);
    expect(s.lives).toBeNull();
    expect(s.level.interval0).toBe(1150);
    expect(s.level.life0).toBe(3400);
    expect(s.level.hazard0).toBe(0.12);
    expect(s.goldRate).toBe(0.07);
    expect(s.multCap).toBe(5);
    expect(s.countMisses).toBe(true);
  });

  test("brutal 30 second reflex test → hard blitz, 30s, speed badges", () => {
    const s = build("brutal 30 second reflex test")!;
    expect(s.mode).toBe("blitz");
    expect(s.roundMs).toBe(30_000);
    expect(s.level.interval0).toBe(Math.round(990 * 0.8));
    expect(s.level.hazardStartLevel).toBe(1);
    expect(s.badges.map((b) => b.id)).toContain("speed-b");
    expect(s.ranks[5].name).toBe("Lightning");
  });

  test("zen never has hazards, penalties or miss costs", () => {
    const s = build("relaxing game for my kids, no bombs")!;
    expect(s.mode).toBe("zen");
    expect(s.level.hazardMax).toBe(0);
    expect(s.penaltyMs).toBe(0);
    expect(s.countMisses).toBe(false);
    expect(s.targetScale).toBe(1.3);
    expect(s.sensDefault).toBe(4);
  });

  test("survival has lives, no clock and no bonus clocks", () => {
    const s = build("survive as long as possible, lots of hazards, called Minefield")!;
    expect(s.name).toBe("Minefield");
    expect(s.roundMs).toBeNull();
    expect(s.lives).toBe(3);
    expect(s.goldRate).toBe(0);
    expect(s.level.hazardMax).toBe(0.45);
    expect(s.badges.find((b) => b.id === "mode")!.stat).toBe("survivedMs");
  });

  test("workout pushes targets to the edges and uses the parsed length", () => {
    const s = build("workout game, 2 minutes, keep me moving")!;
    expect(s.roundMs).toBe(120_000);
    expect(s.edgeBias).toBe(0.6);
  });

  test("durations are clamped to 15s–5min", () => {
    expect(build("a 5 second game")!.roundMs).toBe(15_000);
    expect(build("a 10 minute game")!.roundMs).toBe(300_000);
  });

  test("combo focus on hard asks for a 40-pop combo", () => {
    const s = build("hard combo streak game")!;
    expect(s.badges.find((b) => b.id === "combo-b")!.min).toBe(40);
  });

  test("pop N adds a Finish line badge", () => {
    const s = build("pop 100 dots game")!;
    expect(s.badges.find((b) => b.id === "finish")!.min).toBe(100);
  });

  test("about eight badges with unique ids and increasing rank XP", () => {
    const s = build("pop 100 dots game")!;
    const ids = s.badges.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(7);
    expect(ids.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < s.ranks.length; i++) expect(s.ranks[i].xp).toBeGreaterThan(s.ranks[i - 1].xp);
  });

  test("same settings → same id; different settings → different id", () => {
    expect(build("a normal game")!.id).toBe(build("a regular game")!.id);
    expect(build("a normal game")!.id).not.toBe(build("a hard game")!.id);
  });
});

test("nice rounds to readable numbers", () => {
  expect(nice(0.2)).toBe(1);
  expect(nice(16)).toBe(16);
  expect(nice(40)).toBe(40);
  expect(nice(360)).toBe(350);
  expect(nice(2400)).toBe(2500);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test src/lib/compile.test.ts`
Expected: FAIL — `Cannot find module './compile'`.

- [ ] **Step 3: Write `src/lib/spec.ts`**

```ts
import type { GameMode, Theme } from "./jev/types";

/** Numbers that shape difficulty per level (Flicker's levelCfg, parameterised). */
export type LevelCurve = {
  interval0: number; intervalStep: number; intervalMin: number;
  maxLive0: number; maxLiveCap: number;
  life0: number; lifeStep: number; lifeMin: number;
  size0: number; sizeStep: number; sizeMin: number;
  hazardStartLevel: number; hazard0: number; hazardStep: number; hazardMax: number;
  popsPerLevel: number; maxLevel: number;
};

/** Round stats a badge can test. `accuracy` is a percentage, `survivedMs` counts play time. */
export type StatKey =
  | "hits" | "maxCombo" | "score" | "quick" | "goldHits" | "level" | "popped" | "survivedMs" | "accuracy" | "rounds";

/** Plain data so it can be hashed and saved. Earned when stat ≥ min (and no hazards hit, if set). */
export type BadgeDef = { id: string; name: string; desc: string; stat: StatKey; min: number; end?: boolean; noHazards?: boolean };

export type Rank = { xp: number; name: string };

export type GameSpec = {
  id: string;
  name: string;
  mode: GameMode;
  theme: Theme;
  roundMs: number | null; // null = no clock (survival)
  lives: number | null; // null = no lives (everything but survival)
  countMisses: boolean; // false in zen: letting a dot fade costs nothing
  level: LevelCurve;
  goldRate: number;
  bonusMs: number;
  penaltyMs: number;
  multCap: number;
  comboPerMult: number;
  sensDefault: 1 | 2 | 3 | 4 | 5;
  targetScale: number;
  edgeBias: number; // 0..1, share of spawns pushed to the frame edges (workout)
  badges: BadgeDef[];
  ranks: Rank[];
};

export type Palette = { navy: string; blue: string; pink: string; yellow: string; green: string; orange: string; paper: string; white: string };

export const PALETTES: Record<Theme, Palette> = {
  flicker: { navy: "#1D2340", blue: "#3255A4", pink: "#FF48B0", yellow: "#FFE800", green: "#00A95C", orange: "#FF6C2F", paper: "#F4F6F0", white: "#FFFFFF" },
  neon: { navy: "#0B0F2A", blue: "#00E5FF", pink: "#FF2BD6", yellow: "#F9FF3B", green: "#39FF88", orange: "#FF7A1A", paper: "#F4F6F0", white: "#FFFFFF" },
  pastel: { navy: "#3A3450", blue: "#8FB3FF", pink: "#FFA8D9", yellow: "#FFF3A3", green: "#9EE6B8", orange: "#FFB48F", paper: "#FBF8F3", white: "#FFFFFF" },
  mono: { navy: "#111111", blue: "#6B6B6B", pink: "#8C8C8C", yellow: "#FFFFFF", green: "#BDBDBD", orange: "#7A7A7A", paper: "#F4F4F4", white: "#FFFFFF" },
};

/** FNV-1a over the spec's content (not the text typed), so equal games share progress. */
export function specId(spec: Omit<GameSpec, "id">): string {
  const s = JSON.stringify(spec);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
```

- [ ] **Step 4: Write `src/lib/compile.ts`**

```ts
import type { IntentResult, Pace, RewardFocus } from "./jev/types";
import { parseDurationMs, parseName, parseTargetCount } from "./parse";
import { specId, type BadgeDef, type GameSpec, type LevelCurve, type Rank } from "./spec";

/*
 * "Jev decides, code computes": turn classifier answers plus the raw text into
 * exact game numbers. The baseline is Flicker's original constants.
 */

export const MIN_ROUND_MS = 15_000;
export const MAX_ROUND_MS = 300_000;

const BASE_CURVE: LevelCurve = {
  interval0: 1150, intervalStep: 80, intervalMin: 420,
  maxLive0: 2, maxLiveCap: 6,
  life0: 3400, lifeStep: 210, lifeMin: 1500,
  size0: 1, sizeStep: 0.05, sizeMin: 0.6,
  hazardStartLevel: 2, hazard0: 0.12, hazardStep: 0.03, hazardMax: 0.32,
  popsPerLevel: 8, maxLevel: 10,
};

const PACE_MUL: Record<Pace, number> = { chill: 1.25, steady: 1, frantic: 0.8 };

const RANK_NAMES: Record<RewardFocus, string[]> = {
  combo: ["Rookie", "Chain starter", "Streaker", "Unbroken", "Combo king", "Flicker master"],
  speed: ["Rookie", "Quick", "Snappy", "Reflex", "Blur", "Lightning"],
  accuracy: ["Rookie", "Steady hand", "Marksman", "Sharpshooter", "Sniper", "Deadeye"],
  collecting: ["Rookie", "Gatherer", "Collector", "Curator", "Hoarder", "Treasure keeper"],
};
const RANK_XP = [0, 600, 2000, 5000, 10000, 20000];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Round to a number that reads well on a badge: 7, 15, 350, 1500. Never below 1. */
export function nice(n: number): number {
  const step = n < 20 ? 1 : n < 100 ? 5 : n < 1000 ? 50 : 500;
  return Math.max(1, Math.round(n / step) * step);
}

function focusBadges(focus: RewardFocus, f: number): BadgeDef[] {
  switch (focus) {
    case "combo":
      return [
        { id: "combo-a", name: "On a roll", desc: `Reach a ${nice(10 * f)}-pop combo.`, stat: "maxCombo", min: nice(10 * f) },
        { id: "combo-b", name: "Unbroken", desc: `Reach a ${nice(25 * f)}-pop combo.`, stat: "maxCombo", min: nice(25 * f) },
      ];
    case "speed":
      return [
        { id: "speed-a", name: "Reflexes", desc: `Land ${nice(10 * f)} quick pops in one round.`, stat: "quick", min: nice(10 * f) },
        { id: "speed-b", name: "Lightning", desc: `Land ${nice(25 * f)} quick pops in one round.`, stat: "quick", min: nice(25 * f) },
      ];
    case "accuracy":
      return [
        { id: "acc-a", name: "Clean hands", desc: `Score ${nice(300 * f)}+ without touching a striped dot.`, stat: "score", min: nice(300 * f), end: true, noHazards: true },
        { id: "acc-b", name: "Sharpshooter", desc: "Finish a round with 90% accuracy.", stat: "accuracy", min: 90, end: true },
      ];
    case "collecting":
      return [
        { id: "col-a", name: "Collector", desc: `Pop ${nice(40 * f)} dots in one round.`, stat: "popped", min: nice(40 * f) },
        { id: "col-b", name: "Hoarder", desc: `Pop ${nice(100 * f)} dots in one round.`, stat: "popped", min: nice(100 * f) },
      ];
  }
}

export function compile(result: IntentResult, text: string): GameSpec | null {
  const mode = result.mode.value;
  if (mode === "none") return null;

  const difficulty = result.difficulty.score;
  const audience = result.audience.value;
  let pace: Pace = result.pace.value;
  if (mode === "blitz") pace = "frantic";
  else if (mode === "zen" && result.pace.confidence < 0.6) pace = "chill";

  // --- round length / lives
  const defaultMs = mode === "blitz" ? 30_000 : mode === "zen" ? 90_000 : 60_000;
  const parsedMs = parseDurationMs(text);
  const roundMs = mode === "survival" ? null : Math.min(MAX_ROUND_MS, Math.max(MIN_ROUND_MS, parsedMs ?? defaultMs));
  const lives = mode === "survival" ? 3 : null;

  // --- level curve
  const c: LevelCurve = { ...BASE_CURVE };
  if (difficulty === 1) Object.assign(c, { interval0: 1350, life0: 4000, size0: 1.15, hazardStartLevel: 3 });
  if (difficulty === 3) Object.assign(c, { interval0: 990, life0: 2980, size0: 0.9, hazardStartLevel: 1, hazard0: 0.18 });
  const pm = PACE_MUL[pace];
  c.interval0 = Math.round(c.interval0 * pm);
  c.intervalMin = Math.round(c.intervalMin * pm);
  c.life0 = Math.round(c.life0 * pm);
  c.lifeMin = Math.round(c.lifeMin * pm);
  if (mode === "blitz") c.popsPerLevel = 5;

  const hazards = mode === "zen" ? "none" : result.hazards.value;
  if (hazards === "none") Object.assign(c, { hazard0: 0, hazardStep: 0, hazardMax: 0 });
  if (hazards === "many") Object.assign(c, { hazard0: +(c.hazard0 * 1.8).toFixed(3), hazardStep: +(c.hazardStep * 1.8).toFixed(3), hazardMax: 0.45 });
  if (audience === "kids") c.hazardStartLevel = Math.max(c.hazardStartLevel, 3);

  // --- badges and ranks
  const f = difficulty === 1 ? 0.6 : difficulty === 3 ? 1.6 : 1;
  const scale = f * (roundMs ? roundMs / 60_000 : 1);
  const badges: BadgeDef[] = [
    { id: "first", name: "First contact", desc: "Pop your first dot.", stat: "hits", min: 1 },
    ...focusBadges(result.rewardFocus.value, f),
    { id: "score-a", name: "Warmed up", desc: `Score ${nice(500 * scale).toLocaleString("en")} in one round.`, stat: "score", min: nice(500 * scale) },
    { id: "score-b", name: "Blur", desc: `Score ${nice(1500 * scale).toLocaleString("en")} in one round.`, stat: "score", min: nice(1500 * scale) },
  ];
  if (mode === "classic") badges.push({ id: "mode", name: "Deep end", desc: "Reach level 6.", stat: "level", min: 6 });
  if (mode === "blitz") badges.push({ id: "mode", name: "Photo finish", desc: "Reach level 4.", stat: "level", min: 4 });
  if (mode === "zen") badges.push({ id: "mode", name: "Flow state", desc: `Pop ${nice(60 * f)} dots in one round.`, stat: "popped", min: nice(60 * f) });
  if (mode === "survival") badges.push({ id: "mode", name: "Last one standing", desc: "Survive for 90 seconds.", stat: "survivedMs", min: 90_000 });
  const target = parseTargetCount(text);
  if (target) badges.push({ id: "finish", name: "Finish line", desc: `Pop ${target} dots in one round.`, stat: "popped", min: target });
  badges.push({ id: "regular", name: "Regular", desc: "Finish 5 rounds.", stat: "rounds", min: 5, end: true });

  const ranks: Rank[] = RANK_NAMES[result.rewardFocus.value].map((name, i) => ({ name, xp: i === 0 ? 0 : nice(RANK_XP[i] * scale) }));

  const body: Omit<GameSpec, "id"> = {
    name: parseName(text) ?? `${cap(pace)} ${cap(mode)}`,
    mode,
    theme: result.theme.value,
    roundMs,
    lives,
    countMisses: mode !== "zen",
    level: c,
    goldRate: mode === "survival" || !result.timeBonus.value ? 0 : 0.07,
    bonusMs: 3000,
    penaltyMs: mode === "zen" ? 0 : 3000,
    multCap: 5,
    comboPerMult: 5,
    sensDefault: audience === "kids" ? 4 : 3,
    targetScale: audience === "kids" ? 1.3 : 1,
    edgeBias: audience === "workout" ? 0.6 : 0,
    badges,
    ranks,
  };
  return { id: specId(body), ...body };
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `bun test src/lib/compile.test.ts`
Expected: 12 pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/spec.ts src/lib/compile.ts src/lib/compile.test.ts
git commit -m "feat: compile Jev answers into a GameSpec

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Calm UI state machine

**Files:**
- Create: `src/lib/decide.ts`
- Test: `src/lib/decide.test.ts`

**Interfaces:**
- Consumes: `IntentResult`, `ModeKey`, `GameMode` (Task 2); `mockClassify` (tests only).
- Produces: `UiState`, `DecideMemory`, `THRESHOLDS`, `initialMemory`, `rawState(result)`, `decide(mem, result, text): DecideMemory`, `force(mode, text)`, `promote(mem)`, `activeMode(ui): GameMode | null`, `levenshtein`, `changedSubstantially`.

- [ ] **Step 1: Write the failing test `src/lib/decide.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { activeMode, decide, force, initialMemory, promote, rawState, type DecideMemory } from "./decide";
import { mockClassify } from "./jev/mock";
import type { IntentResult, ModeKey } from "./jev/types";

/** A result whose mode probabilities are given explicitly (the rest sums to "none"). */
function result(probs: Partial<Record<ModeKey, number>>): IntentResult {
  const base = mockClassify("a normal game");
  const p: Record<ModeKey, number> = { classic: 0, survival: 0, zen: 0, blitz: 0, none: 0, ...probs };
  const rest = 1 - Object.values(p).reduce((a, b) => a + b, 0);
  p.none += Math.max(0, rest);
  let value: ModeKey = "none";
  for (const k of Object.keys(p) as ModeKey[]) if (p[k] > p[value]) value = k;
  return { ...base, mode: { value, confidence: p[value], probabilities: p } };
}

const committed = (mode: "classic" | "zen" | "blitz" | "survival"): DecideMemory => ({
  ui: { kind: "committed", mode },
  challenger: null,
  forcedText: null,
});

describe("rawState", () => {
  test("confident → committed, medium → ghost, low → input", () => {
    expect(rawState(result({ zen: 0.9 }))).toEqual({ kind: "committed", mode: "zen" });
    expect(rawState(result({ zen: 0.55 }))).toEqual({ kind: "ghost", mode: "zen" });
    expect(rawState(result({ zen: 0.2 }))).toEqual({ kind: "input" });
  });

  test("near-tie between two modes → choose", () => {
    expect(rawState(result({ zen: 0.4, classic: 0.35 }))).toEqual({ kind: "choose", options: ["zen", "classic"] });
  });
});

describe("decide", () => {
  test("empty text resets", () => {
    expect(decide(committed("zen"), result({ zen: 0.9 }), "  ")).toEqual(initialMemory);
  });

  test("a challenger needs two wins in a row", () => {
    const blitz = result({ blitz: 0.75, classic: 0.2 });
    const once = decide(committed("classic"), blitz, "a fast game");
    expect(once.ui).toEqual({ kind: "committed", mode: "classic" });
    expect(once.challenger).toEqual({ mode: "blitz", wins: 1 });
    const twice = decide(once, blitz, "a fast game!");
    expect(twice.ui).toEqual({ kind: "committed", mode: "blitz" });
  });

  test("a very confident challenger wins at once", () => {
    const next = decide(committed("classic"), result({ blitz: 0.9 }), "brutal blitz");
    expect(next.ui).toEqual({ kind: "committed", mode: "blitz" });
  });

  test("the current mode staying on top clears the challenger", () => {
    const mem = { ...committed("classic"), challenger: { mode: "blitz" as const, wins: 1 } };
    expect(decide(mem, result({ classic: 0.8 }), "normal game").challenger).toBeNull();
  });

  test("forced mode survives small edits and drops after a big change", () => {
    const f = force("survival", "a normal game");
    expect(decide(f, result({ zen: 0.95 }), "a normal game!")).toBe(f);
    expect(decide(f, result({ zen: 0.95 }), "totally different relaxing thing").ui).toEqual({ kind: "committed", mode: "zen" });
  });

  test("promote turns a ghost into a committed card", () => {
    const ghost: DecideMemory = { ui: { kind: "ghost", mode: "zen" }, challenger: null, forcedText: null };
    expect(promote(ghost).ui).toEqual({ kind: "committed", mode: "zen" });
    expect(activeMode(promote(ghost).ui)).toBe("zen");
    expect(activeMode({ kind: "input" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test src/lib/decide.test.ts`
Expected: FAIL — `Cannot find module './decide'`.

- [ ] **Step 3: Write `src/lib/decide.ts`** (port of shapeshift's `decide.ts`, re-typed for game modes)

```ts
import type { GameMode, IntentResult, ModeKey } from "./jev/types";

/*
 * Calm UI state machine, ported from shapeshift's decide.ts.
 * Turns a flickery stream of classifier results into stable card states:
 * a committed mode only changes when a challenger wins twice in a row or is very sure.
 */

export type UiState =
  | { kind: "input" }
  | { kind: "ghost"; mode: GameMode }
  | { kind: "choose"; options: [GameMode, GameMode] }
  | { kind: "committed"; mode: GameMode; forced?: boolean };

export const THRESHOLDS = {
  inputBelow: 0.4,
  commitAt: 0.7,
  chooseGap: 0.15,
  chooseFloor: 0.25,
  challengerOverride: 0.85,
  challengerWins: 2,
  dropBelow: 0.3,
  forcedChangeRatio: 0.3,
} as const;

export type DecideMemory = {
  ui: UiState;
  /** A different mode currently beating the committed one. */
  challenger: { mode: GameMode; wins: number } | null;
  /** Text at the moment the user forced a mode with a chip. */
  forcedText: string | null;
};

export const initialMemory: DecideMemory = { ui: { kind: "input" }, challenger: null, forcedText: null };

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function changedSubstantially(from: string, to: string) {
  const len = Math.max(from.length, to.length, 1);
  return levenshtein(from, to) > THRESHOLDS.forcedChangeRatio * len;
}

function ranked(result: IntentResult): [ModeKey, number][] {
  return (Object.entries(result.mode.probabilities) as [ModeKey, number][]).sort((a, b) => b[1] - a[1]);
}

function nearTie(result: IntentResult): [GameMode, GameMode] | null {
  const r = ranked(result).filter(([k]) => k !== "none");
  if (r.length < 2) return null;
  const [[a, pa], [b, pb]] = r;
  if (pa > THRESHOLDS.chooseFloor && pb > THRESHOLDS.chooseFloor && pa - pb < THRESHOLDS.chooseGap) {
    return [a as GameMode, b as GameMode];
  }
  return null;
}

/** Stateless mapping from a single result to a UI state. */
export function rawState(result: IntentResult): UiState {
  const top = result.mode.value;
  const conf = result.mode.confidence;
  if (top === "none" || conf < THRESHOLDS.inputBelow) {
    // A near-tie can still be worth offering even when neither side is confident.
    const tie = top !== "none" ? nearTie(result) : null;
    return tie ? { kind: "choose", options: tie } : { kind: "input" };
  }
  const tie = nearTie(result);
  if (tie) return { kind: "choose", options: tie };
  if (conf < THRESHOLDS.commitAt) return { kind: "ghost", mode: top };
  return { kind: "committed", mode: top };
}

/** `text` is the text the result was computed for. */
export function decide(mem: DecideMemory, result: IntentResult, text: string): DecideMemory {
  if (!text.trim()) return initialMemory;

  const prev = mem.ui;

  // Forced modes stay until the text changes substantially.
  if (prev.kind === "committed" && prev.forced && mem.forcedText !== null) {
    if (!changedSubstantially(mem.forcedText, text)) return mem;
  }

  const raw = rawState(result);

  if (prev.kind === "committed" && !prev.forced) {
    const current = prev.mode;
    const top = result.mode.value;
    const topConf = result.mode.confidence;
    const currentP = result.mode.probabilities[current] ?? 0;

    if (top === current) return { ui: prev, challenger: null, forcedText: null };

    if (top === "none") {
      if (currentP < THRESHOLDS.dropBelow) return initialMemory;
      return { ...mem, challenger: null };
    }

    if (topConf >= THRESHOLDS.challengerOverride) {
      return { ui: { kind: "committed", mode: top }, challenger: null, forcedText: null };
    }
    const wins = mem.challenger?.mode === top ? mem.challenger.wins + 1 : 1;
    if (wins >= THRESHOLDS.challengerWins && topConf >= THRESHOLDS.inputBelow) {
      return { ui: raw, challenger: null, forcedText: null };
    }
    if (currentP < THRESHOLDS.dropBelow && topConf < THRESHOLDS.inputBelow) return initialMemory;
    return { ui: prev, challenger: { mode: top, wins }, forcedText: null };
  }

  return { ui: raw, challenger: null, forcedText: null };
}

/** User picked a mode chip. */
export function force(mode: GameMode, text: string): DecideMemory {
  return { ui: { kind: "committed", mode, forced: true }, challenger: null, forcedText: text };
}

/** Tab on a ghost: promote without locking. */
export function promote(mem: DecideMemory): DecideMemory {
  if (mem.ui.kind !== "ghost") return mem;
  return { ui: { kind: "committed", mode: mem.ui.mode }, challenger: null, forcedText: null };
}

export function activeMode(ui: UiState): GameMode | null {
  return ui.kind === "committed" || ui.kind === "ghost" ? ui.mode : null;
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `bun test src/lib/decide.test.ts`
Expected: 8 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/decide.ts src/lib/decide.test.ts
git commit -m "feat: calm UI state machine for the game card

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Motion engine

**Files:**
- Create: `src/lib/engine/motion.ts`
- Test: `src/lib/engine/motion.test.ts`

**Interfaces:**
- Produces: `SENS` (index 1–5 → `{ diff, ratio, name }`), `SensLevel`, `NOISY_SHARE = 0.38`, `Pt`, class `Motion { PW; PH; heat; clean; global; frames; alloc(aspect); diffRGBA(rgba, threshold); stampPath(pts, last); get noisy; coverage(cx, cy, r) }`, `captureFrame(video, ctx, pw, ph): Uint8ClampedArray` (browser only).

- [ ] **Step 1: Write the failing test `src/lib/engine/motion.test.ts`**

```ts
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test src/lib/engine/motion.test.ts`
Expected: FAIL — `Cannot find module './motion'`.

- [ ] **Step 3: Write `src/lib/engine/motion.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to see it pass**

Run: `bun test src/lib/engine/motion.test.ts`
Expected: 7 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/motion.ts src/lib/engine/motion.test.ts
git commit -m "feat: port Flicker's pixel-diff motion engine

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Game rules

**Files:**
- Create: `src/lib/engine/game.ts`
- Test: `src/lib/engine/game.test.ts`

**Interfaces:**
- Consumes: `GameSpec` (Task 5); `compile`, `mockClassify` (tests only).
- Produces: `Layout`, `Region`, `TargetKind`, `Target`, `Phase`, `GameEvent`, `RoundStats`, `MAX_DT = 64`, class `Game` with `phase, clock, targets, score, combo, maxCombo, hits, misses, popped, quick, goldHits, hazardHits, level, survivedMs, timeLeft (number|null), lives (number|null)` and methods `setLayout, resetRound, dispX, dispY, rDisp, multiplier, levelCfg(L), toIdle, beginCountdown(): GameEvent[], pause, resume, end(reason): GameEvent[], step(dt): GameEvent[], idle(regionFor), clearPractice, motion(coverage, ratio, blocked): GameEvent[], hit(t): GameEvent[], stats(): RoundStats`.

- [ ] **Step 1: Write the failing test `src/lib/engine/game.test.ts`**

```ts
import { describe, expect, test } from "bun:test";
import { compile } from "../compile";
import { mockClassify } from "../jev/mock";
import type { GameSpec } from "../spec";
import { Game, MAX_DT, type GameEvent, type Layout, type Target } from "./game";

const LAYOUT: Layout = { CW: 800, CH: 600, ox: 0, oy: 0, dw: 800, dh: 600, hudBottom: 100 };
const spec = (text: string) => compile(mockClassify(text), text) as GameSpec;

/** Deterministic PRNG so spawns are repeatable. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Start a round and run through the 3-2-1 countdown. */
function playing(s: GameSpec) {
  const g = new Game(s, LAYOUT, mulberry32(7));
  g.beginCountdown();
  for (let i = 0; i < 60 && g.phase !== "playing"; i++) g.step(MAX_DT);
  expect(g.phase).toBe("playing");
  return g;
}

function run(g: Game, ms: number): GameEvent[] {
  const ev: GameEvent[] = [];
  for (let t = 0; t < ms; t += MAX_DT) ev.push(...g.step(MAX_DT));
  return ev;
}

function addTarget(g: Game, kind: Target["kind"], armedAgo = 1000): Target {
  const t: Target = {
    id: 999 + g.targets.length, kind, practice: false, rf: 0.08, x: 0.5, y: 0.5,
    born: g.clock - armedAgo - 320, armAt: g.clock - armedAgo, dieAt: g.clock + 5000, state: "live", goneAt: 0, hot: 0,
  };
  g.targets.push(t);
  return t;
}

describe("Game — classic", () => {
  test("level curve at level 1 matches Flicker", () => {
    const g = new Game(spec("a normal game"), LAYOUT);
    expect(g.levelCfg(1)).toEqual({ interval: 1150, maxLive: 2, life: 3400, size: 1, hazard: 0, gold: 0.07 });
    expect(g.levelCfg(2).hazard).toBeCloseTo(0.12);
    expect(g.levelCfg(99).interval).toBe(420);
  });

  test("countdown emits 3, 2, 1, Go", () => {
    const g = new Game(spec("a normal game"), LAYOUT);
    const texts = [...g.beginCountdown(), ...run(g, 3000)].filter((e) => e.type === "count").map((e) => (e as { text: string }).text);
    expect(texts).toEqual(["3", "2", "1", "Go"]);
  });

  test("an orb is worth 10 × multiplier, +5 when popped quickly", () => {
    const g = playing(spec("a normal game"));
    g.targets = [];
    const slow = addTarget(g, "orb", 1000);
    expect(g.hit(slow)[0]).toMatchObject({ type: "hit", pts: 10, quick: false });
    const fast = addTarget(g, "orb", 100);
    expect(g.hit(fast)[0]).toMatchObject({ type: "hit", pts: 15, quick: true });
  });

  test("five in a row raises the multiplier, capped at ×5", () => {
    const g = playing(spec("a normal game"));
    g.combo = 4;
    expect(g.hit(addTarget(g, "orb"))[0]).toMatchObject({ multUp: true, pts: 20 });
    g.combo = 100;
    expect(g.multiplier()).toBe(5);
  });

  test("gold gives 50 × mult and bonus time; hazard costs time and combo", () => {
    const g = playing(spec("a normal game"));
    const t0 = g.timeLeft!;
    g.hit(addTarget(g, "gold"));
    expect(g.score).toBe(50);
    expect(g.timeLeft).toBe(t0 + 3000);
    g.combo = 7;
    g.hit(addTarget(g, "hazard"));
    expect(g.combo).toBe(0);
    expect(g.timeLeft).toBe(t0);
  });

  test("levels go up every 8 pops", () => {
    const g = playing(spec("a normal game"));
    const ev: GameEvent[] = [];
    for (let i = 0; i < 8; i++) ev.push(...g.hit(addTarget(g, "orb")));
    expect(g.level).toBe(2);
    expect(ev).toContainEqual({ type: "level", level: 2 });
  });

  test("hazards need two hot frames, orbs need one", () => {
    const g = playing(spec("a normal game"));
    g.targets = [];
    const h = addTarget(g, "hazard");
    g.motion(() => 1, 0.1, false);
    expect(h.state).toBe("live");
    g.motion(() => 1, 0.1, false);
    expect(h.state).toBe("hit");
    const o = addTarget(g, "orb");
    g.motion(() => 1, 0.1, false);
    expect(o.state).toBe("hit");
  });

  test("a noisy frame hits nothing and resets heat", () => {
    const g = playing(spec("a normal game"));
    g.targets = [];
    const h = addTarget(g, "hazard");
    g.motion(() => 1, 0.1, false);
    g.motion(() => 1, 0.1, true);
    expect(h.hot).toBe(0);
    expect(h.state).toBe("live");
  });

  test("a faded orb is a miss and breaks a 3+ combo", () => {
    const g = playing(spec("a normal game"));
    g.targets = [];
    g.combo = 4;
    const o = addTarget(g, "orb");
    o.dieAt = g.clock + 10;
    const ev = g.step(MAX_DT);
    expect(ev).toContainEqual(expect.objectContaining({ type: "miss", comboLost: true, lifeLost: false }));
    expect(g.misses).toBe(1);
  });

  test("always spawns something to hit, never more than maxLive", () => {
    const g = playing(spec("a normal game"));
    run(g, 2000);
    const live = g.targets.filter((t) => t.state === "live");
    expect(live.length).toBeGreaterThan(0);
    expect(live.length).toBeLessThanOrEqual(g.levelCfg(g.level).maxLive);
    for (const t of live) {
      expect(g.dispY(t) - g.rDisp(t)).toBeGreaterThanOrEqual(LAYOUT.hudBottom);
    }
  });

  test("the round ends when time runs out", () => {
    const g = playing(spec("a 15 second game"));
    const ev = run(g, 16_000);
    expect(ev).toContainEqual({ type: "end", reason: "time" });
    expect(g.phase).toBe("over");
    expect(g.timeLeft).toBe(0);
  });

  test("a huge frame gap is clamped, so a background tab can't end the round", () => {
    const g = playing(spec("a normal game"));
    g.step(10_000);
    expect(g.timeLeft).toBe(60_000 - MAX_DT);
    expect(g.phase).toBe("playing");
  });

  test("pause freezes the clock", () => {
    const g = playing(spec("a normal game"));
    g.pause();
    const t = g.timeLeft;
    run(g, 1000);
    expect(g.timeLeft).toBe(t);
    g.resume();
    expect(g.phase).toBe("playing");
  });
});

describe("Game — other modes", () => {
  test("zen: faded dots cost nothing", () => {
    const g = playing(spec("relaxing game for my kids, no bombs"));
    g.targets = [];
    g.combo = 6;
    const o = addTarget(g, "orb");
    o.dieAt = g.clock + 10;
    expect(g.step(MAX_DT).some((e) => e.type === "miss")).toBe(false);
    expect(g.combo).toBe(6);
    expect(g.misses).toBe(0);
  });

  test("survival: no clock, three lives, ends on the last one", () => {
    const g = playing(spec("survive as long as possible"));
    expect(g.timeLeft).toBeNull();
    expect(g.lives).toBe(3);
    g.hit(addTarget(g, "hazard"));
    g.hit(addTarget(g, "hazard"));
    expect(g.lives).toBe(1);
    const ev = g.hit(addTarget(g, "hazard"));
    expect(ev).toContainEqual({ type: "end", reason: "lives" });
    expect(g.phase).toBe("over");
  });

  test("survival counts time survived", () => {
    const g = playing(spec("survive as long as possible"));
    g.targets = [];
    g.step(MAX_DT);
    expect(g.stats().survivedMs).toBe(MAX_DT);
  });

  test("workout pushes most spawns toward the edges", () => {
    const g = playing(spec("workout game, keep me moving"));
    let edge = 0, total = 0;
    for (let i = 0; i < 200; i++) {
      g.targets = [];
      g.step(MAX_DT);
      run(g, 400);
      for (const t of g.targets) {
        total++;
        if (t.x < 0.3 || t.x > 0.7) edge++;
      }
    }
    expect(total).toBeGreaterThan(50);
    expect(edge / total).toBeGreaterThan(0.55);
  });
});

describe("Game — idle practice", () => {
  test("keeps one practice dot in the free region, and popping it doesn't score", () => {
    const g = new Game(spec("a normal game"), LAYOUT, mulberry32(3));
    g.toIdle();
    g.step(MAX_DT * 6);
    for (let i = 0; i < 6; i++) g.step(MAX_DT);
    g.idle(() => ({ x0: 500, x1: 700, y0: 100, y1: 400 }));
    const p = g.targets.find((t) => t.practice)!;
    expect(g.dispX(p)).toBeGreaterThanOrEqual(500);
    for (let i = 0; i < 6; i++) g.step(MAX_DT); // arm it
    const ev = g.motion(() => 1, 0.1, false);
    expect(ev[0].type).toBe("practiceHit");
    expect(g.score).toBe(0);
  });

  test("no free region → no practice dot", () => {
    const g = new Game(spec("a normal game"), LAYOUT);
    g.toIdle();
    for (let i = 0; i < 10; i++) g.step(MAX_DT);
    g.idle(() => null);
    expect(g.targets).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test src/lib/engine/game.test.ts`
Expected: FAIL — `Cannot find module './game'`.

- [ ] **Step 3: Write `src/lib/engine/game.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to see it pass**

Run: `bun test src/lib/engine/game.test.ts`
Expected: 19 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/game.ts src/lib/engine/game.test.ts
git commit -m "feat: spec-driven round rules for classic, blitz, zen and survival

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Progress and effects

**Files:**
- Create: `src/lib/engine/progress.ts`, `src/lib/engine/fx.ts`
- Test: `src/lib/engine/progress.test.ts`, `src/lib/engine/fx.test.ts`

**Interfaces:**
- Consumes: `BadgeDef, GameSpec, Rank, StatKey` (Task 5); `RoundStats` (Task 8); `SensLevel` (Task 7).
- Produces: `SAVE_KEY`, `GameProgress`, `SaveData`, `loadSave(storage | null)`, `writeSave(storage | null, data)`, `browserStorage()`, `gameProgress(save, id)`, `rankOf(xp, ranks) → { i, name, next, frac }`, `newlyEarned(badges, owned, stats, rounds, atEnd)`, `RoundRecord`, `recordRound(save, spec, stats): RoundRecord`; `Particle`, `Floater`, class `Fx { parts; floats; burst(x, y, colors, n); floater(x, y, text, color, size); update(dt); clear() }`.

- [ ] **Step 1: Write the failing tests**

`src/lib/engine/progress.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { compile } from "../compile";
import { mockClassify } from "../jev/mock";
import type { GameSpec } from "../spec";
import type { RoundStats } from "./game";
import { SAVE_KEY, gameProgress, loadSave, newlyEarned, rankOf, recordRound, writeSave } from "./progress";

const spec = compile(mockClassify("a normal combo game"), "a normal combo game") as GameSpec;
const stats = (over: Partial<RoundStats> = {}): RoundStats => ({
  score: 0, hits: 0, misses: 0, maxCombo: 0, quick: 0, goldHits: 0, hazardHits: 0, level: 1, popped: 0, survivedMs: 0, accuracy: 0,
  ...over,
});

function memStorage(initial?: string) {
  const m = new Map<string, string>();
  if (initial !== undefined) m.set(SAVE_KEY, initial);
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("loadSave / writeSave", () => {
  test("round-trips", () => {
    const st = memStorage();
    const s = loadSave(st);
    s.xp = 42;
    s.sens = 4;
    gameProgress(s, "abc").best = 99;
    writeSave(st, s);
    expect(loadSave(st)).toEqual(s);
  });

  test("corrupt or hostile data falls back to safe defaults", () => {
    expect(loadSave(memStorage("{not json")).xp).toBe(0);
    const s = loadSave(memStorage(JSON.stringify({ xp: -5, sens: 9, trails: "yes", games: { a: { best: "x", badges: [1, "first"] } } })));
    expect(s.xp).toBe(0);
    expect(s.sens).toBeNull();
    expect(s.trails).toBe(true);
    expect(s.games.a).toEqual({ best: 0, rounds: 0, xp: 0, badges: ["first"] });
  });

  test("storage that throws is ignored", () => {
    const boom = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadSave(boom).xp).toBe(0);
    expect(() => writeSave(boom, loadSave(null))).not.toThrow();
  });
});

describe("ranks and badges", () => {
  test("rankOf walks the ladder", () => {
    const ranks = [{ xp: 0, name: "A" }, { xp: 100, name: "B" }, { xp: 300, name: "C" }];
    expect(rankOf(0, ranks)).toMatchObject({ name: "A", frac: 0 });
    expect(rankOf(200, ranks)).toMatchObject({ name: "B", frac: 0.5 });
    expect(rankOf(999, ranks)).toMatchObject({ name: "C", next: null, frac: 1 });
  });

  test("mid-round checks skip end-of-round badges", () => {
    const got = newlyEarned(spec.badges, [], stats({ hits: 1, score: 10_000 }), 99, false).map((b) => b.id);
    expect(got).toContain("first");
    expect(got).not.toContain("regular");
  });

  test("already-owned badges are not earned twice", () => {
    expect(newlyEarned(spec.badges, ["first"], stats({ hits: 5 }), 0, false).map((b) => b.id)).not.toContain("first");
  });

  test("noHazards badges need a clean round", () => {
    const acc = compile(mockClassify("careful accuracy game"), "careful accuracy game") as GameSpec;
    const clean = acc.badges.find((b) => b.noHazards)!;
    expect(newlyEarned([clean], [], stats({ score: 5000, hazardHits: 1 }), 1, true)).toHaveLength(0);
    expect(newlyEarned([clean], [], stats({ score: 5000 }), 1, true)).toHaveLength(1);
  });
});

describe("recordRound", () => {
  test("banks score as XP per game and in total, tracks best and badges", () => {
    const save = loadSave(null);
    const r1 = recordRound(save, spec, stats({ score: 700, hits: 30 }));
    expect(r1.isBest).toBe(true);
    expect(save.xp).toBe(700);
    expect(save.games[spec.id]).toMatchObject({ best: 700, rounds: 1, xp: 700 });
    expect(r1.newBadges.map((b) => b.id)).toContain("first");
    expect(r1.rankAfter.i).toBeGreaterThan(r1.rankBefore.i);
    const r2 = recordRound(save, spec, stats({ score: 100, hits: 5 }));
    expect(r2.isBest).toBe(false);
    expect(r2.newBadges.map((b) => b.id)).not.toContain("first");
    expect(save.games[spec.id].best).toBe(700);
  });
});
```

`src/lib/engine/fx.test.ts`:
```ts
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test src/lib/engine/progress.test.ts src/lib/engine/fx.test.ts`
Expected: FAIL — `Cannot find module './progress'` and `'./fx'`.

- [ ] **Step 3: Write `src/lib/engine/progress.ts`**

```ts
import type { BadgeDef, GameSpec, Rank, StatKey } from "../spec";
import type { RoundStats } from "./game";
import type { SensLevel } from "./motion";

/*
 * Saved progress for this browser only. Every storage access is guarded:
 * private windows and blocked storage just play without saving.
 */

export const SAVE_KEY = "flickerforge.v1";

export type GameProgress = { best: number; rounds: number; xp: number; badges: string[] };
export type SaveData = {
  xp: number; // total across every game
  games: Record<string, GameProgress>;
  sens: SensLevel | null; // null = use the game's default
  trails: boolean;
  sound: boolean;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const fresh = (): SaveData => ({ xp: 0, games: {}, sens: null, trails: true, sound: true });
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

function cleanGame(v: unknown): GameProgress {
  const g = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    best: num(g.best),
    rounds: num(g.rounds),
    xp: num(g.xp),
    badges: Array.isArray(g.badges) ? g.badges.filter((b): b is string => typeof b === "string") : [],
  };
}

export function loadSave(storage: StorageLike | null): SaveData {
  const base = fresh();
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (!p || typeof p !== "object") return base;
    const games: Record<string, GameProgress> = {};
    if (p.games && typeof p.games === "object") for (const [id, g] of Object.entries(p.games)) games[id] = cleanGame(g);
    const sens = typeof p.sens === "number" && p.sens >= 1 && p.sens <= 5 ? (Math.round(p.sens) as SensLevel) : null;
    return {
      xp: num(p.xp),
      games,
      sens,
      trails: typeof p.trails === "boolean" ? p.trails : true,
      sound: typeof p.sound === "boolean" ? p.sound : true,
    };
  } catch {
    return base; // corrupt JSON or storage unavailable
  }
}

export function writeSave(storage: StorageLike | null, data: SaveData) {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* storage full or blocked: keep playing */
  }
}

/** The browser's localStorage, or null when the accessor itself throws. */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function gameProgress(save: SaveData, id: string): GameProgress {
  return (save.games[id] ??= { best: 0, rounds: 0, xp: 0, badges: [] });
}

export function rankOf(xp: number, ranks: Rank[]) {
  let i = 0;
  while (i + 1 < ranks.length && xp >= ranks[i + 1].xp) i++;
  const cur = ranks[i], next = ranks[i + 1] ?? null;
  return { i, name: cur.name, next, frac: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1 };
}

function statValue(stat: StatKey, s: RoundStats, rounds: number) {
  return stat === "rounds" ? rounds : s[stat];
}

/** Badges newly earned now. End-of-round badges are only checked when `atEnd`. */
export function newlyEarned(badges: BadgeDef[], owned: string[], s: RoundStats, rounds: number, atEnd: boolean): BadgeDef[] {
  return badges.filter(
    (b) =>
      !owned.includes(b.id) &&
      (atEnd || !b.end) &&
      statValue(b.stat, s, rounds) >= b.min &&
      (!b.noHazards || s.hazardHits === 0),
  );
}

export type RoundRecord = {
  isBest: boolean;
  rankBefore: ReturnType<typeof rankOf>;
  rankAfter: ReturnType<typeof rankOf>;
  newBadges: BadgeDef[];
};

/** Bank a finished round into `save` (mutates it). Score becomes XP. */
export function recordRound(save: SaveData, spec: GameSpec, s: RoundStats): RoundRecord {
  const gp = gameProgress(save, spec.id);
  const rankBefore = rankOf(gp.xp, spec.ranks);
  gp.rounds++;
  gp.xp += s.score;
  save.xp += s.score;
  const isBest = s.score > gp.best;
  if (isBest) gp.best = s.score;
  const newBadges = newlyEarned(spec.badges, gp.badges, s, gp.rounds, true);
  gp.badges.push(...newBadges.map((b) => b.id));
  return { isBest, rankBefore, rankAfter: rankOf(gp.xp, spec.ranks), newBadges };
}
```

- [ ] **Step 4: Write `src/lib/engine/fx.ts`**

```ts
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
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `bun test src/lib/engine/progress.test.ts src/lib/engine/fx.test.ts`
Expected: 10 pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/engine/progress.ts src/lib/engine/progress.test.ts src/lib/engine/fx.ts src/lib/engine/fx.test.ts
git commit -m "feat: saved progress, ranks, stamps and particle effects

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Classifier plumbing — real Jev, the API route, and the browser client

**Files:**
- Create: `src/lib/jev/map.ts`, `src/lib/jev/client.ts`, `src/app/api/intent/route.ts`, `src/lib/classify.ts`
- Test: `src/lib/jev/map.test.ts`, `src/lib/classify.test.ts`

**Interfaces:**
- Consumes: `questions`, `JevQuestions`, types (Task 2); `mockClassify` (Task 3).
- Produces: `toIntentResult(res: SystemOneResult<JevQuestions>, latencyMs): IntentResult`; server-only `jevConfigured(): boolean`, `classifyWithJev(text, signal?)`; `POST /api/intent` `{ text } → IntentResult` (400 on bad body, 499 on abort, `{ ...mock, error: true }` on Jev failure, LRU cache of 500); browser `classify(text, signal?, opts?: { useMock?, basePath?, fetchImpl?, timeoutMs? }): Promise<IntentResult>`, `ROUTE_TIMEOUT_MS = 2500`.

- [ ] **Step 1: Write the failing tests**

`src/lib/jev/map.test.ts`:
```ts
import { expect, test } from "bun:test";
import type { SystemOneResult } from "@typesafe-ai/sdk";
import { toIntentResult } from "./map";
import type { JevQuestions } from "./questions";

const choice = (c: string, conf = 0.9, probabilities: Record<string, number> = { [c]: conf }) => ({
  type: "choice" as const, choice: c, confidence: conf, probabilities,
});

const fake = {
  model: "jev-1.13.0",
  usage: { input_tokens: 10, output_tokens: 5 },
  answers: {
    mode: choice("blitz", 0.8, { blitz: 0.8, classic: 0.15, zen: 0.05 }),
    difficulty: { type: "score", score: 1.7, confidence: 0.8, legend: {}, probabilities: {} },
    pace: choice("frantic"),
    hazards: choice("few"),
    timeBonus: { type: "noul", noul: 0.2 },
    rewardFocus: choice("speed"),
    audience: choice("general"),
    theme: choice("neon"),
  },
} as unknown as SystemOneResult<JevQuestions>;

test("maps a Jev response to IntentResult", () => {
  const r = toIntentResult(fake, 123);
  expect(r.source).toBe("jev");
  expect(r.model).toBe("jev-1.13.0");
  expect(r.latencyMs).toBe(123);
  expect(r.mode.value).toBe("blitz");
  expect(r.mode.probabilities).toEqual({ classic: 0.15, survival: 0, zen: 0.05, blitz: 0.8, none: 0 });
  expect(r.difficulty.score).toBe(3); // 1.7 rounds to level 2 of 0..2 → hard
  expect(r.timeBonus).toEqual({ value: false, confidence: 0.8 });
  expect(r.theme.value).toBe("neon");
});
```

`src/lib/classify.test.ts`:
```ts
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test src/lib/jev/map.test.ts src/lib/classify.test.ts`
Expected: FAIL — `Cannot find module './map'` and `'./classify'`.

- [ ] **Step 3: Write `src/lib/jev/map.ts`**

```ts
import type { SystemOneResult } from "@typesafe-ai/sdk";
import type { JevQuestions } from "./questions";
import { MODES, type Difficulty, type IntentResult, type ModeKey } from "./types";

/** Convert a real Jev response into the app's IntentResult (the mock's shape). */
export function toIntentResult(res: SystemOneResult<JevQuestions>, latencyMs: number): IntentResult {
  const a = res.answers;
  const probabilities = {} as Record<ModeKey, number>;
  for (const k of MODES) probabilities[k] = a.mode.probabilities[k] ?? 0;
  // Jev's score is an expected value over 0..2 and may fall between levels.
  const difficulty = (Math.min(2, Math.max(0, Math.round(a.difficulty.score))) + 1) as Difficulty;
  const bonusP = a.timeBonus.noul;
  return {
    source: "jev",
    model: res.model,
    latencyMs,
    mode: { value: a.mode.choice, confidence: a.mode.confidence, probabilities },
    difficulty: { score: difficulty, confidence: a.difficulty.confidence },
    pace: { value: a.pace.choice, confidence: a.pace.confidence },
    hazards: { value: a.hazards.choice, confidence: a.hazards.confidence },
    timeBonus: { value: bonusP >= 0.5, confidence: Math.max(bonusP, 1 - bonusP) },
    rewardFocus: { value: a.rewardFocus.choice, confidence: a.rewardFocus.confidence },
    audience: { value: a.audience.choice, confidence: a.audience.confidence },
    theme: { value: a.theme.choice, confidence: a.theme.confidence },
  };
}
```

- [ ] **Step 4: Write `src/lib/classify.ts`**

```ts
import { mockClassify } from "./jev/mock";
import { MAX_TEXT, type IntentResult } from "./jev/types";

/*
 * Browser entry point. On GitHub Pages (NEXT_PUBLIC_USE_MOCK=true) the offline
 * classifier runs locally. Otherwise ask /api/intent, and fall back to the
 * offline classifier on any failure: offline is the floor, never an error.
 */

export const ROUTE_TIMEOUT_MS = 2500;

export type ClassifyOptions = {
  useMock?: boolean;
  basePath?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const abortError = () => new DOMException("Aborted", "AbortError");

export async function classify(text: string, signal?: AbortSignal, opts: ClassifyOptions = {}): Promise<IntentResult> {
  const {
    useMock = process.env.NEXT_PUBLIC_USE_MOCK === "true",
    basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "",
    fetchImpl = globalThis.fetch,
    timeoutMs = ROUTE_TIMEOUT_MS,
  } = opts;
  if (signal?.aborted) throw abortError();
  const input = text.slice(0, MAX_TEXT);
  if (useMock) return mockClassify(input);

  const timeout = AbortSignal.timeout(timeoutMs);
  const both = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const res = await fetchImpl(`${basePath}/api/intent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: input }),
      signal: both,
    });
    if (!res.ok) throw new Error(`intent route ${res.status}`);
    const body = (await res.json()) as IntentResult;
    if (body.error || !body.mode) throw new Error("intent route error");
    return body;
  } catch (err) {
    // The caller moved on (newer text): don't produce a stale result.
    if (signal?.aborted) throw abortError();
    return mockClassify(input);
  }
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `bun test src/lib/jev/map.test.ts src/lib/classify.test.ts`
Expected: 9 pass.

- [ ] **Step 6: Write the server pieces (not unit-tested: `server-only` throws outside Next's server runtime)**

`src/lib/jev/client.ts`:
```ts
import "server-only";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { toIntentResult } from "./map";
import { questions } from "./questions";
import type { IntentResult } from "./types";

/* Real Jev. Server only: the API key never reaches the browser. */

let client: TypeSafeClient | null = null;

export const jevConfigured = () => Boolean(process.env.TYPESAFE_API_KEY?.trim());

function getClient() {
  // One fast attempt: a stale answer is worse than falling back to the mock.
  client ??= new TypeSafeClient({ defaultModel: process.env.JEV_MODEL || "jev-latest", retry: { maxRetries: 0 }, timeout: 2500 });
  return client;
}

export async function classifyWithJev(text: string, signal?: AbortSignal): Promise<IntentResult> {
  const t0 = performance.now();
  const res = await getClient().systemOne({ state: { text }, questions }, { signal });
  return toIntentResult(res, Math.round(performance.now() - t0));
}
```

`src/app/api/intent/route.ts`:
```ts
import { classifyWithJev, jevConfigured } from "@/lib/jev/client";
import { mockClassify } from "@/lib/jev/mock";
import { MAX_TEXT, type IntentResult } from "@/lib/jev/types";

/*
 * POST { text } → IntentResult. Server builds only: the static export leaves
 * this file out (pageExtensions: tsx), and the browser uses the offline mock.
 */

const CACHE_MAX = 500;
const cache = new Map<string, IntentResult>();

function remember(key: string, value: IntentResult) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

export async function POST(req: Request) {
  let text: unknown;
  try {
    text = ((await req.json()) as { text?: unknown }).text;
  } catch {
    return Response.json({ error: "Body must be JSON: { text: string }" }, { status: 400 });
  }
  if (typeof text !== "string") return Response.json({ error: "text must be a string" }, { status: 400 });

  const key = text.slice(0, MAX_TEXT).trim().toLowerCase().replace(/\s+/g, " ");
  const hit = cache.get(key);
  if (hit) return Response.json({ ...hit, latencyMs: 0, cached: true });

  if (!jevConfigured() || process.env.NEXT_PUBLIC_USE_MOCK === "true") return Response.json(mockClassify(key));

  try {
    const result = await classifyWithJev(key, req.signal);
    remember(key, result);
    console.info(`[jev] ${result.model} ${result.latencyMs}ms "${key}" → ${result.mode.value}`);
    return Response.json(result);
  } catch (err) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    console.warn("[jev] falling back to mock:", err instanceof Error ? err.message : err);
    return Response.json({ ...mockClassify(key), error: true });
  }
}
```

- [ ] **Step 7: Verify the route by hand**

Run:
```bash
bun run build && (bun run start -p 3917 &) && sleep 3
curl -s -X POST localhost:3917/api/intent -H 'content-type: application/json' -d '{"text":"brutal 30 second reflex test"}' | head -c 120; echo
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3917/api/intent -d 'nope'
pkill -f "next start -p 3917"
TYPESAFE_API_KEY=fake bun run start -p 3918 & sleep 3
curl -s -X POST localhost:3918/api/intent -H 'content-type: application/json' -d '{"text":"zen game"}' | head -c 60; echo
pkill -f "next start -p 3918"
```
Expected: first call returns `{"source":"mock",...,"mode":{"value":"blitz"...`; bad body → `400`; with a fake key the server logs `[jev] falling back to mock: 401 ...` and still returns a `"source":"mock"` result. The static build must still succeed: `STATIC_EXPORT=1 NEXT_PUBLIC_USE_MOCK=true bun run build` and `ls out/api` → "No such file or directory".

- [ ] **Step 8: Commit**

```bash
git add src/lib/jev/map.ts src/lib/jev/map.test.ts src/lib/jev/client.ts src/app/api src/lib/classify.ts src/lib/classify.test.ts
git commit -m "feat: real-Jev route with offline fallback and browser classifier

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: The game stage (canvas, sound, camera, HUD)

**Files:**
- Create: `src/lib/engine/render.ts`, `src/lib/engine/sfx.ts`, `src/lib/engine/stage.ts`, `src/components/GameStage.tsx`

**Interfaces:**
- Consumes: everything in `src/lib/engine/*`, `PALETTES`, `GameSpec`, `BadgeDef` (Task 5).
- Produces: `renderFrame(ctx, game, motion, fx, palette, layout, { dpr, trails, font })`, `DISPLAY_FONT`; `createSfx(enabled: () => boolean)`; `Screen`, `InputKind`, `EndData`, `StageEls`, `StageUi`, `createStage(els, spec, save, ui) → { startCamera, usePointer, beginCountdown, pause, resume, quit, toMenu, setSens, toggleTrails, toggleSound, sensLevel, destroy }`; default export `GameStage({ spec, onExit })`.

These are browser-only (canvas, WebAudio, getUserMedia) and are verified in the running app rather than with unit tests.

- [ ] **Step 1: Write `src/lib/engine/render.ts`**

```ts
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
```

- [ ] **Step 2: Write `src/lib/engine/sfx.ts`**

```ts
/*
 * Tiny WebAudio synth, ported from Flicker. `enabled()` is read on every sound
 * so the mute toggle applies immediately.
 */

export type Sfx = ReturnType<typeof createSfx>;

export function createSfx(enabled: () => boolean) {
  let ac: AudioContext | null = null;

  function ensure() {
    if (!ac) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        try {
          ac = new AC();
        } catch {
          ac = null;
        }
      }
    }
    if (ac && ac.state === "suspended") void ac.resume();
    return ac;
  }

  function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.12, when = 0, slideTo?: number) {
    if (!enabled()) return;
    const a = ensure();
    if (!a) return;
    const t0 = a.currentTime + when;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  return {
    unlock: ensure,
    pop(combo: number) {
      const f = 440 * Math.pow(2, Math.min(combo, 24) / 24);
      tone(f, 0.13, "triangle", 0.17, 0, f * 1.6);
    },
    gold() { [660, 880, 1320].forEach((f, i) => tone(f, 0.13, "sine", 0.13, i * 0.07)); },
    hazard() { tone(170, 0.38, "square", 0.1, 0, 70); },
    miss() { tone(320, 0.14, "sine", 0.05, 0, 220); },
    level() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "triangle", 0.12, i * 0.08)); },
    badge() { tone(988, 0.1, "sine", 0.12); tone(1319, 0.22, "sine", 0.12, 0.09); },
    tick() { tone(1250, 0.05, "square", 0.04); },
    count(go: boolean) { tone(go ? 880 : 440, go ? 0.32 : 0.12, "triangle", 0.15); },
    end() { [784, 659, 523, 392].forEach((f, i) => tone(f, 0.2, "triangle", 0.11, i * 0.11)); },
  };
}
```

- [ ] **Step 3: Write `src/lib/engine/stage.ts`**

```ts
import { PALETTES, type BadgeDef, type GameSpec } from "../spec";
import { Fx } from "./fx";
import { Game, type GameEvent, type Layout, type Region, type RoundStats, type Target } from "./game";
import { Motion, SENS, captureFrame, type Pt, type SensLevel } from "./motion";
import { browserStorage, gameProgress, newlyEarned, recordRound, writeSave, type RoundRecord, type SaveData } from "./progress";
import { DISPLAY_FONT, renderFrame } from "./render";
import { createSfx } from "./sfx";

/*
 * Browser glue for one game: camera/pointer input, the frame loop, HUD text and
 * effects. Ported from Flicker's IIFE. React owns the panels; this owns the canvas,
 * the HUD and every per-frame update, so React never re-renders during play.
 */

export type Screen = "start" | "countdown" | "playing" | "paused" | "over" | "end";
export type InputKind = "camera" | "pointer" | null;
export type EndData = { stats: RoundStats; record: RoundRecord; newBadges: BadgeDef[] };

export type StageEls = {
  stage: HTMLElement; video: HTMLVideoElement; canvas: HTMLCanvasElement; hud: HTMLElement; pauseBtn: HTMLElement;
  score: HTMLElement; level: HTMLElement; time: HTMLElement; timeLabel: HTMLElement; timeBar: HTMLElement; timeTag: HTMLElement;
  mult: HTMLElement; combo: HTMLElement; comboTag: HTMLElement;
  count: HTMLElement; banner: HTMLElement; flash: HTMLElement; live: HTMLElement; toasts: HTMLElement;
  meter: HTMLElement; meterFill: HTMLElement; calNote: HTMLElement;
  startPanel: () => HTMLElement | null;
};

export type StageUi = {
  screen(s: Screen): void;
  ended(d: EndData): void;
  input(k: InputKind, camBlocked: boolean): void;
  status(text: string, error?: boolean): void;
  hint(on: boolean): void;
  toggles(trails: boolean, sound: boolean): void;
};

export type StageApi = ReturnType<typeof createStage>;

const CHECK_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17 19 7" stroke="#1D2340" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CAL_NOTE = "Wave at the practice dot to test it. Raise sensitivity if it’s hard to pop, lower it if it pops on its own.";

export function createStage(els: StageEls, spec: GameSpec, save: SaveData, ui: StageUi) {
  const storage = browserStorage();
  const persist = () => writeSave(storage, save);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const C = PALETTES[spec.theme];
  const sfx = createSfx(() => save.sound);
  const motion = new Motion(128);
  const fx = new Fx(reduceMotion);
  const L: Layout = { CW: 1, CH: 1, ox: 0, oy: 0, dw: 1, dh: 1, hudBottom: 12 };
  const game = new Game(spec, L);
  const ctx = els.canvas.getContext("2d")!;
  const pctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const gp = gameProgress(save, spec.id);
  const sensLevel = (): SensLevel => save.sens ?? spec.sensDefault;
  const fmt = (n: number) => Math.round(n).toLocaleString();
  const font = getComputedStyle(els.stage).getPropertyValue("--display").trim() || DISPLAY_FONT;

  let input: InputKind = null;
  let camBlocked = false;
  let stream: MediaStream | null = null;
  let dpr = 1;
  let raf = 0;
  let lastT = performance.now();
  let procAcc = 0;
  let newVideoFrame = false;
  let rvfc = false;
  let hudDirty = true;
  let noisyFor = 0;
  let hintShown = false;
  let meterNoisy: boolean | null = null;
  let roundBadges: BadgeDef[] = [];
  let destroyed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!destroyed) fn();
    }, ms);
    timers.add(id);
  };

  // ---------------------------------------------------------------- layout
  function measureHud() {
    if (els.hud.hidden) {
      L.hudBottom = 12;
      return;
    }
    const sr = els.stage.getBoundingClientRect(), hr = els.hud.getBoundingClientRect();
    L.hudBottom = hr.bottom - sr.top + 10;
  }

  function layout() {
    const r = els.stage.getBoundingClientRect();
    L.CW = Math.max(1, r.width);
    L.CH = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    els.canvas.width = Math.round(L.CW * dpr);
    els.canvas.height = Math.round(L.CH * dpr);
    let vw = L.CW, vh = L.CH;
    if (input === "camera" && els.video.videoWidth) {
      vw = els.video.videoWidth;
      vh = els.video.videoHeight;
    }
    const s = Math.max(L.CW / vw, L.CH / vh);
    L.dw = vw * s;
    L.dh = vh * s;
    L.ox = (L.CW - L.dw) / 2;
    L.oy = (L.CH - L.dh) / 2;
    const wantPH = Math.max(40, Math.round((motion.PW * vh) / vw));
    if (wantPH !== motion.PH) motion.alloc(vh / vw);
    measureHud();
    if (game.phase === "idle") game.clearPractice(); // the practice dot may now sit under the panel
  }

  function practiceRegion(r: number): Region | null {
    const panel = els.startPanel();
    if (!panel) return null;
    const sr = els.stage.getBoundingClientRect(), pr = panel.getBoundingClientRect();
    const pRight = pr.right - sr.left, pTop = pr.top - sr.top;
    if (L.CW - pRight > 2 * r + 70) return { x0: pRight + r + 36, x1: L.CW - r - 30, y0: r + 30, y1: L.CH - r - 80 };
    if (pTop > 2 * r + 50) return { x0: r + 24, x1: L.CW - r - 24, y0: r + 20, y1: pTop - r - 20 };
    return null;
  }

  // ---------------------------------------------------------------- effects
  const restart = (el: HTMLElement, cls: string) => {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  };
  function kick() {
    restart(els.flash, "on");
    if (!reduceMotion) restart(els.stage, "shake");
  }
  function showCount(text: string, word: boolean) {
    els.count.textContent = text;
    els.count.classList.toggle("word", word);
    restart(els.count, "pop");
  }
  function showBanner(text: string) {
    els.banner.textContent = text;
    restart(els.banner, "show");
  }
  function announce(msg: string) {
    els.live.textContent = "";
    later(() => (els.live.textContent = msg), 30);
  }
  function toast(b: BadgeDef) {
    const el = document.createElement("div");
    el.className = "toast";
    const mark = document.createElement("span");
    mark.className = "stamp-mark got";
    mark.innerHTML = CHECK_SVG;
    const txt = document.createElement("span");
    const s = document.createElement("strong");
    s.textContent = "Stamp earned: " + b.name;
    const d = document.createElement("span");
    d.className = "d";
    d.textContent = b.desc;
    txt.append(s, d);
    el.append(mark, txt);
    els.toasts.append(el);
    later(() => {
      el.classList.add("out");
      later(() => el.remove(), 320);
    }, 3200);
  }
  function setHint(on: boolean) {
    if (on !== hintShown) {
      hintShown = on;
      ui.hint(on);
    }
  }

  // ---------------------------------------------------------------- events
  function checkBadges() {
    for (const b of newlyEarned(spec.badges, gp.badges, game.stats(), gp.rounds, false)) {
      gp.badges.push(b.id);
      roundBadges.push(b);
      persist();
      toast(b);
      sfx.badge();
      announce(`Stamp earned: ${b.name}`);
    }
  }

  function handle(evs: GameEvent[]) {
    for (const e of evs) {
      switch (e.type) {
        case "count":
          showCount(e.text, e.go);
          sfx.count(e.go);
          if (e.go) {
            motion.frames = 0;
            els.pauseBtn.hidden = false;
            ui.screen("playing");
          }
          break;
        case "practiceHit":
          fx.burst(e.x, e.y, [C.yellow, C.pink, C.navy], 16);
          fx.floater(e.x, e.y, "Nice", C.navy, 30);
          sfx.pop(4);
          break;
        case "hit":
          if (e.kind === "gold") {
            fx.burst(e.x, e.y, [C.green, C.yellow, C.white], 24);
            fx.floater(e.x, e.y - 26, `+${spec.bonusMs / 1000}s`, C.green, 30);
            sfx.gold();
          } else {
            if (e.quick) fx.floater(e.x, e.y - 30, "Quick", C.blue, 22);
            fx.burst(e.x, e.y, [C.yellow, C.pink, C.navy], 16);
            sfx.pop(e.combo);
          }
          fx.floater(e.x, e.y, "+" + e.pts, C.navy, 36);
          if (e.multUp) restart(els.comboTag, "pulse");
          hudDirty = true;
          checkBadges();
          break;
        case "hazard":
          fx.burst(e.x, e.y, [C.orange, C.navy], 22);
          fx.floater(e.x, e.y, e.lifeLost ? "−1 life" : `−${spec.penaltyMs / 1000}s`, C.orange, 40);
          sfx.hazard();
          kick();
          hudDirty = true;
          break;
        case "miss":
          if (e.comboLost) fx.floater(e.x, e.y, "Combo lost", C.navy, 24);
          if (e.lifeLost) fx.floater(e.x, e.y + 30, "−1 life", C.orange, 28);
          sfx.miss();
          hudDirty = true;
          break;
        case "level":
          showBanner("Level " + e.level);
          sfx.level();
          announce("Level " + e.level);
          break;
        case "tick":
          sfx.tick();
          break;
        case "end":
          finishRound(e.reason);
          break;
      }
    }
  }

  function finishRound(reason: "time" | "lives" | "quit") {
    els.pauseBtn.hidden = true;
    setHint(false);
    hudDirty = true;
    const stats = game.stats();
    const record = recordRound(save, spec, stats);
    persist();
    sfx.end();
    ui.screen("over");
    showCount(reason === "lives" ? "Out of lives" : reason === "time" ? "Time’s up" : "Round over", true);
    const newBadges = [...roundBadges, ...record.newBadges];
    later(() => {
      if (game.phase !== "over") return;
      els.hud.hidden = true;
      ui.ended({ stats, record, newBadges });
      ui.screen("end");
      announce(`Round over. ${fmt(stats.score)} points.`);
    }, 1000);
  }

  // ---------------------------------------------------------------- motion
  const coverage = (t: Target) => motion.coverage(t.x * motion.PW, t.y * motion.PH, (game.rDisp(t) / (L.dw / motion.PW)) * 0.9);

  function updateMeter() {
    els.meterFill.style.transform = `scaleX(${Math.min(1, motion.global / 0.12).toFixed(3)})`;
    const noisy = motion.noisy;
    if (noisy !== meterNoisy) {
      meterNoisy = noisy;
      els.meter.classList.toggle("noisy", noisy);
      els.calNote.textContent = noisy ? "Too much is moving at once. Keep the camera still and check the lighting." : CAL_NOTE;
    }
  }

  function motionTick() {
    const cam = input === "camera";
    if (cam && game.phase === "idle") updateMeter();
    const noisy = cam && motion.noisy;
    if (game.phase === "playing") {
      noisyFor = noisy ? noisyFor + 33 : 0;
      setHint(noisyFor > 700);
    }
    handle(game.motion(coverage, SENS[sensLevel()].ratio, noisy || motion.frames < 3));
  }

  // pointer input writes into the same mask
  let pts: Pt[] = [];
  let lastPt: Pt | null = null;
  const toProc = (e: PointerEvent): Pt => {
    const r = els.stage.getBoundingClientRect();
    return { x: ((e.clientX - r.left - L.ox) / L.dw) * motion.PW, y: ((e.clientY - r.top - L.oy) / L.dh) * motion.PH };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (input === "pointer") pts.push(toProc(e));
  };
  const onPointerDown = (e: PointerEvent) => {
    if (input === "pointer") {
      lastPt = null;
      pts.push(toProc(e));
    }
  };
  const onPointerLeave = () => (lastPt = null);

  // ---------------------------------------------------------------- HUD + loop
  function drawHud() {
    hudDirty = false;
    els.score.textContent = fmt(game.score);
    els.level.textContent = "Level " + game.level;
    if (game.timeLeft !== null) {
      const sec = Math.max(0, Math.ceil(game.timeLeft / 1000));
      els.time.textContent = String(sec);
      els.timeTag.classList.toggle("low", game.phase === "playing" && sec <= 10);
    } else {
      els.time.textContent = String(game.lives ?? 0);
      els.timeTag.classList.toggle("low", game.phase === "playing" && (game.lives ?? 0) <= 1);
    }
    els.mult.textContent = "×" + game.multiplier();
    els.combo.textContent = game.combo === 0 ? `Pop ${spec.comboPerMult} in a row for ×2` : `${game.combo} in a row`;
  }

  let lastShownSec = -1;
  function frame(t: number) {
    const dt = Math.min(64, t - lastT);
    lastT = t;
    if (input === "camera") {
      if (!rvfc) {
        procAcc += dt;
        if (procAcc >= 33) {
          procAcc = 0;
          newVideoFrame = true;
        }
      }
      if (newVideoFrame && els.video.readyState >= 2 && els.video.videoWidth) {
        newVideoFrame = false;
        motion.diffRGBA(captureFrame(els.video, pctx, motion.PW, motion.PH), SENS[sensLevel()].diff);
        motionTick();
      }
    } else if (input === "pointer") {
      procAcc += dt;
      if (procAcc >= 33) {
        procAcc = 0;
        motion.stampPath(pts, lastPt);
        if (pts.length) lastPt = pts[pts.length - 1];
        pts = [];
        motionTick();
      }
    }

    handle(game.step(dt));
    if (game.phase === "idle" && input) game.idle(practiceRegion);
    if (game.phase !== "paused") fx.update(dt);
    renderFrame(ctx, game, motion, fx, C, L, { dpr, trails: save.trails && input !== null, font });
    if (game.phase === "playing" && game.timeLeft !== null && spec.roundMs) {
      els.timeBar.style.transform = `scaleX(${Math.min(1, Math.max(0, game.timeLeft / spec.roundMs)).toFixed(4)})`;
      const sec = Math.ceil(game.timeLeft / 1000);
      if (sec !== lastShownSec) {
        lastShownSec = sec;
        hudDirty = true;
      }
    }
    if (hudDirty) drawHud();
    raf = requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- camera
  const inFrame = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  function policyBlocksCamera(): boolean | null {
    try {
      const d = document as unknown as { permissionsPolicy?: { allowsFeature(f: string): boolean }; featurePolicy?: { allowsFeature(f: string): boolean } };
      const fp = d.permissionsPolicy ?? d.featurePolicy;
      if (fp && typeof fp.allowsFeature === "function") return !fp.allowsFeature("camera");
    } catch {
      /* unknown */
    }
    return null;
  }
  async function cameraPermission() {
    try {
      return (await navigator.permissions.query({ name: "camera" as PermissionName })).state;
    } catch {
      return null;
    }
  }
  function showBlocked() {
    camBlocked = true;
    ui.status("This page is embedded somewhere that doesn’t allow the camera. Open it in its own browser tab to use your camera, or play with mouse or touch here.", true);
    ui.input(input, camBlocked);
  }

  async function startCamera() {
    sfx.unlock();
    if (!navigator.mediaDevices?.getUserMedia) {
      ui.status("This browser can’t open a camera on this page. Try a current Chrome, Edge, Safari or Firefox over https, or play with mouse or touch.", true);
      return;
    }
    if (policyBlocksCamera() === true) return showBlocked();
    ui.status("Waiting for camera permission…");
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      if (destroyed) return stopStream();
      els.video.srcObject = stream;
      await els.video.play().catch(() => {});
      if (!els.video.videoWidth) await new Promise((res) => els.video.addEventListener("loadedmetadata", res, { once: true }));
      input = "camera";
      if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
        rvfc = true;
        const onFrame = () => {
          newVideoFrame = true;
          if (!destroyed) els.video.requestVideoFrameCallback(onFrame);
        };
        els.video.requestVideoFrameCallback(onFrame);
      }
      els.video.addEventListener("resize", layout);
      ui.input(input, camBlocked);
      layout();
      ui.status("Camera is on. Your movement shows up as pink dots.");
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        const state = await cameraPermission();
        if (state === "denied") ui.status("The camera is turned off for this site. Allow it from the camera or lock icon in the address bar, then press Turn on camera again.", true);
        else if (inFrame) showBlocked();
        else ui.status("Camera access was refused. Allow the camera from the address bar and try again, or play with mouse or touch.", true);
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        ui.status("No camera was found. Connect one and try again, or play with mouse or touch.", true);
      } else if (name === "NotReadableError") {
        ui.status("The camera is in use by another app. Close it there and try again.", true);
      } else {
        ui.status("The camera didn’t start. Try again, or play with mouse or touch.", true);
      }
    }
  }

  function stopStream() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  function usePointer() {
    sfx.unlock();
    stopStream();
    input = "pointer";
    ui.input(input, camBlocked);
    layout();
    ui.status("Mouse and touch mode. Your pointer paints the pink dots the camera would.");
  }

  // ---------------------------------------------------------------- flow
  function beginCountdown() {
    sfx.unlock();
    if (!input) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    roundBadges = [];
    fx.clear();
    els.hud.hidden = false;
    els.timeLabel.textContent = spec.roundMs ? "" : "lives";
    els.timeBar.parentElement!.hidden = !spec.roundMs;
    els.timeBar.style.transform = "scaleX(1)";
    ui.screen("countdown");
    handle(game.beginCountdown());
    measureHud();
    hudDirty = true;
  }
  function pause() {
    if (game.phase !== "playing") return;
    game.pause();
    ui.screen("paused");
  }
  function resume() {
    if (game.phase !== "paused") return;
    motion.frames = 0; // re-prime the diff so a stale frame can't fire hits
    game.resume();
    ui.screen("playing");
    (document.activeElement as HTMLElement | null)?.blur?.();
  }
  function quit() {
    handle(game.end("quit"));
  }
  function toMenu() {
    game.toIdle();
    els.hud.hidden = true;
    els.pauseBtn.hidden = true;
    setHint(false);
    measureHud();
    ui.screen("start");
  }

  // ---------------------------------------------------------------- settings
  function setSens(n: SensLevel) {
    save.sens = n;
    persist();
  }
  function toggleTrails() {
    save.trails = !save.trails;
    persist();
    ui.toggles(save.trails, save.sound);
  }
  function toggleSound() {
    save.sound = !save.sound;
    persist();
    ui.toggles(save.trails, save.sound);
    if (save.sound) sfx.unlock();
  }

  // ---------------------------------------------------------------- wiring
  const onKey = (e: KeyboardEvent) => {
    const inField = (e.target as HTMLElement | null)?.closest?.("input, textarea, select");
    if (e.key === " " || e.key === "p" || e.key === "P" || e.key === "Escape") {
      if (game.phase === "playing") {
        e.preventDefault();
        return pause();
      }
      if (game.phase === "paused" && e.key !== "Escape" && !(e.key === " " && (e.target as HTMLElement | null)?.tagName === "BUTTON")) {
        e.preventDefault();
        return resume();
      }
    }
    if ((e.key === "m" || e.key === "M") && !inField) toggleTrails();
  };
  const onVisibility = () => {
    if (document.hidden) pause();
    else {
      motion.frames = 0;
      lastT = performance.now();
    }
  };
  els.stage.addEventListener("pointermove", onPointerMove);
  els.stage.addEventListener("pointerdown", onPointerDown);
  els.stage.addEventListener("pointerleave", onPointerLeave);
  window.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVisibility);
  const ro = new ResizeObserver(() => layout());
  ro.observe(els.stage);

  els.hud.hidden = true;
  els.pauseBtn.hidden = true;
  if (policyBlocksCamera() === true) showBlocked();
  layout();
  game.toIdle();
  drawHud();
  ui.toggles(save.trails, save.sound);
  raf = requestAnimationFrame((t) => {
    lastT = t;
    raf = requestAnimationFrame(frame);
  });

  function destroy() {
    destroyed = true;
    cancelAnimationFrame(raf);
    for (const id of timers) clearTimeout(id);
    ro.disconnect();
    els.stage.removeEventListener("pointermove", onPointerMove);
    els.stage.removeEventListener("pointerdown", onPointerDown);
    els.stage.removeEventListener("pointerleave", onPointerLeave);
    els.video.removeEventListener("resize", layout);
    window.removeEventListener("keydown", onKey);
    document.removeEventListener("visibilitychange", onVisibility);
    stopStream();
  }

  return { startCamera, usePointer, beginCountdown, pause, resume, quit, toMenu, setSens, toggleTrails, toggleSound, sensLevel, destroy };
}
```

- [ ] **Step 4: Write `src/components/GameStage.tsx`**

Panels stay mounted and are toggled with `hidden` so the element references handed to `createStage` never go stale.

```tsx
"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SENS, type SensLevel } from "@/lib/engine/motion";
import { browserStorage, gameProgress, loadSave, rankOf } from "@/lib/engine/progress";
import { createStage, type EndData, type InputKind, type Screen, type StageApi } from "@/lib/engine/stage";
import { PALETTES, type BadgeDef, type GameSpec } from "@/lib/spec";

const LEDE: Record<GameSpec["mode"], string> = {
  classic: "Your camera sees what moves. Wave at the yellow dots before they fade.",
  blitz: "A short, fast round. Wave at the yellow dots before they fade.",
  zen: "No pressure. Wave at the dots whenever you like; letting one fade costs nothing.",
  survival: "No clock. Every dot you miss and every striped dot you touch costs a life.",
};

function Stamp({ b, got }: { b: BadgeDef; got: boolean }) {
  return (
    <li className={"stamp" + (got ? " got" : "")} aria-label={`${b.name}. ${b.desc} ${got ? "Earned." : "Not earned yet."}`}>
      <span className={"stamp-mark" + (got ? " got" : "")} aria-hidden="true">
        {got && (
          <svg viewBox="0 0 24 24">
            <path d="M5 12.5 10 17 19 7" stroke="#1D2340" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span>
        <strong>{b.name}</strong>
        <span className="d">{b.desc}</span>
      </span>
    </li>
  );
}

export default function GameStage({ spec, onExit }: { spec: GameSpec; onExit: () => void }) {
  const C = PALETTES[spec.theme];
  const saveRef = useRef(loadSave(browserStorage()));
  const api = useRef<StageApi | null>(null);
  const r = {
    stage: useRef<HTMLElement>(null), video: useRef<HTMLVideoElement>(null), canvas: useRef<HTMLCanvasElement>(null),
    hud: useRef<HTMLDivElement>(null), pauseBtn: useRef<HTMLButtonElement>(null), score: useRef<HTMLDivElement>(null),
    level: useRef<HTMLDivElement>(null), time: useRef<HTMLDivElement>(null), timeLabel: useRef<HTMLDivElement>(null),
    timeBar: useRef<HTMLSpanElement>(null), timeTag: useRef<HTMLDivElement>(null), mult: useRef<HTMLDivElement>(null),
    combo: useRef<HTMLDivElement>(null), comboTag: useRef<HTMLDivElement>(null), count: useRef<HTMLDivElement>(null),
    banner: useRef<HTMLDivElement>(null), flash: useRef<HTMLDivElement>(null), live: useRef<HTMLDivElement>(null),
    toasts: useRef<HTMLDivElement>(null), meter: useRef<HTMLDivElement>(null), meterFill: useRef<HTMLSpanElement>(null),
    calNote: useRef<HTMLParagraphElement>(null), startPanel: useRef<HTMLElement>(null),
  };

  const [screen, setScreen] = useState<Screen>("start");
  const [input, setInput] = useState<InputKind>(null);
  const [camBlocked, setCamBlocked] = useState(false);
  const [status, setStatus] = useState({ text: "You'll need a webcam. Stand back far enough that both hands fit in the frame.", error: false });
  const [hint, setHint] = useState(false);
  const [toggles, setToggles] = useState({ trails: true, sound: true });
  const [sens, setSens] = useState<SensLevel>(saveRef.current.sens ?? spec.sensDefault);
  const [end, setEnd] = useState<EndData | null>(null);

  useEffect(() => {
    const need = <T,>(x: { current: T | null }) => x.current as T;
    const stage = createStage(
      {
        stage: need(r.stage), video: need(r.video), canvas: need(r.canvas), hud: need(r.hud), pauseBtn: need(r.pauseBtn),
        score: need(r.score), level: need(r.level), time: need(r.time), timeLabel: need(r.timeLabel), timeBar: need(r.timeBar),
        timeTag: need(r.timeTag), mult: need(r.mult), combo: need(r.combo), comboTag: need(r.comboTag), count: need(r.count),
        banner: need(r.banner), flash: need(r.flash), live: need(r.live), toasts: need(r.toasts), meter: need(r.meter),
        meterFill: need(r.meterFill), calNote: need(r.calNote),
        startPanel: () => (r.startPanel.current && !r.startPanel.current.hidden ? r.startPanel.current : null),
      },
      spec,
      saveRef.current,
      {
        screen: setScreen,
        ended: setEnd,
        input: (k, blocked) => {
          setInput(k);
          setCamBlocked(blocked);
        },
        status: (text, error = false) => setStatus({ text, error }),
        hint: setHint,
        toggles: (trails, sound) => setToggles({ trails, sound }),
      },
    );
    api.current = stage;
    return () => {
      stage.destroy();
      api.current = null;
    };
    // The stage is built once per game; `spec` identity changes mean a new game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  useEffect(() => {
    if (screen === "paused") document.getElementById("resumeBtn")?.focus();
    if (screen === "end") document.getElementById("againBtn")?.focus();
  }, [screen]);

  const gp = gameProgress(saveRef.current, spec.id);
  const rank = rankOf(gp.xp, spec.ranks);
  const hasGold = spec.goldRate > 0;
  const hasHazards = spec.level.hazardMax > 0;
  const themeVars = { "--navy": C.navy, "--blue": C.blue, "--pink": C.pink, "--yellow": C.yellow, "--green": C.green, "--orange": C.orange } as CSSProperties;
  const shots = end ? end.stats.hits + end.stats.misses : 0;

  return (
    <main className="stage" ref={r.stage} data-input={input ?? "none"} style={themeVars}>
      <video className="cam" ref={r.video} playsInline muted autoPlay />
      <div className="tint tint-lift" />
      <div className="tint tint-mult" />
      <canvas className="fx" ref={r.canvas} aria-label="Game area" />
      <div className="flash" ref={r.flash} />

      <div className="hud" ref={r.hud} aria-hidden="true">
        <div className="tag hud-score">
          <div className="big" ref={r.score}>0</div>
          <div className="small" ref={r.level}>Level 1</div>
        </div>
        <div className="tag hud-time" ref={r.timeTag}>
          <div className="big" ref={r.time}>{spec.roundMs ? spec.roundMs / 1000 : spec.lives}</div>
          <div className="small" ref={r.timeLabel} />
          <div className="timebar"><span ref={r.timeBar} /></div>
        </div>
        <div className="tag hud-combo" ref={r.comboTag}>
          <div className="big" ref={r.mult}>×1</div>
          <div className="small" ref={r.combo}>Pop {spec.comboPerMult} in a row for ×2</div>
        </div>
      </div>
      <p className="hint" hidden={!hint}>Too much is moving at once. Keep the camera still and step back a little.</p>
      <div className="count" ref={r.count} aria-hidden="true" />
      <div className="banner" ref={r.banner} aria-hidden="true" />
      <div className="toasts" ref={r.toasts} />

      <div className="controls">
        <button className="icon-btn" ref={r.pauseBtn} aria-label="Pause (Space)" onClick={() => (screen === "paused" ? api.current?.resume() : api.current?.pause())}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" /></svg>
        </button>
        <button className="icon-btn" aria-pressed={toggles.trails} aria-label="Show motion trail (M)" onClick={() => api.current?.toggleTrails()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="2.4" fill="currentColor" /><circle cx="12" cy="9" r="1.8" fill="currentColor" /><circle cx="17.5" cy="12" r="1.3" fill="currentColor" /><circle cx="6" cy="14" r="1.8" fill="currentColor" /><circle cx="11" cy="17" r="1.3" fill="currentColor" /><path className="slash" d="M3 21 21 3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
        </button>
        <button className="icon-btn" aria-pressed={toggles.sound} aria-label="Sound" onClick={() => api.current?.toggleSound()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" /><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /><path className="slash" d="M3 21 21 3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
        </button>
      </div>

      <section className="sheet side" ref={r.startPanel} hidden={screen !== "start"} aria-labelledby="gameTitle">
          <button className="btn link back" onClick={onExit}>← Edit game</button>
          <h1 className="title" id="gameTitle">{spec.name}</h1>
          <p className="lede">{LEDE[spec.mode]}</p>
          <ul className="legend">
            <li>
              <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="21.6" cy="18.6" r="14.5" fill="none" stroke={C.blue} strokeWidth="2.4" /><circle cx="20" cy="20" r="14.5" fill={C.yellow} stroke={C.navy} strokeWidth="2.4" /><circle cx="20" cy="20" r="6" fill="none" stroke={C.navy} strokeWidth="2" /></svg>
              <span><strong>Yellow dot</strong>Points. Pop {spec.comboPerMult} in a row to raise your multiplier, up to ×{spec.multCap}.</span>
            </li>
            {hasGold && (
              <li>
                <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="14.5" fill={C.green} stroke={C.navy} strokeWidth="2.4" /><path d="M20 11.5V20l6 3.5" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" /></svg>
                <span><strong>Green clock</strong>Big points and {spec.bonusMs / 1000} extra seconds.</span>
              </li>
            )}
            {hasHazards && (
              <li>
                <svg viewBox="0 0 40 40" aria-hidden="true"><defs><clipPath id="hzc"><circle cx="20" cy="20" r="14.5" /></clipPath></defs><circle cx="20" cy="20" r="14.5" fill={C.orange} /><g clipPath="url(#hzc)" stroke={C.navy} strokeWidth="3.6"><path d="M-20 0 20 40M-10 0 30 40M0 0 40 40M10 0 50 40M20 0 60 40" /></g><circle cx="20" cy="20" r="14.5" fill="none" stroke={C.navy} strokeWidth="2.4" /></svg>
                <span><strong>Striped dot</strong>{spec.lives ? "Costs a life" : `Costs ${spec.penaltyMs / 1000} seconds`} and your combo. Keep clear.</span>
              </li>
            )}
          </ul>

          <p className={"status" + (status.error ? " error" : "")}>{status.text}</p>
          <div className="cal" hidden={input !== "camera"}>
            <div className="cal-row"><label htmlFor="sens">Motion sensitivity</label><output htmlFor="sens">{SENS[sens].name}</output></div>
            <input
              type="range" id="sens" min={1} max={5} step={1} value={sens}
              onChange={(e) => {
                const n = Number(e.target.value) as SensLevel;
                setSens(n);
                api.current?.setSens(n);
              }}
            />
            <div className="cal-row"><span className="muted">Movement right now</span></div>
            <div className="meter" ref={r.meter}><span ref={r.meterFill} /></div>
            <p className="cal-note" ref={r.calNote}>Wave at the practice dot to test it. Raise sensitivity if it’s hard to pop, lower it if it pops on its own.</p>
          </div>
          {input === "pointer" && <p className="cal-note" style={{ marginBottom: 14 }}>Sweep your mouse or finger across the practice dot to try it.</p>}

          <div className="actions">
            {input && <button className="btn primary" onClick={() => api.current?.beginCountdown()}>Start round</button>}
            {input !== "camera" && !camBlocked && (
              <button className={input ? "btn link" : "btn primary"} onClick={() => api.current?.startCamera()}>
                {input === "pointer" ? "Use camera instead" : "Turn on camera"}
              </button>
            )}
            {!input && <button className="btn link" onClick={() => api.current?.usePointer()}>Play with mouse or touch</button>}
          </div>

          <div className="progress">
            <div className="rank-row"><span>Best score <strong>{gp.best.toLocaleString()}</strong></span><span className="rk">{rank.name}</span></div>
            <div className="bar"><span style={{ transform: `scaleX(${rank.frac.toFixed(4)})` }} /></div>
            <p className="muted">{rank.next ? `${(rank.next.xp - gp.xp).toLocaleString()} XP to ${rank.next.name}. Every point you score is XP.` : "Top rank reached."}</p>
            <details>
              <summary>Stamp card <span className="muted">{gp.badges.length} of {spec.badges.length}</span></summary>
              <ul className="stamps">{spec.badges.map((b) => <Stamp key={b.id} b={b} got={gp.badges.includes(b.id)} />)}</ul>
            </details>
          </div>
          <p className="fineprint">Video stays on this device. Frames are compared inside the page and never uploaded.</p>
      </section>

      {end && (
        <section className="sheet side" hidden={screen !== "end"} aria-labelledby="endScore">
          {(() => {
            const notes = [];
            if (end.record.isBest && end.stats.score > 0) notes.push("New personal best");
            if (end.record.rankAfter.i > end.record.rankBefore.i) notes.push("Rank up: " + end.record.rankAfter.name);
            return notes.length ? <p className="end-note">{notes.join(". ")}</p> : null;
          })()}
          <h2 className="end-score" id="endScore">{end.stats.score.toLocaleString()}</h2>
          <p className="muted">points this round</p>
          <dl className="stats">
            <div><dt>{spec.mode === "survival" ? "Survived" : "Accuracy"}</dt><dd>{spec.mode === "survival" ? `${Math.floor(end.stats.survivedMs / 1000)}s` : shots ? Math.round((end.stats.hits / shots) * 100) + "%" : "–"}</dd></div>
            <div><dt>Best combo</dt><dd>{end.stats.maxCombo}</dd></div>
            <div><dt>Level</dt><dd>{end.stats.level}</dd></div>
            <div><dt>Dots popped</dt><dd>{end.stats.popped}</dd></div>
          </dl>
          {end.newBadges.length > 0 && (
            <div>
              <p style={{ margin: "0 0 4px", fontWeight: 700 }}>New stamps</p>
              <ul className="stamps" style={{ marginBottom: 16 }}>{end.newBadges.map((b) => <Stamp key={b.id} b={b} got />)}</ul>
            </div>
          )}
          <div className="progress" style={{ borderTop: 0, paddingTop: 0, marginBottom: 18 }}>
            <div className="rank-row"><span className="rk">{end.record.rankAfter.name}</span><span>+{end.stats.score.toLocaleString()} XP</span></div>
            <div className="bar"><span style={{ transform: `scaleX(${end.record.rankAfter.frac.toFixed(4)})` }} /></div>
            <p className="muted">{end.record.rankAfter.next ? `${(end.record.rankAfter.next.xp - gp.xp).toLocaleString()} XP to ${end.record.rankAfter.next.name}` : "Top rank reached."}</p>
          </div>
          <div className="actions" style={{ marginBottom: 0 }}>
            <button className="btn primary" id="againBtn" onClick={() => api.current?.beginCountdown()}>Play again</button>
            <button className="btn link" onClick={() => api.current?.toMenu()}>Settings and stamps</button>
            <button className="btn link" onClick={onExit}>Edit game</button>
          </div>
        </section>
      )}

      <section className="sheet center" hidden={screen !== "paused"} role="dialog" aria-labelledby="pauseTitle">
        <h2 className="panel-title" id="pauseTitle">Paused</h2>
        <p className="muted" style={{ marginBottom: 16 }}>Your score and time are frozen.</p>
        <div className="actions">
          <button className="btn primary" id="resumeBtn" onClick={() => api.current?.resume()}>Resume</button>
          <button className="btn link" onClick={() => api.current?.quit()}>End round</button>
        </div>
      </section>

      <div className="sr-only" ref={r.live} role="status" aria-live="polite" />
    </main>
  );
}
```

- [ ] **Step 5: Typecheck and run all tests**

Run: `bun run check`
Expected: typecheck clean; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/engine/render.ts src/lib/engine/sfx.ts src/lib/engine/stage.ts src/components/GameStage.tsx
git commit -m "feat: game stage with camera and pointer input, HUD and effects

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: The editor page

**Files:**
- Create: `src/components/Prompt.tsx`, `src/components/GameCard.tsx`
- Modify: `src/app/page.tsx` (replace the placeholder)

**Interfaces:**
- Consumes: `classify` (Task 10), `compile` (Task 5), `decide/force/promote/activeMode/initialMemory` (Task 6), `loadSave/browserStorage` (Task 9), `GameStage` (Task 11).
- Produces: `Prompt` props `{ text, ui, active, result, onText, onForce, onPromote, onPlay }`, `EXAMPLES`; `GameCard` props `{ spec, result, ghost, onPlay }`; the home page.

- [ ] **Step 1: Write `src/components/Prompt.tsx`**

```tsx
"use client";

import type { UiState } from "@/lib/decide";
import type { GameMode, IntentResult } from "@/lib/jev/types";

export const EXAMPLES = [
  "relaxing game for my kids, no bombs",
  "brutal 30 second reflex test",
  "survive as long as possible, lots of hazards, called Minefield",
  "workout game, 2 minutes, keep me moving",
  "neon combo game with bonus clocks",
];

const MODE_LABEL: Record<GameMode, string> = { classic: "Classic", survival: "Survival", zen: "Zen", blitz: "Blitz" };
const CHIPS: GameMode[] = ["classic", "blitz", "survival", "zen"];

type Props = {
  text: string;
  ui: UiState;
  active: GameMode | null;
  result: IntentResult | null;
  onText(text: string): void;
  onForce(mode: GameMode): void;
  onPromote(): void;
  onPlay(): void;
};

export default function Prompt({ text, ui, active, result, onText, onForce, onPromote, onPlay }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="prompt" className="font-bold">Describe your game</label>
      <textarea
        id="prompt"
        rows={3}
        value={text}
        maxLength={500}
        placeholder="e.g. brutal 30 second reflex test with lots of bombs"
        onChange={(e) => onText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Tab" && ui.kind === "ghost") {
            e.preventDefault();
            onPromote();
          }
          if (e.key === "Enter" && !e.shiftKey && active) {
            e.preventDefault();
            onPlay();
          }
        }}
        className="w-full resize-none rounded-xl border-2 border-line bg-sheet p-4 text-lg text-ink shadow-[5px_5px_0_var(--pink)] outline-none focus:border-pink"
      />

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Game mode">
        {CHIPS.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={active === m}
            onClick={() => onForce(m)}
            className={
              "rounded-full border-2 border-navy px-3 py-1 text-sm font-bold " +
              (active === m ? "bg-yellow text-navy" : "bg-sheet text-ink")
            }
          >
            {MODE_LABEL[m]}
          </button>
        ))}
        {result && (
          <span className="ml-auto text-sm text-ink-soft" aria-live="polite">
            {result.source === "mock" ? "Offline Jev" : `Jev · ${result.model} · ${result.latencyMs}ms`}
          </span>
        )}
      </div>

      {ui.kind === "choose" && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span>Did you mean</span>
          {ui.options.map((m, i) => (
            <span key={m} className="flex items-center gap-2">
              {i > 0 && <span>or</span>}
              <button type="button" className="font-bold underline underline-offset-4" onClick={() => onForce(m)}>{MODE_LABEL[m]}</button>
            </span>
          ))}
          <span>?</span>
        </p>
      )}
      {ui.kind === "ghost" && <p className="text-sm text-ink-soft">Looks like {MODE_LABEL[ui.mode]}. Press Tab to confirm, or pick a mode.</p>}

      {!text.trim() || (ui.kind === "input" && !active) ? (
        <div>
          <p className="mb-2 text-sm text-ink-soft">{text.trim() ? "That doesn’t sound like a game yet. Try one of these:" : "Try one of these:"}</p>
          <ul className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <button type="button" onClick={() => onText(ex)} className="rounded-lg border-2 border-dashed border-ink-soft px-3 py-1 text-left text-sm">
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/GameCard.tsx`**

```tsx
"use client";

import type { IntentResult } from "@/lib/jev/types";
import { PALETTES, type GameSpec } from "@/lib/spec";

const DIFFICULTY = { 1: "Easy", 2: "Normal", 3: "Hard" } as const;

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="border-t-[3px] border-ink pt-1">
      <dt className="text-xs text-ink-soft">{k}</dt>
      <dd className="m-0 font-display text-2xl font-extrabold leading-none">{v}</dd>
    </div>
  );
}

export default function GameCard({ spec, result, ghost, onPlay }: { spec: GameSpec; result: IntentResult; ghost: boolean; onPlay(): void }) {
  const C = PALETTES[spec.theme];
  const hazards = spec.level.hazardMax === 0 ? "None" : spec.level.hazardMax > 0.32 ? "Many" : "Some";
  return (
    <article
      aria-label={`Game: ${spec.name}`}
      className={
        "rounded-2xl border-2 border-line bg-sheet p-6 shadow-[7px_7px_0_var(--pink)] transition-opacity " + (ghost ? "opacity-60" : "")
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="m-0 text-sm font-bold uppercase tracking-wide text-ink-soft">{spec.mode}</p>
          <h2 className="m-0 font-display text-6xl font-black leading-[.85] text-title [text-shadow:4px_3px_0_var(--pink)]">{spec.name}</h2>
        </div>
        <div className="flex gap-1" aria-label={`Theme: ${spec.theme}`}>
          {[C.yellow, C.pink, C.green, C.orange, C.blue].map((c) => (
            <span key={c} className="block h-5 w-5 rounded-full border-2 border-navy" style={{ background: c }} />
          ))}
        </div>
      </div>

      <dl className="my-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Row k={spec.roundMs ? "Round" : "Lives"} v={spec.roundMs ? `${spec.roundMs / 1000}s` : String(spec.lives)} />
        <Row k="Difficulty" v={DIFFICULTY[result.difficulty.score]} />
        <Row k="Hazards" v={hazards} />
        <Row k="Bonus clocks" v={spec.goldRate > 0 ? "Yes" : "No"} />
      </dl>

      <details>
        <summary className="cursor-pointer font-bold">{spec.badges.length} stamps to earn · ranks {spec.ranks[0].name} → {spec.ranks[spec.ranks.length - 1].name}</summary>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {spec.badges.map((b) => (
            <li key={b.id} className="text-sm">
              <strong className="block">{b.name}</strong>
              <span className="text-ink-soft">{b.desc}</span>
            </li>
          ))}
        </ul>
      </details>

      <button
        type="button"
        onClick={onPlay}
        className="mt-5 cursor-pointer rounded-[10px] border-2 border-navy bg-yellow px-6 pt-2.5 pb-3 font-display text-2xl font-extrabold leading-none text-navy active:translate-x-0.5 active:translate-y-0.5"
      >
        Play {spec.name}
      </button>
    </article>
  );
}
```

- [ ] **Step 3: Replace `src/app/page.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import GameCard from "@/components/GameCard";
import GameStage from "@/components/GameStage";
import Prompt from "@/components/Prompt";
import { classify } from "@/lib/classify";
import { compile } from "@/lib/compile";
import { activeMode, decide, force, initialMemory, promote } from "@/lib/decide";
import { browserStorage, loadSave } from "@/lib/engine/progress";
import type { GameMode, IntentResult } from "@/lib/jev/types";
import type { GameSpec } from "@/lib/spec";

const DEBOUNCE_MS = 120;

export default function Home() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<IntentResult | null>(null);
  const [mem, setMem] = useState(initialMemory);
  const [playing, setPlaying] = useState<GameSpec | null>(null);
  const [totalXp, setTotalXp] = useState(0);

  useEffect(() => setTotalXp(loadSave(browserStorage()).xp), [playing]);

  useEffect(() => {
    if (!text.trim()) {
      setResult(null);
      setMem(initialMemory);
      return;
    }
    const ac = new AbortController();
    const id = setTimeout(() => {
      classify(text, ac.signal)
        .then((r) => {
          setResult(r);
          setMem((m) => decide(m, r, text));
        })
        .catch(() => {
          /* aborted: a newer keystroke owns the card now */
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
      ac.abort();
    };
  }, [text]);

  const mode = activeMode(mem.ui);
  const spec = useMemo(
    () => (result && mode ? compile({ ...result, mode: { ...result.mode, value: mode } }, text) : null),
    [result, mode, text],
  );

  const play = () => {
    if (!spec) return;
    setMem((m) => promote(m));
    setPlaying(spec);
  };

  if (playing) return <GameStage spec={playing} onExit={() => setPlaying(null)} />;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="m-0 font-display text-7xl font-black leading-[.82] text-title [text-shadow:4px_3px_0_var(--pink)] sm:text-8xl">
          Flicker Forge
        </h1>
        <p className="mt-3 max-w-prose text-lg">
          Describe a camera motion game in plain words. Jev reads it and builds one you can play with your webcam, mouse or finger.
        </p>
        {totalXp > 0 && <p className="text-sm text-ink-soft">Total XP across your games: {totalXp.toLocaleString()}</p>}
      </header>

      <section className="rounded-2xl border-2 border-line bg-sheet p-5">
        <Prompt
          text={text}
          ui={mem.ui}
          active={mode}
          result={result}
          onText={setText}
          onForce={(m: GameMode) => setMem(force(m, text))}
          onPromote={() => setMem((m) => promote(m))}
          onPlay={play}
        />
      </section>

      {spec && result && <GameCard spec={spec} result={result} ghost={mem.ui.kind === "ghost"} onPlay={play} />}

      <footer className="text-sm text-ink-soft">
        Runs entirely in your browser. Video never leaves this device.{" "}
        <a className="underline" href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/classic.html`}>Play the original Flicker</a>
      </footer>
    </main>
  );
}
```

- [ ] **Step 4: Build the Pages version and play it**

Run:
```bash
bun run check
rm -rf out && STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/flicker NEXT_PUBLIC_USE_MOCK=true bun run build
rm -rf /tmp/ff-site && mkdir -p /tmp/ff-site && cp -R out /tmp/ff-site/flicker
(cd /tmp/ff-site && python3 -m http.server 3919 &)
```
Open `http://localhost:3919/flicker/` and check, with the browser console open:
1. Page renders with Flicker fonts and colours (light and dark OS theme).
2. Click the example "brutal 30 second reflex test" → card "Frantic Blitz", 30s, Hard; badge reads "Offline Jev".
3. Play → "Play with mouse or touch" → practice dot appears beside the panel; sweeping the pointer across it shows "Nice".
4. Start round → 3-2-1-Go; sweeping dots scores, shows "Stamp earned: First contact"; Space pauses; switching tabs pauses.
5. End round → end panel with score, accuracy, stamps; "Settings and stamps" shows the best score; "← Edit game" returns with "Total XP across your games" shown.
6. Type "survive as long as possible, lots of hazards, called Minefield" → Play → HUD shows `3` "lives", no time bar, no green clock in the legend.
7. "Turn on camera" (https or localhost only) → allow → pink motion dots follow you; the sensitivity slider and meter respond.
8. "Play the original Flicker" link opens `/flicker/classic.html`.
Expected: all eight behave as described and the console shows no errors. Stop the server with `pkill -f "http.server 3919"`.

- [ ] **Step 5: Commit**

```bash
git add src/components/Prompt.tsx src/components/GameCard.tsx src/app/page.tsx
git commit -m "feat: describe-a-game editor with live game card

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: README, CI dry run and deploy handoff

**Files:**
- Modify: `README.md`
- Existing: `.github/workflows/pages.yml` (no change expected)

- [ ] **Step 1: Write `README.md`**

````markdown
# Flicker Forge

Describe a camera motion game in plain words — "brutal 30 second reflex test",
"relaxing game for my kids, no bombs" — and Jev turns it into a Flicker game you
play with your webcam, mouse or finger.

**Jev decides, code computes.** Jev (TypeSafe AI's classifier) answers eight typed
questions about your description in parallel: mode, difficulty, pace, hazards,
bonus clocks, reward focus, audience and theme. Deterministic code parses
durations, target counts and names, and compiles everything into a `GameSpec`.

## Run it

```bash
bun install
bun run dev        # http://localhost:3000
bun run check      # typecheck + tests
```

Works fully offline by default with a built-in keyword classifier that returns
the same shape as Jev. To use real Jev, set `TYPESAFE_API_KEY` (and optionally
`JEV_MODEL`) in `.env.local`; the key is only read on the server.

| Variable | Where | Effect |
|---|---|---|
| `TYPESAFE_API_KEY` | server | enables real Jev in `/api/intent` |
| `JEV_MODEL` | server | pin a model, default `jev-latest` |
| `NEXT_PUBLIC_USE_MOCK` | build | `true` forces the offline classifier |
| `STATIC_EXPORT` | build | `1` builds static files for GitHub Pages |
| `NEXT_PUBLIC_BASE_PATH` | build | sub-path for Pages, e.g. `/flicker` |

## Deploy

- **GitHub Pages (offline Jev):** push to `master`; `.github/workflows/pages.yml`
  tests, builds the static export and deploys. One-time: Settings → Pages →
  Source: GitHub Actions.
- **Vercel (real Jev):** import the repo and set `TYPESAFE_API_KEY`. No code changes.

The original single-file game is still at `/classic.html`.
Video never leaves the device: frames are compared inside the page.
````

- [ ] **Step 2: Dry-run exactly what CI runs**

Run:
```bash
rm -rf node_modules out .next
bun install --frozen-lockfile
bun test
STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/flicker NEXT_PUBLIC_USE_MOCK=true bun run build
test -f out/index.html && test -f out/classic.html && ! test -d out/api && echo "pages artifact ok"
```
Expected: install succeeds with the committed lockfile, all tests pass, and the last line prints `pages artifact ok`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README for Flicker Forge

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Hand off the deploy (needs the user)**

The repo has no remote yet. Ask the user to create the GitHub repository and confirm before pushing. Then, with their go-ahead:
```bash
git remote add origin git@github.com:<user>/<repo>.git
git push -u origin feat/flicker-forge
```
Merge to `master` (PR or fast-forward, the user's choice), set Settings → Pages → Source: GitHub Actions, and watch the "Deploy to GitHub Pages" run. The site appears at `https://<user>.github.io/<repo>/`.
