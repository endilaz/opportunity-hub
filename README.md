# CMU CS Opportunity Hub

A self-updating research, internship & hackathon hub for CMU CS undergrads. Browse / Calendar /
Tracker / Dashboard views, with live opportunity data from two free sources:

- **Internships** — pulled straight from the public
  [SimplifyJobs internship list](https://github.com/SimplifyJobs/Summer2026-Internships)
  on GitHub. **No API key needed.**
- **CMU research, REUs, hackathons, and AI-curated internships** — discovered
  via the **Google Gemini free tier** with Google Search grounding (free API
  key, no credit card). An Anthropic key works as an optional paid fallback.
  Reputable flagship hackathons (TartanHacks, HackMIT, PennApps, Cal Hacks,
  TreeHacks) also ship in the seed data, so they're present even with no key.

## Run it locally

```sh
npm install
npm run dev
```

That's it — the app works with zero keys: ~15 seed opportunities plus the live
internship feed. To enable research/REU discovery too:

```sh
cp .env.example .env.local   # then paste a free Gemini key from aistudio.google.com/apikey
```

and restart the dev server.

## Notes

- **Key precedence**: `VITE_GEMINI_API_KEY` (free) → `VITE_ANTHROPIC_API_KEY`
  (paid fallback) → no key (LLM categories are skipped; the internship feed and
  seeds still work). Keys are read at dev-server start — restart after changing
  `.env.local`. Keys are used directly from the browser — fine for personal
  local use, but don't deploy a build of this publicly with a key baked in.
- **Feed sources** live in `INTERNSHIP_FEED_URLS` near the top of the fetch
  machinery in `cmu-cs-opportunity-hub.jsx`. URLs are tried in order and the
  first that responds wins, so add the new season's SimplifyJobs
  `listings.json` URL at the top each recruiting cycle (a URL that 404s is
  skipped harmlessly). Any SimplifyJobs-style `listings.json` URL works.
- **Persistence** is localStorage-backed via `src/storage-shim.js`, which emulates
  the artifact runtime's `window.storage` API. Saves, notes, tracker state, and
  the opportunity cache all survive reloads.
- **Seed data** lives in `SEED_OPPORTUNITIES` at the top of
  `cmu-cs-opportunity-hub.jsx` — edit freely.
