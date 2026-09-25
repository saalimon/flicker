# Flicker Forge — design

Date: 2026-09-25
Status: approved in chat, awaiting written-spec review

## 1. Goal

A shapeshift-style platform: the player types a plain-language description of a
game ("brutal 30 second reflex test"), a Jev classifier reads it, and the page
morphs into a playable Flicker camera game configured to match — mode,
difficulty, duration, hazards, badges and ranks.

It must run fully offline (built-in Jev-shaped keyword classifier) and deploy to
GitHub Pages via GitHub Actions. Real Jev is used only when a server with
`TYPESAFE_API_KEY` is available (dev or Vercel).

Reference projects:
- `flicker-play-locally.html` (this repo): the camera game engine and
  gamification being generalised.
- https://github.com/anishfn/shapeshift: Jev question schema, offline mock with
  identical output shape, calm UI state machine (`decide.ts`), `/api/intent`.

### Success criteria

1. Typing any of the example prompts in §4.4 produces the listed mode and
   settings with no network access.
2. Clicking Play starts a round that plays exactly like Flicker, with
   camera or mouse/touch, using the generated settings.
3. Push to `master` runs tests, builds the static export and publishes it to
   GitHub Pages, where the camera works over HTTPS.
4. With `TYPESAFE_API_KEY` set in a server deployment, `/api/intent` answers from
   real Jev and falls back to the mock on any failure.

### Out of scope

Accounts, shared leaderboards, multiplayer, game types other than dot-popping.

## 2. Stack

Next.js 16 (App Router), TypeScript strict, React 19, Tailwind CSS v4, Bun,
`@typesafe-ai/sdk` 0.6. No shadcn/Motion: the game draws on a canvas and keeps
Flicker's own visual language (Big Shoulders — Google's current name for Big
Shoulders Display — and Atkinson Hyperlegible, self-hosted by `next/font`;
navy/blue/pink/yellow/green/orange print palette, light and dark).

## 3. Architecture

### 3.1 Two build modes from one codebase

| | Static (GitHub Pages) | Server (dev / Vercel) |
|---|---|---|
| Trigger | `STATIC_EXPORT=1` | default |
| Next output | `output: 'export'`, `basePath = NEXT_PUBLIC_BASE_PATH`, `images.unoptimized` | normal |
| `pageExtensions` | `['tsx']` — the `.ts` API route is excluded | `['tsx', 'ts']` |
| Classifier | mock, in the browser (`NEXT_PUBLIC_USE_MOCK=true`) | `/api/intent` → real Jev if key set, else mock |

Client rule (`src/lib/classify.ts`): if `NEXT_PUBLIC_USE_MOCK === 'true'`, run
the mock locally. Otherwise POST `/api/intent`; on non-2xx, network error,
`error: true` in the body, or 2.5 s timeout, run the mock locally. Stale
requests are aborted when the text changes (debounce 120 ms).

### 3.2 File layout

```
src/lib/jev/questions.ts    typed Jev question list (§4.1)
src/lib/jev/types.ts        ModeKey, answer shapes, IntentResult
src/lib/jev/mock.ts         offline keyword classifier → IntentResult
src/lib/jev/client.ts       server-only: TypeSafeClient.systemOne call
src/lib/classify.ts         browser entry: route or mock
src/lib/decide.ts           calm UI state machine (ported from shapeshift)
src/lib/parse.ts            deterministic parsers: duration, target count, name
src/lib/compile.ts          IntentResult + text → GameSpec
src/lib/spec.ts             GameSpec type, theme palettes, stable id hash
src/lib/engine/motion.ts    pixel-diff tracker (camera + pointer)
src/lib/engine/game.ts      round state, spawn, hit, score, level, lives
src/lib/engine/render.ts    canvas drawing (targets, trail, particles, floats)
src/lib/engine/sfx.ts       WebAudio synth
src/lib/engine/progress.ts  localStorage persistence, ranks, badge checks
src/lib/engine/fx.ts        confetti particles and floating score text
src/lib/engine/stage.ts     browser glue: camera/pointer, frame loop, HUD, effects
src/lib/jev/map.ts          real Jev response → IntentResult (pure, testable)
src/components/Prompt.tsx   text box + mode chips
src/components/GameCard.tsx live preview of the GameSpec
src/components/GameStage.tsx canvas/video/HUD/panels; owns the engine
src/app/page.tsx            composes Prompt → GameCard → GameStage
src/app/api/intent/route.ts POST { text } → IntentResult (server build only)
public/classic.html         untouched copy of flicker-play-locally.html
.github/workflows/pages.yml CI deploy (exists)
```

Each unit is pure and testable except `GameStage`, `sfx`, `classify` and the
route. `engine/*` has no React dependency.

