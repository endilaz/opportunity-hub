/*
 * Job-board feed sources.
 *
 * Takes a URL a user pasted — a GitHub repo, a raw listings.json, or a raw
 * README.md — and turns it into raw opportunity records for sanitizeItem().
 *
 *   feedCandidateUrls(input)  — the fetchable URLs to try, in order
 *   parseFeedText(text, url)  — records parsed out of whatever came back
 *
 * Two payload shapes are understood:
 *   1. JSON — a SimplifyJobs-style listings.json, or an array already shaped
 *      like our own opportunity records.
 *   2. Markdown — the "| Company | Role | Location | Link | Date |" tables
 *      that most of the community internship repos publish in their README.
 *
 * This is best-effort parsing of other people's data: when a shape isn't
 * recognized we return nothing rather than guessing, so the caller can tell the
 * user the board didn't work instead of importing garbage.
 */
import { slugify } from "./opportunity-utils.js";

export const MAX_FEED_ITEMS = 30; // newest listings kept per board per refresh

const DAY_MS = 24 * 3600 * 1000;
const GITHUB_BRANCHES = ["dev", "main", "master"];
const GITHUB_PATHS = [".github/scripts/listings.json", "listings.json", "README.md"];

/* --------------------------------- URLs ---------------------------------- */

function rawUrl(owner, repo, branch, path) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

// A github.com page URL can't be fetched from the browser (no CORS, and it's
// HTML anyway), so repo/blob links are rewritten to raw.githubusercontent.com.
export function feedCandidateUrls(input) {
  const url = String(input || "").trim();
  if (!url) return [];

  const gh = url.match(
    /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:\/(tree|blob)\/([^/\s]+)((?:\/[^\s#?]*)?))?\/?(?:[#?].*)?$/i
  );
  if (!gh) return [url];

  const [, owner, repo, kind, branch, path] = gh;
  const filePath = path ? path.replace(/^\//, "") : "";
  if (kind === "blob" && filePath) return [rawUrl(owner, repo, branch, filePath)];

  const branches = branch ? [branch, ...GITHUB_BRANCHES.filter((b) => b !== branch)] : GITHUB_BRANCHES;
  const out = [];
  const seen = new Set();
  for (const p of GITHUB_PATHS) {
    for (const b of branches) {
      const candidate = rawUrl(owner, repo, b, p);
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      out.push(candidate);
    }
  }
  return out;
}

// Short human label for the settings list ("SimplifyJobs/Summer2027-Internships").
export function feedLabel(input) {
  const url = String(input || "").trim();
  const gh = url.match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[/#?].*)?$/i);
  if (gh) return `${gh[1]}/${gh[2]}`;
  const raw = url.match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\//i);
  if (raw) return `${raw[1]}/${raw[2]}`;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return url.slice(0, 40); }
}

/* -------------------------------- parsing -------------------------------- */

export function parseFeedText(text, sourceUrl) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return limitNewest(parseJsonListings(trimmed));
  return limitNewest(parseMarkdownListings(trimmed, sourceUrl));
}

function limitNewest(items) {
  return items
    .slice()
    .sort((a, b) => (b.updatedAt || b.postedAt || 0) - (a.updatedAt || a.postedAt || 0))
    .slice(0, MAX_FEED_ITEMS);
}

function parseJsonListings(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return []; }
  const arr = Array.isArray(data)
    ? data
    : [data && data.listings, data && data.data, data && data.jobs].find(Array.isArray) || [];
  return arr.map(mapJsonListing).filter(Boolean);
}

function mapJsonListing(l) {
  if (!l || typeof l !== "object") return null;

  // SimplifyJobs-style listing.
  if (l.company_name && l.title) {
    if (l.active === false || l.is_visible === false) return null;
    const locations = Array.isArray(l.locations) ? l.locations : [];
    const terms = Array.isArray(l.terms) ? l.terms : [];
    const postedAt = typeof l.date_posted === "number" ? l.date_posted * 1000 : null; // unix seconds
    const bits = [`${l.title} at ${l.company_name}.`];
    if (terms.length) bits.push(`Terms: ${terms.join(", ")}.`);
    if (postedAt) bits.push(`Posted ${new Date(postedAt).toLocaleDateString()} on the job board feed.`);
    if (l.sponsorship && !/other/i.test(l.sponsorship)) bits.push(`Sponsorship: ${l.sponsorship}.`);
    return {
      id: "simplify-" + (l.id || slugify(l.title + "-" + l.company_name)),
      title: l.title,
      organization: l.company_name,
      type: "Internship",
      location: locations.join(" · "),
      remote: locations.some((x) => /remote/i.test(x)),
      description: bits.join(" "),
      deadline: "Rolling",
      compensation: "See listing",
      eligibility: "Undergraduates",
      tags: ["internship", ...terms],
      applyUrl: l.url,
      postedAt,
      updatedAt: typeof l.date_updated === "number" ? l.date_updated * 1000 : postedAt,
    };
  }

  // Already shaped like one of our records.
  if (l.title && l.organization) {
    return { ...l, postedAt: typeof l.postedAt === "number" ? l.postedAt : null };
  }
  return null;
}

/* --------------------------- markdown table rows -------------------------- */

const HEADER_PATTERNS = [
  ["company", /^(company|organization|employer|org)$/],
  ["role", /^(role|position|title|job|job title)$/],
  ["location", /^(location|locations|city)$/],
  ["link", /^(link|links|application|application\/link|apply|apply link|posting|posting link)$/],
  ["date", /^(date|date posted|posted|age|posted on)$/],
  ["pay", /^(salary|compensation|pay|rate)$/],
];

function headerIndex(cells) {
  const idx = {};
  cells.forEach((cell, i) => {
    const name = cellText(cell).toLowerCase().replace(/\s+/g, " ").trim();
    for (const [key, re] of HEADER_PATTERNS) {
      if (idx[key] === undefined && re.test(name)) idx[key] = i;
    }
  });
  return idx.company !== undefined || idx.role !== undefined ? idx : null;
}

const PIPE_PLACEHOLDER = "@@ESCAPED_PIPE@@";

function splitRow(line) {
  const guarded = line.replace(/\\\|/g, PIPE_PLACEHOLDER);
  const inner = guarded.replace(/^\s*\|/, "").replace(/\|\s*$/, "");
  return inner.split("|").map((c) => c.split(PIPE_PLACEHOLDER).join("|"));
}

function cellText(md) {
  return String(md || "")
    .replace(/<[^>]*>/g, " ")                  // apply buttons are <a><img/></a>
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")     // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")   // links -> their text
    .replace(/&nbsp;/g, " ")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cellUrl(md) {
  const s = String(md || "");
  const html = s.match(/<a[^>]+href=["']([^"']+)["']/i);
  if (html) return html[1];
  const link = s.match(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
  if (link) return link[1];
  const bare = s.match(/https?:\/\/[^\s)|"'<>]+/);
  return bare ? bare[0] : "";
}

const AGE_UNITS = { h: 3600e3, d: DAY_MS, w: 7 * DAY_MS, mo: 30 * DAY_MS, y: 365 * DAY_MS };

// "2026-08-14", "Aug 14", "Aug 14, 2026", or a relative age like "3d" / "2mo"
// (what the speedyapply-style boards print) -> epoch ms. Bare month/day rows
// carry no year, so pick the most recent occurrence that isn't far ahead.
function parseLooseDate(s) {
  const t = String(s || "").trim();
  if (!t) return null;

  const age = t.match(/^(\d+)\s*(mo|h|hr|hrs|hour|hours|d|day|days|w|wk|weeks?|y|yr|years?|months?)\b/i);
  if (age) {
    const unit = age[2].toLowerCase();
    const key = /^mo|^month/.test(unit) ? "mo" : /^h/.test(unit) ? "h" : /^w/.test(unit) ? "w" : /^y/.test(unit) ? "y" : "d";
    return Date.now() - Number(age[1]) * AGE_UNITS[key];
  }

  const iso = t.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) {
    const ms = Date.parse(`${iso[0]}T00:00:00`);
    return isNaN(ms) ? null : ms;
  }
  const monthDay = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})$/);
  if (monthDay) {
    const now = Date.now();
    const thisYear = new Date().getFullYear();
    let ms = Date.parse(`${monthDay[1]} ${monthDay[2]}, ${thisYear}`);
    if (isNaN(ms)) return null;
    if (ms - now > 45 * DAY_MS) ms = Date.parse(`${monthDay[1]} ${monthDay[2]}, ${thisYear - 1}`);
    return isNaN(ms) ? null : ms;
  }
  const generic = Date.parse(t);
  return isNaN(generic) ? null : generic;
}

