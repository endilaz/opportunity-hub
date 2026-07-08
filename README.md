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

## Sync across devices

By default everything lives in this browser's localStorage. To make your saves,
notes, tracker, and opportunity list follow you anywhere:

1. Create a GitHub **classic** token with **only the `gist` scope**
   ([direct link](https://github.com/settings/tokens/new?scopes=gist&description=Opportunity%20Hub%20sync)).
   Fine-grained tokens don't cover the Gist API — use a classic one.
2. In the app, open **⚙ settings → Sync across devices** and paste the token.

The app stores all data in a single **secret gist** on your account and keeps
localStorage as an offline cache. Paste the same token on any other
browser/device and it attaches to the same gist — when sync data already
exists, a newly connected device adopts the cloud copy, and after that merges
are newest-wins per record. The app pulls at startup, on window focus, and
every 5 minutes, and pushes a couple of seconds after you change anything.
The token itself never syncs; it stays on each device. **Disconnect** stops
syncing but keeps both the local data and the gist.

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
- **Persistence** goes through `src/storage-shim.js`, which emulates the
  artifact runtime's `window.storage` API on top of localStorage and adds the
  optional GitHub Gist sync described above. Saves, notes, tracker state, and
  the opportunity cache all survive reloads (and follow you across devices
  once sync is connected).
- **Seed data** lives in `SEED_OPPORTUNITIES` at the top of
  `cmu-cs-opportunity-hub.jsx` — edit freely.