## 4. Jev: questions, mock, decisions

"Jev decides, code computes." Jev only classifies; every number comes from code.

### 4.1 Questions

| Key | Kind | Options |
|---|---|---|
| `mode` (primary intent) | choice | `classic`, `survival`, `zen`, `blitz`, `none` |
| `difficulty` | score | 1 easy, 2 normal, 3 hard |
| `pace` | choice | `chill`, `steady`, `frantic` |
| `hazards` | choice | `none`, `few`, `many` |
| `timeBonus` | boolean | include green clocks |
| `rewardFocus` | choice | `combo`, `accuracy`, `speed`, `collecting` |
| `audience` | choice | `kids`, `general`, `workout` |
| `theme` | choice | `flicker`, `neon`, `pastel`, `mono` |

Each question has a self-contained prompt and an escape option / neutral
default, following shapeshift's schema rules.

### 4.2 IntentResult shape (same for mock and real Jev)

```ts
type IntentResult = {
  source: 'jev' | 'mock';
  model: string;             // e.g. 'jev-1.13.0' or 'mock'
  latencyMs: number;
  mode: { value: ModeKey; confidence: number; probabilities: Record<ModeKey, number> };
  difficulty: { score: 1 | 2 | 3; confidence: number };
  pace:        { value: Pace;        confidence: number };
  hazards:     { value: Hazards;     confidence: number };
  timeBonus:   { value: boolean;     confidence: number };
  rewardFocus: { value: RewardFocus; confidence: number };
  audience:    { value: Audience;    confidence: number };
  theme:       { value: Theme;       confidence: number };
  error?: boolean;
};
```

### 4.3 Mock classifier

Regex keyword scoring per mode (e.g. survival: `surviv|lives|last|endless|as long as`;
zen: `relax|calm|chill|zen|no (bombs|hazards)|peaceful`; blitz:
`quick|fast|blitz|brutal|reflex|\b(10|15|20|30) ?s(ec)?`), a small base score for
`classic` when any game word (`game|round|dots|pop|play`) appears, and `none`
otherwise. Scores → softmax (temperature as in shapeshift) → probabilities;
confidence = top probability. Mutual-exclusion caps (e.g. zen ≥ strong ⇒ hazards
forced to `none`, blitz capped when survival is strong). Signals use the same
keyword approach with a neutral default and low confidence when nothing matches.
Deterministic: same text ⇒ same result.

### 4.4 Required mock outcomes (tests)

| Prompt | mode | other |
|---|---|---|
| `relaxing game for my kids, no bombs` | zen | audience kids, hazards none, difficulty 1 |
| `brutal 30 second reflex test` | blitz | difficulty 3, rewardFocus speed, duration 30 s |
| `survive as long as possible, lots of hazards, called Minefield` | survival | hazards many, name "Minefield" |
| `a normal 60 second dot popping game` | classic | difficulty 2, duration 60 s |
| `workout game, 2 minutes, keep me moving` | classic | audience workout, pace frantic, duration 120 s |
| `buy milk and eggs` | none | Play disabled |

### 4.5 Calm state machine

`decide.ts` ported from shapeshift unchanged in behaviour, re-typed for
`ModeKey`: states `input | ghost | choose | committed`, thresholds
`inputBelow 0.4, commitAt 0.7, chooseGap 0.15, chooseFloor 0.25,
challengerOverride 0.85, challengerWins 2, dropBelow 0.3, forcedChangeRatio 0.3`,
plus `force()` (mode chip) and `promote()` (Tab on a ghost).

## 5. GameSpec compiler

```ts
type GameSpec = {
  id: string;            // stable hash of the fields below (not of the text)
  name: string;          // parsed name or generated "<Pace> <Mode>"
  mode: 'classic' | 'survival' | 'zen' | 'blitz';
  theme: Theme;
  roundMs: number | null;   // null in survival
  lives: number | null;     // 3 in survival, else null
  countMisses: boolean;     // false in zen
  edgeBias: number;         // 0..1; 0.6 for workout (targets toward frame edges)
  level: { interval0, intervalStep, intervalMin, maxLive0, maxLiveCap,
           life0, lifeStep, lifeMin, size0, sizeStep, sizeMin,
           hazardStartLevel, hazard0, hazardStep, hazardMax, popsPerLevel, maxLevel };
  goldRate: number;         // 0 when !timeBonus or in survival
  bonusMs: number; penaltyMs: number;
  multCap: number; comboPerMult: number;
  sensDefault: 1..5; targetScale: number;
  badges: BadgeDef[];       // ~8
  ranks: { xp: number; name: string }[];  // 6
};
```

Rules:
- Baseline = Flicker's current constants (60 s, `levelCfg` formula, ×5 cap,
  5 pops per multiplier step, 8 pops per level, ±3 s).
