# CMU CS Opportunity Hub

A self-updating research & internship hub for CMU CS undergrads. Browse / Calendar /
Tracker / Dashboard views, with live opportunity data pulled from the web via the
Anthropic API (Claude + web search).

## Run it locally

```sh
npm install
cp .env.example .env.local   # then paste your Anthropic API key into .env.local
npm run dev
```

Open the printed localhost URL. The app works immediately with ~15 seed
opportunities; the **Refresh opportunities** button (and the automatic
stale-cache refresh) needs the API key.

## Notes

- **Persistence** is localStorage-backed via `src/storage-shim.js`, which emulates
  the artifact runtime's `window.storage` API. Saves, notes, tracker state, and
  the opportunity cache all survive reloads.
- **API key**: `VITE_ANTHROPIC_API_KEY` in `.env.local` is read at dev-server start
  (restart after changing it). The key is used directly from the browser — fine
  for personal local use, but don't deploy a build of this publicly with your key
  baked in.
- **Seed data** lives in `SEED_OPPORTUNITIES` at the top of
  `cmu-cs-opportunity-hub.jsx` — edit freely.