function guessType(role, extra) {
  const s = (String(role || "") + " " + String(extra || "")).toLowerCase();
  if (/hackathon/.test(s)) return "Hackathon";
  if (/\breu\b/.test(s)) return "REU";
  if (/research assistant|lab position|\bra position\b/.test(s)) return "Lab Position";
  if (/undergraduate research|summer research (program|fellow)/.test(s)) return "Research";
  return "Internship";
}

function hashCode(s) {
  let h = 5381;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function parseMarkdownListings(text, sourceUrl) {
  const source = feedLabel(sourceUrl || "");
  const items = [];
  let header = null;
  let lastCompany = "";

  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) { header = null; lastCompany = ""; continue; }

    const cells = splitRow(t);
    if (cells.length < 2) continue;
    if (cells.every((c) => /^\s*:?-{2,}:?\s*$/.test(c))) continue; // header separator

    if (!header) { header = headerIndex(cells); lastCompany = ""; continue; }

    const at = (key) => (header[key] === undefined ? "" : cells[header[key]] || "");
    if (/\u{1F512}|no longer accepting/iu.test(cells.join(" "))) continue; // closed row

    let company = cellText(at("company"));
    if (!company || /^[↳→➜\-–—]+$/.test(company)) company = lastCompany;
    else lastCompany = company;

    const role = cellText(at("role"));
    if (!role && !company) continue;
    if (/^(company|role|position)$/i.test(role)) continue;

    const location = cellText(at("location"));
    const applyUrl = cellUrl(at("link")) || cellUrl(at("role")) || cellUrl(at("company"));
    const postedAt = parseLooseDate(cellText(at("date")));
    const compensation = cellText(at("pay"));

    const bits = [`${role || "Open role"} at ${company || source}.`];
    if (postedAt) bits.push(`Posted ${new Date(postedAt).toLocaleDateString()}.`);
    bits.push(`Listed on ${source}.`);

    items.push({
      id: "board-" + hashCode(source + "|" + company + "|" + role + "|" + location + "|" + applyUrl),
      title: role || company,
      organization: company || source,
      type: guessType(role, sourceUrl),
      location: location || "See listing",
      remote: /remote/i.test(location),
      description: bits.join(" "),
      deadline: "Rolling",
      compensation: compensation || "See listing",
      eligibility: "Undergraduates",
      tags: ["internship", slugify(source)].filter(Boolean),
      applyUrl,
      postedAt,
      updatedAt: postedAt,
    });
  }

  return items;
}
