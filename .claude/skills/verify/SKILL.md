---
name: verify
description: Build, launch, and drive the Opportunity Hub SPA to verify changes at the UI surface.
---

# Verifying opportunity-hub

Client-only React 18 + Vite SPA. The whole app is `cmu-cs-opportunity-hub.jsx`; state persists to localStorage via `src/storage-shim.js` (keys prefixed `cmu-opportunity-hub:`).

## Launch

```sh
npm install
npx vite --port 5199 --strictPort        # run in background
```

Env vars are baked at server start: to test a key path, prefix the command
(`VITE_GEMINI_API_KEY=... npx vite --port 5200 --strictPort`) — `.env.local` also works but requires restart. No `.env.local` = keyless/feed-only mode.

## Drive (headless, no browser download)

`npm i -D playwright` then use `chromium.launch({ channel: "msedge" })` — uses system Edge, nothing downloaded. **The script must live inside the project dir** for ESM to resolve `playwright`; uninstall playwright and delete the script afterwards so the working tree stays clean (also `git checkout -- package-lock.json` if npm annotated it).

Flows worth driving:
- Boot with empty storage → stale-on-boot refresh fires ~300ms after render. Wait for `Refreshing…` to disappear from `document.body.innerText`.
- Click the "Refresh opportunities" button for a manual refresh; capture the toast text (`Found N new opportunities…` / `You're up to date…`, includes `(N of M sources failed)` on partial failure).
- Red failure banner contains "Refresh failed."; keyless info banner contains "Internship listings update live for free".
- Watch network responses matching `githubusercontent|generativelanguage|anthropic` to see which fetchers ran (feed URLs are tried in order — a 404 on the newest season repo is expected fallthrough, and logs a console error harmlessly).
- Merged items land in localStorage key `cmu-opportunity-hub:cmu-opps-cache`; feed items have ids starting `simplify-`.

## Gotchas

- A real `.env.local` may exist with a live Gemini key — Vite loads it for every server. To force a specific key scenario, set the var on the command line (shell env overrides `.env.local`); an empty-string shell var does NOT override, so use a fake value to test failure paths. A truly keyless run requires temporarily renaming `.env.local`.

- Live Gemini/Anthropic categories need real keys; a fake key exercises the partial-failure path (feed succeeds, LLM categories 400, no red banner).
- Playwright always starts with a fresh profile, so every run is a cold boot (empty cache → boot refresh always fires).