- `difficulty` and `pace` scale interval/life/size (hard ≈ Flicker level 3
  values at level 1). `blitz` defaults to 30 s and frantic; `zen` sets hazard
  rate 0, no misses break anything, 90 s default.
- `hazards`: none 0, few = Flicker curve, many = curve × 1.8 capped at 0.45.
- `audience`: kids → targetScale 1.3, sensDefault 4, no hazards before level 3;
  workout → targets spawn toward the frame edges (bigger reach).
- Parsed duration overrides the default, clamped to 15 s – 5 min. Parsed target
  count ("pop 100") adds a "Finish line" badge for that count.
- Badges are templated from `rewardFocus` + difficulty thresholds (e.g. combo
  focus hard ⇒ "Unbroken: 40-pop combo"); always includes "First contact" and
  a mode-specific badge (survival: "Last one standing — survive 90 s").
- Ranks: 6 names chosen from a themed list per `rewardFocus`, XP thresholds
  scaled by expected points per round.

## 6. Engine port

Line-faithful TS port of `flicker-play-locally.html`, with hard-coded
constants replaced by `GameSpec` fields.

- `motion.ts`: 128-px processing canvas, luma `(77R+150G+29B)>>8`, threshold by
  sensitivity table, 4-neighbour denoise, 38 % global-motion guard, heat decay
  0.82, pointer path stamping into the same mask, circle coverage.
- `game.ts`: modes `idle | countdown | playing | paused | over`; survival
  decrements a life on each missed orb or hazard hit and ends at 0; zen never
  counts misses; hazards need 2 consecutive hot frames.
- `render.ts`: orb / clock / hazard / countdown ring / halftone trail /
  particles / floaters; colours come from the theme palette.
- `progress.ts`: key `flickerforge.v1`, `{ xp, games: { [id]: { best, rounds,
  xp, badges[] } }, sens, trails, sound }`; every access in try/catch; corrupt
  data falls back to defaults field by field. Each game's rank uses that game's
  ladder and that game's XP; the home page shows total XP across all games.
- `stage.ts` + `GameStage.tsx`: `stage.ts` owns the canvas, HUD text and the
  rAF loop (no React re-renders during play); `GameStage.tsx` renders Flicker's
  markup and CSS and toggles the start/end/pause sheets with `hidden` (never
  unmounted, so the stage's element references stay valid). Keeps the live region, reduced-motion handling, Space/P/Esc
  pause, M for trails, auto-pause on tab hide, and all camera error messages.
  The "download the game" path from the original is dropped (not needed on Pages).

## 7. Error handling

- Classifier: route failures/timeouts ⇒ local mock; UI shows an "offline Jev"
  badge whenever `source === 'mock'`. Aborted requests are ignored.
- API route: 400 on bad body; 499 on client abort; `{ error: true }` on Jev failure;
  LRU cache (500) keyed by normalised text; API key read only on the server.
- `none` / empty input ⇒ example prompts shown, Play disabled.
- Camera: Flicker's messages for NotAllowed / NotFound / NotReadable / policy
  block, plus mouse/touch fallback.
- Storage unavailable ⇒ play without saving.

## 8. Testing

`bun test`, run in CI before the build:
- `mock.test.ts` — §4.4 table; probabilities sum to 1 (±1e-6); determinism.
- `decide.test.ts` — challenger needs 2 wins; ≥ 0.85 overrides; near-tie ⇒
  `choose`; forced mode survives small edits, drops on > 30 % change.
- `parse.test.ts` / `compile.test.ts` — durations ("30s", "45 seconds",
  "2 min", "1.5 minutes"), clamping, name parsing, badge templating, zen has
  zero hazards, stable `id` for equal specs.
- `motion.test.ts` — synthetic frames: moving block inside a target ⇒ coverage
  above threshold; > 38 % motion ⇒ flagged noisy.

Manual: `STATIC_EXPORT=1 NEXT_PUBLIC_USE_MOCK=true bun run build`, serve `out/`,
play one pointer round and one camera round per mode.

## 9. Deployment

`.github/workflows/pages.yml` (already added): on push to `master` or manual run
→ checkout → setup-bun → configure-pages → `bun install --frozen-lockfile` →
`bun test` → `bun run build` with `STATIC_EXPORT=1`,
`NEXT_PUBLIC_BASE_PATH=<pages base_path>`, `NEXT_PUBLIC_USE_MOCK=true` →
upload `out/` → deploy-pages. One-time: create the GitHub repo, push, set
Settings → Pages → Source: GitHub Actions. `bun.lock` must be committed.

Optional online Jev: deploy the same repo to Vercel with `TYPESAFE_API_KEY`
(and optionally `JEV_MODEL`); no code changes.
