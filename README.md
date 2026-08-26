# CMU CS Opportunity Hub

A self-updating research, internship & hackathon hub for CMU CS undergrads. Browse / Calendar /
Tracker / Dashboard views, with live opportunity data from two free sources:

- **Internships** — pulled straight from the public
  [SimplifyJobs internship list](https://github.com/SimplifyJobs/Summer2026-Internships)
  on GitHub, plus **any other job board you add yourself** (see below).
  **No API key needed.**
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

## Add your own job boards

The built-in SimplifyJobs list is just the default. Open **⚙ settings → Job
board feeds**, paste a URL, and hit **Add board** — it's checked immediately
(you'll see how many listings it found, or why it failed) and then scraped on
every refresh alongside everything else. Each board is its own source, so one
that breaks doesn't take down the rest of a refresh. Boards sync across devices
along with the rest of your data, and the checkbox mutes one without deleting it.

What you can paste:

| You paste | What happens |
| --- | --- |
| `https://github.com/owner/repo` | Tries `.github/scripts/listings.json` and `listings.json` on `dev`/`main`/`master`, then falls back to the repo's `README.md` |
| A raw `listings.json` URL | Parsed as a SimplifyJobs-style listing array |
| A raw `README.md` URL | Parsed as a markdown job table |
| Any other URL | Fetched directly — but most non-GitHub sites block browser requests (CORS), and you'll get a clear error saying so |

Markdown tables are matched by their **header names**, so a repo needs a header
row with a recognizable company/role column — `Company`, `Role`/`Position`,
`Location`, `Link`/`Application`/`Posting`, `Date`/`Posted`/`Age`, `Salary`.
Rows marked 🔒 are skipped, and `↳` continuation rows inherit the company above
them. A board whose shape isn't recognized returns nothing and says so rather
than importing garbage. Parsing lives in `src/feed-sources.js`.

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
- **Built-in feed sources** live in `BUILTIN_FEED_URLS` near the top of the
  fetch machinery in `cmu-cs-opportunity-hub.jsx`. URLs are tried in order and
  the first that responds wins, so add the new season's SimplifyJobs
  `listings.json` URL at the top each recruiting cycle (a URL that 404s is
  skipped harmlessly). For anything else, just add it in the app — no code edit
  needed.
- **Estimated deadlines**: job boards publish a *post date*, not a deadline, so
  those listings would all read "Rolling" and sort last. When a listing has a
  real post date, the app shows an estimated deadline two weeks later, always
  marked with a `~` and a tooltip saying it's a guess. It only ever applies
  where a post date exists, only while the estimate is still in the future (an
  old posting stays "Rolling" rather than gaining an invented "passed" date),
  and never over a listing you edited yourself. Estimates deliberately stay out
  of the red "due in the next 3 days" banner, and they're flagged in the CSV
  export. Toggle the whole thing off under **⚙ settings**; genuinely rolling
  programs (lab positions, RISS, SURF) are unaffected either way.
- **Browsing**: in an opportunity's detail modal, `‹` / `›` — or the ← / →
  arrow keys — step through whatever list you opened it from: the current
  filtered Browse results, a calendar day, a tracker column, a dashboard list.
- **Persistence** goes through `src/storage-shim.js`, which emulates the
  artifact runtime's `window.storage` API on top of localStorage and adds the
  optional GitHub Gist sync described above. Saves, notes, tracker state, and
  the opportunity cache all survive reloads (and follow you across devices
  once sync is connected).
- **Seed data** lives in `SEED_OPPORTUNITIES` at the top of
  `cmu-cs-opportunity-hub.jsx` — edit freely.
