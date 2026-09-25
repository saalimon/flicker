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
