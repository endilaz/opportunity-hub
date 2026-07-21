import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { dedupeOpportunityList, mergeUniqueOpportunities } from "./src/opportunity-utils.js";

/* ============================================================================
   CMU CS OPPORTUNITY HUB
   A self-updating research, internship & hackathon hub for CMU CS undergrads.
   - Live data: free SimplifyJobs internship feed (no key) + Gemini free tier
     with Google Search grounding (Anthropic as optional paid fallback)
   - Persistent storage via window.storage (never localStorage directly);
     optional cross-device sync to a private GitHub Gist — see src/storage-shim.js
   - Views: Browse / Calendar / Tracker / Dashboard
   ========================================================================== */

/* ----------------------------- Design tokens ----------------------------- */
const C = {
  red: "#C41230",        // Carnegie red
  redDark: "#8E0D23",
  ink: "#1E1D1B",        // near-black iron
  iron: "#55524D",       // iron gray
  faint: "#8B8781",
  paper: "#F7F6F2",      // warm paper background
  card: "#FFFFFF",
  line: "#E6E2DA",
  mist: "#EFEDE7",
  rolling: "#4E6E8E",    // steel blue for rolling deadlines
  ok: "#2E7D4F",
  warn: "#B7791F",
};
const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/* ============================================================================
   SEED OPPORTUNITIES  — edit freely. Used when the cache is empty and every
   live fetch fails, so the app is never blank.
   ========================================================================== */
const SEED_OPPORTUNITIES = [
  {
    id: "riss-cmu", title: "Robotics Institute Summer Scholars (RISS)", organization: "CMU Robotics Institute",
    type: "REU", location: "Pittsburgh, PA", remote: false,
    description: "An 11-week summer research program in robotics for undergraduates. Scholars work in RI labs on perception, manipulation, field robotics, and human-robot interaction, and present at a final symposium.",
    deadline: "2027-01-15", compensation: "$6,000 stipend + housing support", eligibility: "Undergraduates (all years); international students welcome",
    tags: ["robotics", "research", "summer"], applyUrl: "https://riss.ri.cmu.edu/",
  },
  {
    id: "hcii-ura", title: "HCII Undergraduate Research Assistant", organization: "CMU Human-Computer Interaction Institute",
    type: "Lab Position", location: "Pittsburgh, PA", remote: false,
    description: "Ongoing RA openings across HCII labs in accessibility, learning science, AR/VR, and social computing. Students join a lab during the semester for credit or pay depending on the project.",
    deadline: "Rolling", compensation: "Hourly pay or course credit", eligibility: "CMU undergraduates, all years",
    tags: ["HCI", "research", "semester"], applyUrl: "https://www.hcii.cmu.edu/",
  },
  {
    id: "lti-ra", title: "LTI NLP Lab Research Assistant", organization: "CMU Language Technologies Institute",
    type: "Lab Position", location: "Pittsburgh, PA", remote: false,
    description: "LTI faculty regularly take undergrad RAs for projects in large language models, speech, machine translation, and information retrieval. Strong Python skills and one ML course are typically expected.",
    deadline: "Rolling", compensation: "Hourly pay or course credit", eligibility: "CMU undergraduates; ML coursework preferred",
    tags: ["NLP", "machine learning", "research"], applyUrl: "https://www.lti.cs.cmu.edu/",
  },
  {
    id: "mld-ugrad", title: "Machine Learning Dept. Undergraduate Research", organization: "CMU Machine Learning Department",
    type: "Research", location: "Pittsburgh, PA", remote: false,
    description: "Semester and summer research with MLD faculty on core ML theory, optimization, and applications. Many projects can lead to publications and senior thesis work.",
    deadline: "Rolling", compensation: "Varies by project (credit, stipend, or hourly)", eligibility: "CMU undergraduates; strong math background helpful",
    tags: ["machine learning", "theory", "research"], applyUrl: "https://www.ml.cmu.edu/",
  },
  {
    id: "cylab-ura", title: "CyLab Security & Privacy Undergraduate Researcher", organization: "CMU CyLab",
    type: "Lab Position", location: "Pittsburgh, PA", remote: false,
    description: "Research assistant roles across CyLab groups working on systems security, usable privacy, cryptography, and IoT security. Summer positions are announced each spring.",
    deadline: "Rolling", compensation: "Hourly pay; summer stipends available", eligibility: "Undergraduates with systems or security interest",
    tags: ["security", "systems", "research"], applyUrl: "https://www.cylab.cmu.edu/",
  },
  {
    id: "reuse-cmu", title: "REUSE: NSF REU in Software Engineering", organization: "CMU Institute for Software Research",
    type: "REU", location: "Pittsburgh, PA", remote: false,
    description: "A 10-week NSF-funded summer program pairing undergrads with SCS mentors on software engineering, programming languages, and AI-for-code research.",
    deadline: "2027-01-31", compensation: "NSF stipend (~$7,000) + housing + travel", eligibility: "US citizens/permanent residents preferred (NSF rules)",
    tags: ["software engineering", "REU", "summer"], applyUrl: "https://www.cmu.edu/scs/s3d/reuse/",
  },
  {
    id: "surf-cmu", title: "Summer Undergraduate Research Fellowship (SURF)", organization: "CMU Undergraduate Research Office",
    type: "Research", location: "Pittsburgh, PA", remote: false,
    description: "CMU's flagship summer fellowship funding 8-10 weeks of full-time student-designed research with a faculty advisor. Open to any field including CS.",
    deadline: "2027-02-01", compensation: "$4,000 fellowship", eligibility: "CMU undergraduates in good standing",
    tags: ["research", "fellowship", "summer"], applyUrl: "https://www.cmu.edu/uro/",
  },
  {
    id: "dreu", title: "CRA DREU: Distributed REU", organization: "Computing Research Association",
    type: "REU", location: "Various host universities", remote: false,
    description: "Matches undergrads from groups underrepresented in computing with faculty mentors at research universities nationwide for a paid summer of research.",
    deadline: "2027-02-15", compensation: "$700/week for 10 weeks + relocation", eligibility: "Undergraduates at US institutions",
    tags: ["research", "REU", "summer"], applyUrl: "https://cra.org/cra-wp/dreu/",
  },
  {
    id: "mit-sgi", title: "MIT Summer Geometry Initiative", organization: "MIT CSAIL",
    type: "REU", location: "Cambridge, MA / Remote", remote: true,
    description: "A 6-week paid summer program introducing undergrads to geometry processing research through a tutorial week followed by mentored research projects.",
    deadline: "2027-02-15", compensation: "Paid fellowship", eligibility: "Undergrads and early master's students worldwide",
    tags: ["graphics", "geometry", "research"], applyUrl: "https://sgi.mit.edu/",
  },
  {
    id: "umd-reu-ml", title: "NSF REU in Machine Learning", organization: "University of Maryland",
    type: "REU", location: "College Park, MD", remote: false,
    description: "A 10-week summer program on machine learning, computer vision, and NLP research with UMD faculty, including grad-school prep workshops.",
    deadline: "2027-02-01", compensation: "NSF stipend + housing", eligibility: "US citizens/permanent residents (NSF rules)",
    tags: ["machine learning", "vision", "REU"], applyUrl: "https://www.cs.umd.edu/",
  },
  {
    id: "google-step", title: "Google STEP Internship", organization: "Google",
    type: "Internship", location: "Multiple US offices", remote: false,
    description: "A 12-week development internship designed for first- and second-year undergrads, with strong mentorship and a collaborative starter project.",
    deadline: "2026-11-01", compensation: "Competitive paid internship (~$9k/month prorated)", eligibility: "First-year and second-year undergraduates",
    tags: ["SWE", "internship", "early career"], applyUrl: "https://buildyourfuture.withgoogle.com/programs/step",
  },
  {
    id: "ms-explore", title: "Microsoft Explore Internship", organization: "Microsoft",
    type: "Internship", location: "Redmond, WA", remote: false,
    description: "A 12-week rotational internship for first- and second-year students that spans PM, design, and engineering so you can explore different roles.",
    deadline: "2026-10-15", compensation: "Paid internship + relocation + housing stipend", eligibility: "Freshmen and sophomores",
    tags: ["SWE", "internship", "early career"], applyUrl: "https://careers.microsoft.com/students",
  },
  {
    id: "janestreet-swe", title: "Software Engineering Internship", organization: "Jane Street",
    type: "Internship", location: "New York, NY", remote: false,
    description: "Summer SWE internship working on real trading-systems projects in OCaml with heavy mentorship. Sophomore-focused programs and fellowships also run alongside.",
    deadline: "2026-10-31", compensation: "Highly competitive salary + housing", eligibility: "Undergraduates (strong programming background)",
    tags: ["SWE", "systems", "internship"], applyUrl: "https://www.janestreet.com/join-jane-street/",
  },
  {
    id: "nvidia-ml", title: "Machine Learning Research Intern", organization: "NVIDIA",
    type: "Internship", location: "Santa Clara, CA / Remote", remote: true,
    description: "Research engineering internships across deep learning, graphics, and autonomous systems teams. Rolling applications throughout the year.",
    deadline: "Rolling", compensation: "Competitive paid internship", eligibility: "Undergrad and grad students; ML experience expected",
    tags: ["machine learning", "research engineering", "internship"], applyUrl: "https://www.nvidia.com/en-us/about-nvidia/careers/",
  },
  {
    id: "psc-intern", title: "Student Intern, Pittsburgh Supercomputing Center", organization: "Pittsburgh Supercomputing Center",
    type: "Internship", location: "Pittsburgh, PA", remote: false,
    description: "Part-time and summer internships supporting HPC systems, scientific computing, and AI infrastructure at PSC, a joint CMU/Pitt center.",
    deadline: "Rolling", compensation: "Hourly pay", eligibility: "Local undergraduates; systems interest a plus",
    tags: ["systems", "HPC", "internship"], applyUrl: "https://www.psc.edu/careers/",
  },
  {
    id: "tartanhacks", title: "TartanHacks", organization: "CMU ScottyLabs",
    type: "Hackathon", location: "Pittsburgh, PA", remote: false,
    description: "CMU's largest hackathon, run by ScottyLabs each spring. A weekend of building with workshops, mentorship, and sponsor prizes — beginner-friendly and on your doorstep. Applications typically open in the winter.",
    deadline: "2027-01-15", compensation: "Free to attend + prizes", eligibility: "All students; CMU-hosted",
    tags: ["hackathon", "cmu", "beginner friendly"], applyUrl: "https://tartanhacks.com/",
  },
  {
    id: "hackmit", title: "HackMIT", organization: "MIT",
    type: "Hackathon", location: "Cambridge, MA", remote: false,
    description: "One of the largest and most reputable collegiate hackathons, held each fall at MIT. Admissions-based with travel reimbursement for many admitted hackers. Applications typically run in late summer.",
    deadline: "2026-08-15", compensation: "Free to attend + travel reimbursement + prizes", eligibility: "Undergraduates worldwide",
    tags: ["hackathon", "flagship"], applyUrl: "https://hackmit.org/",
  },
  {
    id: "pennapps", title: "PennApps", organization: "University of Pennsylvania",
    type: "Hackathon", location: "Philadelphia, PA", remote: false,
    description: "The original college hackathon, hosted at Penn every fall. Large sponsor presence, strong recruiting pipeline, and routes for first-time hackers. Applications typically open mid-summer.",
    deadline: "2026-08-20", compensation: "Free to attend + prizes", eligibility: "All students",
    tags: ["hackathon", "flagship"], applyUrl: "https://pennapps.com/",
  },
  {
    id: "calhacks", title: "Cal Hacks", organization: "UC Berkeley",
    type: "Hackathon", location: "Berkeley, CA", remote: false,
    description: "UC Berkeley's flagship hackathon and one of the largest in the world, held each fall with major sponsor prizes and strong AI/startup energy.",
    deadline: "2026-10-01", compensation: "Free to attend + prizes", eligibility: "All students",
    tags: ["hackathon", "flagship"], applyUrl: "https://calhacks.io/",
  },
  {
    id: "treehacks", title: "TreeHacks", organization: "Stanford University",
    type: "Hackathon", location: "Stanford, CA", remote: false,
    description: "Stanford's premier hackathon, held each February with tracks in health, sustainability, and AI. Admissions-based with travel grants; applications typically close in late fall.",
    deadline: "2026-11-30", compensation: "Free to attend + travel grants + prizes", eligibility: "Undergraduates worldwide",
    tags: ["hackathon", "flagship"], applyUrl: "https://www.treehacks.com/",
  },
];

/* ------------------------------ Small helpers ---------------------------- */
const DAY = 24 * 3600 * 1000;
const TYPES = ["Research", "Internship", "REU", "Lab Position", "Hackathon"];
const STAGES = ["Interested", "Applied", "Interviewing", "Offer", "Rejected"];

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}
function normKey(o) {
  return (String(o.title || "").toLowerCase().trim() + "::" + String(o.organization || "").toLowerCase().trim());
}
function normalizeDeadline(d) {
  if (d == null) return "Rolling";
  const s = String(d).trim();
  if (/rolling|ongoing|open/i.test(s)) return "Rolling";
  const t = Date.parse(s);
  if (isNaN(t)) return "Rolling";
  return new Date(t).toISOString().slice(0, 10);
}
function sanitizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!raw.title || !raw.organization) return null;
  let tags = raw.tags;
  if (typeof tags === "string") tags = tags.split(",").map((t) => t.trim());
  if (!Array.isArray(tags)) tags = [];
  tags = tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim().toLowerCase());
  const type = TYPES.includes(raw.type) ? raw.type : "Research";
  return {
    id: raw.id && typeof raw.id === "string" ? raw.id : slugify(raw.title + "-" + raw.organization),
    title: String(raw.title).trim(),
    organization: String(raw.organization).trim(),
    type,
    location: raw.location ? String(raw.location) : "See listing",
    remote: Boolean(raw.remote),
    description: raw.description ? String(raw.description) : "",
    deadline: normalizeDeadline(raw.deadline),
    compensation: raw.compensation ? String(raw.compensation) : "See listing",
    eligibility: raw.eligibility ? String(raw.eligibility) : "Undergraduates",
    tags,
    applyUrl: raw.applyUrl && typeof raw.applyUrl === "string" ? raw.applyUrl : "",
  };
}
function daysUntil(iso) {
  if (iso === "Rolling") return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(iso + "T00:00:00");
  return Math.round((d - today) / DAY);
}
function fmtDeadline(iso) {
  if (iso === "Rolling") return "Rolling";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function timeAgo(ts) {
  if (!ts) return "never";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + (m === 1 ? " minute ago" : " minutes ago");
  const h = Math.floor(m / 60);
  if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
  const d = Math.floor(h / 24);
  return d + (d === 1 ? " day ago" : " days ago");
}
function compValue(comp) {
  const m = String(comp || "").replace(/,/g, "").match(/\$\s?(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}
function isPaid(comp) {
  const s = String(comp || "").toLowerCase();
  if (s.includes("unpaid")) return false;
  return /\$|paid|stipend|salary|hourly|competitive|fellowship/.test(s);
}
function locCategory(o) {
  if (o.remote) return "remote";
  if (/pittsburgh/i.test(o.location || "")) return "oncampus";
  return "other";
}
function matchesYear(o, year) {
  const e = String(o.eligibility || "").toLowerCase();
  if (year === "all") return true;
  const broad = /all years|any year|undergrad|students/i.test(e);
  if (year === "freshman") return broad || /fresh|first-year|first year/.test(e);
  if (year === "sophomore") return broad || /sophomore|second-year|second year/.test(e);
  if (year === "junior") return broad || /junior|third-year/.test(e);
  if (year === "senior") return broad || /senior|fourth-year/.test(e);
  return true;
}
function downloadFile(name, content, mime) {
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) { console.error("Download failed", e); }
}
function csvEscape(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* --------------------------- Live fetch machinery ------------------------ */

// Direct JSON feeds — no AI key needed. Add or swap URLs here; each must point
// to a SimplifyJobs-style listings.json. Tried in order, first success wins,
// so put the newest season first (a URL that 404s is skipped harmlessly).
const INTERNSHIP_FEED_URLS = [
  "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
  "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json",
];
const MAX_FEED_ITEMS = 30; // newest feed listings merged per refresh

const GEMINI_MODEL = "gemini-2.5-flash";

// Key precedence: free Gemini key first, Anthropic as optional paid fallback,
// no key at all = feed-only refresh. Vite bakes env vars in at build time, so
// a module-level const is safe.
const LLM_PROVIDER = import.meta.env.VITE_GEMINI_API_KEY
  ? { name: "gemini", key: import.meta.env.VITE_GEMINI_API_KEY }
  : import.meta.env.VITE_ANTHROPIC_API_KEY
    ? { name: "anthropic", key: import.meta.env.VITE_ANTHROPIC_API_KEY }
    : null;

const JSON_SYSTEM =
  'You are a data API for a student opportunity tracker. Respond with ONLY a valid JSON array. No markdown, no code fences, no preamble, no commentary — the first character of your reply must be "[" and the last must be "]". Each object must have exactly these keys: "id" (short slug string), "title", "organization", "type" (one of "Research", "Internship", "REU", "Lab Position", "Hackathon"), "location", "remote" (boolean), "description" (2-3 sentences), "deadline" (ISO date string like "2026-10-15", or the exact string "Rolling"), "compensation", "eligibility", "tags" (array of lowercase strings), "applyUrl" (a real URL). Use web search to find real, currently open opportunities and their actual deadlines. If a deadline is unknown, use "Rolling". Keep descriptions concise so the full array fits in your reply.';

const FETCH_CATEGORIES = [
  {
    name: "CMU research",
    kind: "llm",
    fetcher: () =>
      fetchCategoryLLM(
        `Today is ${new Date().toDateString()}. Find 5-6 currently available Carnegie Mellon University undergraduate research openings and programs: SCS labs recruiting undergrad RAs, SURF, RISS, REUSE, and openings in the ML Department, Robotics Institute, HCII, LTI, or CyLab. Bias toward roles open to first- and second-year students. Return the JSON array only.`
      ),
  },
  {
    name: "external REUs",
    kind: "llm",
    fetcher: () =>
      fetchCategoryLLM(
        `Today is ${new Date().toDateString()}. Find 5-6 external (non-CMU) undergraduate summer research programs and NSF REUs in computer science, machine learning, robotics, HCI, systems, or security that are currently accepting or will soon accept applications for the upcoming summer. Return the JSON array only.`
      ),
  },
  {
    name: "internships",
    kind: "llm",
    fetcher: () =>
      fetchCategoryLLM(
        `Today is ${new Date().toDateString()}. Find 5-6 software engineering, machine learning, data science, or research engineering internships currently open (or opening soon) to undergraduates — a mix of structured early-career programs (e.g., Google STEP, Microsoft Explore) and general internships at tech companies, research labs, and startups. Return the JSON array only.`
      ),
  },
  {
    name: "hackathons",
    kind: "llm",
    fetcher: () =>
      fetchCategoryLLM(
        `Today is ${new Date().toDateString()}. Find 5-6 reputable collegiate hackathons open to undergraduates that are currently accepting registrations or have announced dates for the coming months — e.g., MLH member events and flagship hackathons like HackMIT, PennApps, Cal Hacks, TreeHacks, and TartanHacks (in-person or online). Set "type" to "Hackathon" and use the registration/application deadline as "deadline" (or "Rolling" if registration is open-ended). Return the JSON array only.`
      ),
  },
  { name: "internship feed", kind: "feed", fetcher: () => fetchInternshipsFeed() },
];

function parseJsonArrayResponse(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) throw new Error("No JSON array in response");
  const arr = JSON.parse(clean.slice(start, end + 1));
  if (!Array.isArray(arr)) throw new Error("Response was not an array");
  return arr.map(sanitizeItem).filter(Boolean);
}

// Map a SimplifyJobs listing to the raw shape sanitizeItem expects.
function mapSimplifyListing(l) {
  const locations = Array.isArray(l.locations) ? l.locations : [];
  const terms = Array.isArray(l.terms) ? l.terms : [];
  const posted = l.date_posted ? new Date(l.date_posted * 1000).toLocaleDateString() : null; // unix seconds
  const bits = [`${l.title} at ${l.company_name}.`];
  if (terms.length) bits.push(`Terms: ${terms.join(", ")}.`);
  if (posted) bits.push(`Posted ${posted} on the SimplifyJobs internship list.`);
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
  };
}

async function fetchInternshipsFeed() {
  let lastErr = null;
  for (const url of INTERNSHIP_FEED_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) { lastErr = new Error("Internship feed HTTP " + res.status); continue; }
      const listings = await res.json();
      if (!Array.isArray(listings)) { lastErr = new Error("Internship feed was not an array"); continue; }
      return listings
        .filter((l) => l && l.active && l.is_visible)
        .sort((a, b) => (b.date_updated || b.date_posted || 0) - (a.date_updated || a.date_posted || 0))
        .slice(0, MAX_FEED_ITEMS)
        .map(mapSimplifyListing)
        .map(sanitizeItem)
        .filter(Boolean);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Internship feed unavailable");
}

async function fetchCategoryLLM(prompt) {
  if (!LLM_PROVIDER) {
    throw new Error(
      "No AI key configured. Add a free VITE_GEMINI_API_KEY (aistudio.google.com/apikey) to .env.local and restart the dev server to enable live research/REU/internship discovery."
    );
  }
  return LLM_PROVIDER.name === "gemini"
    ? fetchCategoryGemini(prompt, LLM_PROVIDER.key)
    : fetchCategoryAnthropic(prompt, LLM_PROVIDER.key);
}

async function fetchCategoryGemini(prompt, apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: JSON_SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        // No responseMimeType: "application/json" — it's unreliable combined
        // with the google_search tool, so JSON_SYSTEM + slice-parse enforce
        // the format instead. Thinking tokens count toward the cap on 2.5
        // models, hence the headroom.
        generationConfig: { maxOutputTokens: 8192 },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(
      res.status === 429
        ? "Gemini rate limit hit — wait a minute and retry."
        : "Gemini API error " + res.status
    );
  }
  const data = await res.json();
  const cand = data.candidates && data.candidates[0];
  const parts = (cand && cand.content && cand.content.parts) || [];
  const text = parts.map((p) => p.text || "").join("\n");
  if (!text.trim()) throw new Error("Empty Gemini response");
  return parseJsonArrayResponse(text);
}

async function fetchCategoryAnthropic(prompt, apiKey) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },

    body: JSON.stringify({
      model: "claude-haiku-4-5",
      // 1000 tokens (the artifact-runtime cap) truncates a 5-6 item JSON array;
      // running locally with a real key we can give the response room to finish.
      max_tokens: 4000,
      system: JSON_SYSTEM,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });
  if (!res.ok) throw new Error("API error " + res.status);
  const data = await res.json();
  // Collect ALL text blocks — never assume content[0] is the answer.
  const text = (Array.isArray(data.content) ? data.content : [])
    .filter((b) => b && b.type === "text")
    .map((b) => b.text || "")
    .join("\n");
  return parseJsonArrayResponse(text);
}

/* ------------------------------ Storage keys ----------------------------- */
const KEY_CACHE = "cmu-opps-cache";      // { list, lastUpdated }
const KEY_USER = "cmu-opps-user-data";   // { saved, notes, tracker, hidden, overrides }
const KEY_SETTINGS = "cmu-opps-settings";// { autoRefresh, introDismissed }

async function storageLoad(key) {
  try {
    const r = await window.storage.get(key);
    if (r && r.value) return JSON.parse(r.value);
  } catch (e) { /* key missing or parse error — fall through */ }
  return null;
}

function normalizeUserRecord(user) {
  return {
    saved: user.saved || [], notes: user.notes || {}, tracker: user.tracker || {},
    hidden: user.hidden || [], overrides: user.overrides || {},
  };
}
function parseCacheRecord(cache) {
  let list = SEED_OPPORTUNITIES;
  let updated = null;
  if (cache && Array.isArray(cache.list) && cache.list.length > 0) {
    const cleaned = dedupeOpportunityList(
      cache.list
        .map((raw) => {
          const clean = sanitizeItem(raw);
          return clean ? { ...clean, fetchedAt: raw && raw.fetchedAt } : null;
        })
        .filter(Boolean)
    );
    if (cleaned.length > 0) {
      list = cleaned;
      updated = cache.lastUpdated || null;
    }
  }
  return { list, updated };
}

/* ============================== UI primitives ============================= */
function TypeBadge({ type }) {
  const colors = {
    Research: { bg: "#EEF3EE", fg: "#2E6B45" },
    Internship: { bg: "#EEF1F7", fg: "#3A5A8C" },
    REU: { bg: "#F6EFE6", fg: "#8A5A17" },
    "Lab Position": { bg: "#F2EEF6", fg: "#6B4A8E" },
    Hackathon: { bg: "#F9ECF1", fg: "#8E3A5F" },
  }[type] || { bg: C.mist, fg: C.iron };
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: colors.bg, color: colors.fg, fontFamily: SANS }}>
      {type}
    </span>
  );
}

function DeadlinePill({ deadline }) {
  const d = daysUntil(deadline);
  let bg = C.mist, fg = C.iron, label = fmtDeadline(deadline);
  if (deadline === "Rolling") { bg = "#E9EFF5"; fg = C.rolling; label = "Rolling"; }
  else if (d != null && d < 0) { bg = "#F0EEEA"; fg = C.faint; label = "Passed · " + fmtDeadline(deadline); }
  else if (d != null && d <= 14) { bg = "#FBE9EC"; fg = C.red; label = (d === 0 ? "Due today" : "Due in " + d + "d") + " · " + fmtDeadline(deadline); }
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: bg, color: fg }}>
      {label}
    </span>
  );
}

function Star({ on, onClick }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={on ? "Unsave" : "Save"}
      className="text-lg leading-none px-1 rounded hover:scale-110 transition-transform"
      style={{ color: on ? "#D9A400" : "#C9C4BB" }}>
      {on ? "★" : "☆"}
    </button>
  );
}

function HideButton({ hidden, onClick }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={hidden ? "Unhide" : "Hide"} title={hidden ? "Show this again" : "Hide — not interested"}
      className="text-sm leading-none px-1 rounded hover:scale-110 transition-transform"
      style={{ color: hidden ? C.red : "#C9C4BB" }}>
      {hidden ? "↺" : "✕"}
    </button>
  );
}

function NewBadge() {
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
      style={{ background: C.red, color: "#fff" }}>New</span>
  );
}

function Chip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full"
      style={{ background: C.mist, color: C.ink }}>
      {label}
      <button onClick={onRemove} className="font-bold hover:opacity-60" style={{ color: C.iron }}>×</button>
    </span>
  );
}

function Spinner({ size = 14 }) {
  return (
    <span className="inline-block animate-spin rounded-full border-2 border-t-transparent align-middle"
      style={{ width: size, height: size, borderColor: "#fff", borderTopColor: "transparent" }} />
  );
}

/* ----------------------------- Sync settings ----------------------------- */
// Lives inside the dark settings dropdown. Talks to window.storage.sync
// (see src/storage-shim.js); renders nothing where sync isn't available
// (e.g. the artifact runtime, which brings its own window.storage).
function SyncPanel() {
  const sync = window.storage && window.storage.sync;
  const [status, setStatus] = useState(() => (sync ? sync.getStatus() : null));
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sync) return;
    const onStatus = (e) => setStatus(e.detail);
    window.addEventListener("hub-sync-status", onStatus);
    return () => window.removeEventListener("hub-sync-status", onStatus);
  }, [sync]);

  if (!sync || !status) return null;

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await sync.configure(token);
      setToken("");
    } catch (e) {
      setError((e && e.message) || "Could not connect.");
    } finally {
      setBusy(false);
    }
  };

  const linkStyle = { color: "#E8B4BE", textDecoration: "underline" };

  return (
    <div className="w-full pt-3 border-t" style={{ borderColor: "#4A4844" }}>
      {!status.enabled ? (
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "#B9B5AE" }}>
          <span className="font-semibold text-sm text-white">Sync across devices:</span>
          <span>
            paste a{" "}
            <a href="https://github.com/settings/tokens/new?scopes=gist&description=Opportunity%20Hub%20sync"
              target="_blank" rel="noopener noreferrer" style={linkStyle}>
              GitHub token ("gist" scope only)
            </a>{" "}
            and your data lives in a private gist instead of only this browser.
          </span>
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && token.trim() && !busy) connect(); }}
            placeholder="ghp_…" autoComplete="off"
            className="px-2 py-1 rounded text-xs outline-none min-w-[220px]"
            style={{ background: "#1E1D1B", border: "1px solid #4A4844", color: "#fff" }} />
          <button onClick={connect} disabled={busy || !token.trim()}
            className="px-2.5 py-1 rounded text-xs font-semibold text-white disabled:opacity-60 flex items-center gap-1.5"
            style={{ background: C.red }}>
            {busy && <Spinner size={11} />}{busy ? "Connecting…" : "Connect"}
          </button>
          {error && <span className="w-full" style={{ color: "#F3A6B2" }}>{error}</span>}
          <span className="w-full" style={{ color: "#8B8781" }}>
            If sync data already exists on your account, this device adopts it. The token stays on this device.
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: "#B9B5AE" }}>
          <span className="font-semibold text-sm text-white">Sync</span>
          <span>
            {status.syncing ? "Syncing…"
              : status.error ? "Sync error: " + status.error
              : status.lastSyncAt ? "Synced " + timeAgo(status.lastSyncAt)
              : "Waiting for first sync…"}
            {status.account ? " · @" + status.account : ""}
          </span>
          {status.gistUrl && (
            <a href={status.gistUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>view data ↗</a>
          )}
          <div className="ml-auto flex gap-2">
            <button onClick={() => sync.syncNow()} disabled={status.syncing}
              className="px-2 py-1 rounded text-xs font-semibold text-white disabled:opacity-60" style={{ background: "#4A4844" }}>
              Sync now
            </button>
            <button onClick={() => sync.disconnect()}
              className="px-2 py-1 rounded text-xs font-semibold text-white" style={{ background: "#4A4844" }}>
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================== APP =================================== */
export default function CMUOpportunityHub() {
  const [opportunities, setOpportunities] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [booted, setBooted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [toast, setToast] = useState(null);

  const [userData, setUserData] = useState({ saved: [], notes: {}, tracker: {}, hidden: [], overrides: {} });
  const [settings, setSettings] = useState({ autoRefresh: false, introDismissed: false });

  const [view, setView] = useState("browse");
  const [modalId, setModalId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  // Browse controls
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [layout, setLayout] = useState("grid");
  const [filters, setFilters] = useState({ types: [], loc: "all", paid: "all", year: "all", tags: [], savedOnly: false, showHidden: false });
  const [sortBy, setSortBy] = useState("deadline");
  const [showFilters, setShowFilters] = useState(false);

  // Calendar
  const now = new Date();
  const [calMonth, setCalMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [calSelected, setCalSelected] = useState(null);

  const saveTimers = useRef({});
  const oppsRef = useRef(opportunities);
  oppsRef.current = opportunities;
  const refreshRef = useRef(null);

  /* ------------------------- debounced persistence ------------------------ */
  const debouncedSave = useCallback((key, value, delay = 500) => {
    clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(async () => {
      try { await window.storage.set(key, JSON.stringify(value)); }
      catch (e) { console.error("Storage save failed:", key, e); }
    }, delay);
  }, []);

  useEffect(() => { if (booted) debouncedSave(KEY_USER, userData); }, [userData, booted, debouncedSave]);
  useEffect(() => { if (booted) debouncedSave(KEY_SETTINGS, settings); }, [settings, booted, debouncedSave]);
  useEffect(() => {
    if (booted) debouncedSave(KEY_CACHE, { list: opportunities, lastUpdated }, 800);
  }, [opportunities, lastUpdated, booted, debouncedSave]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  /* --------------------------------- refresh ------------------------------ */
  const refresh = useCallback(async () => {
    if (refreshRef.current === "busy") return;
    refreshRef.current = "busy";
    setRefreshing(true);
    setFetchError(null);
    try {
      // Without an AI key, run only the keyless feed categories instead of failing.
      const active = LLM_PROVIDER
        ? FETCH_CATEGORIES
        : FETCH_CATEGORIES.filter((c) => c.kind === "feed");
      const results = await Promise.allSettled(active.map((c) => c.fetcher()));
      const fetched = [];
      let anyOk = false;
      results.forEach((r) => {
        if (r.status === "fulfilled") { anyOk = true; fetched.push(...r.value); }
        else console.error("Category fetch failed:", r.reason);
      });
      if (!anyOk) {
        const first = results.find((r) => r.status === "rejected");
        throw new Error((first && first.reason && first.reason.message) || "All category fetches failed");
      }

      // Merge, never replace: keep existing entries so saves/notes/tracker survive.
      const current = oppsRef.current;
      const nowTs = Date.now();
      const { merged, additions } = mergeUniqueOpportunities(current, fetched, nowTs);
      setOpportunities(merged);
      setLastUpdated(nowTs);
      const failedCount = results.filter((r) => r.status === "rejected").length;
      setToast(
        additions.length > 0
          ? `Found ${additions.length} new ${additions.length === 1 ? "opportunity" : "opportunities"}` + (failedCount ? ` (${failedCount} of ${results.length} sources failed)` : "")
          : "You're up to date — no new opportunities found" + (failedCount ? ` (${failedCount} of ${results.length} sources failed)` : "")
      );
    } catch (e) {
      console.error(e);
      setFetchError((e && e.message ? e.message + " " : "") + "Showing your cached list — nothing was lost.");
    } finally {
      setRefreshing(false);
      refreshRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  /* ------------------------------ initial boot ---------------------------- */
  useEffect(() => {
    (async () => {
      // If cloud sync is configured, let the initial pull land first so we
      // boot from the freshest copy (resolves immediately when sync is off).
      try { await window.storage.ready; } catch (e) { /* offline — boot from local */ }
      const [cache, user, setts] = await Promise.all([
        storageLoad(KEY_CACHE), storageLoad(KEY_USER), storageLoad(KEY_SETTINGS),
      ]);
      if (user && typeof user === "object") setUserData(normalizeUserRecord(user));
      if (setts && typeof setts === "object") {
        setSettings({ autoRefresh: !!setts.autoRefresh, introDismissed: !!setts.introDismissed });
      }
      const { list, updated } = parseCacheRecord(cache);
      setOpportunities(list);
      setLastUpdated(updated);
      setBooted(true);
      // Stale-while-revalidate: render immediately, refresh in background if stale.
      if (!updated || Date.now() - updated > 24 * 3600 * 1000) {
        setTimeout(() => refresh(), 300);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------- apply sync pulls from other devices --------------------- */
  useEffect(() => {
    if (!booted) return;
    const onRemoteChange = async (e) => {
      const keys = (e.detail && e.detail.keys) || [];
      if (keys.includes(KEY_USER)) {
        const user = await storageLoad(KEY_USER);
        if (user && typeof user === "object") setUserData(normalizeUserRecord(user));
      }
      if (keys.includes(KEY_SETTINGS)) {
        const setts = await storageLoad(KEY_SETTINGS);
        if (setts && typeof setts === "object") {
          setSettings({ autoRefresh: !!setts.autoRefresh, introDismissed: !!setts.introDismissed });
        }
      }
      if (keys.includes(KEY_CACHE)) {
        const { list, updated } = parseCacheRecord(await storageLoad(KEY_CACHE));
        setOpportunities(list);
        setLastUpdated(updated);
      }
      if (keys.some((k) => [KEY_USER, KEY_SETTINGS, KEY_CACHE].includes(k))) {
        setToast("Synced updates from your other devices");
      }
    };
    window.addEventListener("hub-sync-remote-change", onRemoteChange);
    return () => window.removeEventListener("hub-sync-remote-change", onRemoteChange);
  }, [booted]);

  /* ---------------------------- auto-refresh loop -------------------------- */
  useEffect(() => {
    if (!settings.autoRefresh) return;
    const id = setInterval(() => refresh(), 6 * 3600 * 1000);
    return () => clearInterval(id);
  }, [settings.autoRefresh, refresh]);

  /* ------------------------------ derived data ---------------------------- */
  // User edits layer on top of fetched data, so they survive feed refreshes.
  const displayed = useMemo(() => {
    const ov = userData.overrides || {};
    return opportunities.map((o) => (ov[o.id] ? { ...o, ...ov[o.id], id: o.id } : o));
  }, [opportunities, userData.overrides]);

  const hiddenSet = useMemo(() => new Set(userData.hidden), [userData.hidden]);
  const visible = useMemo(() => displayed.filter((o) => !hiddenSet.has(o.id)), [displayed, hiddenSet]);

  const byId = useMemo(() => {
    const m = {};
    displayed.forEach((o) => { m[o.id] = o; });
    return m;
  }, [displayed]);

  const allTags = useMemo(() => {
    const s = new Set();
    displayed.forEach((o) => (o.tags || []).forEach((t) => s.add(t)));
    return [...s].sort();
  }, [displayed]);

  const filtered = useMemo(() => {
    let list = displayed.filter((o) => {
      if (!filters.showHidden && hiddenSet.has(o.id)) return false;
      if (filters.savedOnly && !userData.saved.includes(o.id)) return false;
      if (filters.types.length && !filters.types.includes(o.type)) return false;
      if (filters.loc !== "all" && locCategory(o) !== filters.loc) return false;
      if (filters.paid === "paid" && !isPaid(o.compensation)) return false;
      if (filters.paid === "unpaid" && isPaid(o.compensation)) return false;
      if (!matchesYear(o, filters.year)) return false;
      if (filters.tags.length && !filters.tags.every((t) => (o.tags || []).includes(t))) return false;
      if (search) {
        const hay = (o.title + " " + o.organization + " " + o.description).toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
    const sorters = {
      deadline: (a, b) => {
        const da = daysUntil(a.deadline), db = daysUntil(b.deadline);
        const va = a.deadline === "Rolling" ? Infinity : (da < 0 ? 100000 + Math.abs(da) : da);
        const vb = b.deadline === "Rolling" ? Infinity : (db < 0 ? 100000 + Math.abs(db) : db);
        if (va === vb) return a.title.localeCompare(b.title);
        return va - vb;
      },
      recent: (a, b) => (b.fetchedAt || 0) - (a.fetchedAt || 0),
      type: (a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title),
      alpha: (a, b) => a.title.localeCompare(b.title),
      compensation: (a, b) => compValue(b.compensation) - compValue(a.compensation),
    };
    return [...list].sort(sorters[sortBy] || sorters.deadline);
  }, [displayed, hiddenSet, filters, search, sortBy, userData.saved]);

  const dueSoon = useMemo(() =>
    visible.filter((o) => { const d = daysUntil(o.deadline); return d != null && d >= 0 && d <= 3; })
      .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline)),
    [visible]);

  /* ------------------------------ user actions ---------------------------- */
  const toggleSave = (id) => setUserData((u) => ({
    ...u, saved: u.saved.includes(id) ? u.saved.filter((x) => x !== id) : [...u.saved, id],
  }));
  const setNote = (id, note) => setUserData((u) => ({ ...u, notes: { ...u.notes, [id]: note } }));
  const toggleHidden = (id) => {
    const wasHidden = userData.hidden.includes(id);
    setUserData((u) => ({
      ...u, hidden: u.hidden.includes(id) ? u.hidden.filter((x) => x !== id) : [...u.hidden, id],
    }));
    setToast(wasHidden ? "Opportunity restored" : "Hidden — find it again under Filters → Show hidden");
  };
  const saveEdit = (id, fields) => {
    setUserData((u) => ({ ...u, overrides: { ...u.overrides, [id]: fields } }));
    setToast("Changes saved");
  };
  const resetEdit = (id) => {
    setUserData((u) => {
      const ov = { ...u.overrides }; delete ov[id];
      return { ...u, overrides: ov };
    });
    setToast("Restored original listing");
  };
  const addToTracker = (opp) => setUserData((u) => {
    if (u.tracker[opp.id]) return u;
    return {
      ...u,
      tracker: {
        ...u.tracker,
        [opp.id]: {
          status: "Interested", dateApplied: "", addedAt: Date.now(),
          snapshot: { title: opp.title, organization: opp.organization, deadline: opp.deadline, type: opp.type, applyUrl: opp.applyUrl },
        },
      },
    };
  });
  const setTrackerField = (id, field, value) => setUserData((u) => ({
    ...u, tracker: { ...u.tracker, [id]: { ...u.tracker[id], [field]: value } },
  }));
  const removeFromTracker = (id) => setUserData((u) => {
    const t = { ...u.tracker }; delete t[id];
    return { ...u, tracker: t };
  });

  const exportJSON = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      saved: userData.saved.map((id) => byId[id] || { id }),
      tracker: Object.entries(userData.tracker).map(([id, t]) => ({ id, ...t, note: userData.notes[id] || "" })),
    };
    downloadFile("cmu-opportunity-hub-export.json", JSON.stringify(payload, null, 2), "application/json");
  };
  const exportCSV = () => {
    const rows = [["source", "title", "organization", "type", "deadline", "status", "dateApplied", "note", "applyUrl"]];
    Object.entries(userData.tracker).forEach(([id, t]) => {
      const s = t.snapshot || byId[id] || {};
      rows.push(["tracker", s.title, s.organization, s.type, s.deadline, t.status, t.dateApplied, userData.notes[id] || "", s.applyUrl]);
    });
    userData.saved.forEach((id) => {
      const o = byId[id]; if (!o) return;
      rows.push(["saved", o.title, o.organization, o.type, o.deadline, "", "", userData.notes[id] || "", o.applyUrl]);
    });
    downloadFile("cmu-opportunity-hub-export.csv", rows.map((r) => r.map(csvEscape).join(",")).join("\n"), "text/csv");
  };

  const clearFilters = () => setFilters({ types: [], loc: "all", paid: "all", year: "all", tags: [], savedOnly: false, showHidden: false });
  const activeFilterCount =
    filters.types.length + filters.tags.length +
    (filters.loc !== "all" ? 1 : 0) + (filters.paid !== "all" ? 1 : 0) +
    (filters.year !== "all" ? 1 : 0) + (filters.savedOnly ? 1 : 0) + (filters.showHidden ? 1 : 0);

  const modalOpp = modalId ? byId[modalId] : null;

  /* ================================ RENDER ================================ */
  if (!booted) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.paper, fontFamily: SANS }}>
        <div className="text-center">
          <div className="text-3xl mb-2" style={{ fontFamily: SERIF, color: C.red }}>CMU CS Opportunity Hub</div>
          <div className="text-sm" style={{ color: C.iron }}>Loading your saved data…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: C.paper, fontFamily: SANS, color: C.ink }}>
      {/* ------------------------------ Header ------------------------------ */}
      <header className="sticky top-0 z-40 border-b" style={{ background: C.ink, borderColor: "#000" }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 mr-auto">
            <div className="w-8 h-8 rounded-sm flex items-center justify-center font-bold text-white" style={{ background: C.red, fontFamily: SERIF }}>C</div>
            <div>
              <div className="text-white font-semibold leading-tight" style={{ fontFamily: SERIF, fontSize: 17 }}>CS Opportunity Hub</div>
              <div className="text-[11px] leading-tight" style={{ color: "#B9B5AE" }}>research · REUs · internships · hackathons</div>
            </div>
          </div>
          <div className="text-xs hidden sm:block" style={{ color: "#B9B5AE" }}>
            Last updated: {lastUpdated ? timeAgo(lastUpdated) : "never (showing seed data)"}
          </div>
          <button onClick={refresh} disabled={refreshing}
            className="px-3 py-1.5 rounded font-semibold text-sm text-white flex items-center gap-2 transition-opacity disabled:opacity-70"
            style={{ background: C.red }}>
            {refreshing ? <Spinner /> : <span>↻</span>}
            {refreshing ? "Refreshing…" : "Refresh opportunities"}
          </button>
          <button onClick={() => setShowSettings((s) => !s)} aria-label="Settings"
            className="px-2 py-1.5 rounded text-white text-sm hover:opacity-80" style={{ background: "#3A3835" }}>⚙</button>
        </div>
        {showSettings && (
          <div className="border-t" style={{ background: "#2A2926", borderColor: "#000" }}>
            <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-4 text-sm text-white">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={settings.autoRefresh}
                  onChange={(e) => setSettings((s) => ({ ...s, autoRefresh: e.target.checked }))} />
                Auto-refresh every 6 hours while this tab is open
              </label>
              <span className="text-xs sm:hidden" style={{ color: "#B9B5AE" }}>
                Last updated: {lastUpdated ? timeAgo(lastUpdated) : "never"}
              </span>
              <div className="ml-auto flex gap-2">
                <button onClick={exportJSON} className="px-2 py-1 rounded text-xs font-semibold" style={{ background: "#4A4844" }}>Export JSON</button>
                <button onClick={exportCSV} className="px-2 py-1 rounded text-xs font-semibold" style={{ background: "#4A4844" }}>Export CSV</button>
              </div>
              <SyncPanel />
            </div>
          </div>
        )}
        {/* Nav */}
        <nav className="border-t" style={{ background: "#242320", borderColor: "#000" }}>
          <div className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
            {[["browse", "Browse"], ["calendar", "Calendar"], ["tracker", "Tracker"], ["dashboard", "Dashboard"]].map(([k, label]) => (
              <button key={k} onClick={() => setView(k)}
                className="px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors"
                style={{
                  color: view === k ? "#fff" : "#A6A29B",
                  borderBottom: view === k ? `3px solid ${C.red}` : "3px solid transparent",
                }}>
                {label}
                {k === "tracker" && Object.keys(userData.tracker).length > 0 && (
                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: C.red, color: "#fff" }}>
                    {Object.keys(userData.tracker).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </nav>
      </header>

      {/* ------------------------------ Banners ------------------------------ */}
      <div className="max-w-6xl mx-auto px-4">
        {fetchError && (
          <div className="mt-3 px-4 py-3 rounded-lg flex flex-wrap items-center gap-3 text-sm"
            style={{ background: "#FBE9EC", color: C.redDark, border: `1px solid #F0C6CE` }}>
            <span className="font-semibold">Refresh failed.</span> {fetchError}
            <button onClick={refresh} disabled={refreshing}
              className="ml-auto px-3 py-1 rounded font-semibold text-white text-xs" style={{ background: C.red }}>
              Retry
            </button>
          </div>
        )}
        {!LLM_PROVIDER && (
          <div className="mt-3 px-4 py-3 rounded-lg text-sm"
            style={{ background: "#FFFDF5", border: `1px solid ${C.line}` }}>
            <span className="font-semibold" style={{ fontFamily: SERIF }}>Internship listings update live for free — no key needed. </span>
            To also discover CMU research, REU, hackathon, and AI-curated internship openings, add a free Gemini API key
            (no credit card) to <code>.env.local</code> — see the README.
          </div>
        )}
        {!settings.introDismissed && (
          <div className="mt-3 px-4 py-3 rounded-lg text-sm flex flex-wrap items-start gap-3"
            style={{ background: "#FFFDF5", border: `1px solid ${C.line}` }}>
            <div>
              <span className="font-semibold" style={{ fontFamily: SERIF }}>Welcome to your Opportunity Hub. </span>
              This app keeps itself current: hit <b>Refresh opportunities</b> any time to pull real, live openings from the web,
              and it also refreshes automatically when your list is more than a day old. Star things you like, add them to the
              Tracker, and check the Calendar so nothing slips past you.
            </div>
            <button onClick={() => setSettings((s) => ({ ...s, introDismissed: true }))}
              className="ml-auto text-xs font-semibold px-2 py-1 rounded" style={{ background: C.mist, color: C.iron }}>
              Got it
            </button>
          </div>
        )}
        {dueSoon.length > 0 && (
          <div className="mt-3 px-4 py-3 rounded-lg text-sm" style={{ background: "#FBE9EC", border: "1px solid #F0C6CE" }}>
            <span className="font-bold" style={{ color: C.redDark }}>⏰ Due in the next 3 days: </span>
            {dueSoon.map((o, i) => (
              <button key={o.id} onClick={() => setModalId(o.id)} className="underline font-medium hover:opacity-70" style={{ color: C.redDark }}>
                {o.title}{i < dueSoon.length - 1 ? "," : ""}&nbsp;
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ------------------------------- Views ------------------------------- */}
      <main className="max-w-6xl mx-auto px-4 py-5">
        {view === "browse" && (
          <BrowseView
            filtered={filtered} total={filters.showHidden ? displayed.length : visible.length}
            hiddenCount={userData.hidden.length}
            searchInput={searchInput} setSearchInput={setSearchInput}
            layout={layout} setLayout={setLayout}
            filters={filters} setFilters={setFilters}
            sortBy={sortBy} setSortBy={setSortBy}
            showFilters={showFilters} setShowFilters={setShowFilters}
            allTags={allTags} activeFilterCount={activeFilterCount} clearFilters={clearFilters}
            saved={userData.saved} toggleSave={toggleSave} openModal={setModalId}
            hidden={userData.hidden} toggleHidden={toggleHidden}
            refreshing={refreshing}
          />
        )}
        {view === "calendar" && (
          <CalendarView
            opportunities={visible} calMonth={calMonth} setCalMonth={setCalMonth}
            calSelected={calSelected} setCalSelected={setCalSelected} openModal={setModalId}
          />
        )}
        {view === "tracker" && (
          <TrackerView
            userData={userData} byId={byId}
            setTrackerField={setTrackerField} removeFromTracker={removeFromTracker}
            setNote={setNote} openModal={setModalId} exportJSON={exportJSON} exportCSV={exportCSV}
            goBrowse={() => setView("browse")}
          />
        )}
        {view === "dashboard" && (
          <DashboardView opportunities={visible} userData={userData} openModal={setModalId} />
        )}
      </main>

      {/* ------------------------------- Modal ------------------------------- */}
      {modalOpp && (
        <DetailModal
          opp={modalOpp} onClose={() => setModalId(null)}
          saved={userData.saved.includes(modalOpp.id)} toggleSave={() => toggleSave(modalOpp.id)}
          inTracker={!!userData.tracker[modalOpp.id]} addToTracker={() => addToTracker(modalOpp)}
          note={userData.notes[modalOpp.id] || ""} setNote={(n) => setNote(modalOpp.id, n)}
          isHidden={userData.hidden.includes(modalOpp.id)} toggleHidden={() => toggleHidden(modalOpp.id)}
          edited={!!userData.overrides[modalOpp.id]}
          onSaveEdit={(fields) => saveEdit(modalOpp.id, fields)}
          onResetEdit={() => resetEdit(modalOpp.id)}
        />
      )}

      {/* ------------------------------- Toast ------------------------------- */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg text-sm font-semibold text-white shadow-lg"
          style={{ background: C.ink }}>
          {toast}
        </div>
      )}

      <footer className="max-w-6xl mx-auto px-4 py-6 text-xs" style={{ color: C.faint }}>
        Deadlines come from live web results and can change — always confirm on the official application page.
      </footer>
    </div>
  );
}

/* =============================== BROWSE VIEW ============================== */
function BrowseView(props) {
  const {
    filtered, total, hiddenCount, searchInput, setSearchInput, layout, setLayout,
    filters, setFilters, sortBy, setSortBy, showFilters, setShowFilters,
    allTags, activeFilterCount, clearFilters, saved, toggleSave, openModal,
    hidden, toggleHidden, refreshing,
  } = props;

  const toggleType = (t) => setFilters((f) => ({
    ...f, types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t],
  }));
  const toggleTag = (t) => setFilters((f) => ({
    ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t],
  }));

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search titles, organizations, descriptions…"
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: C.card, border: `1px solid ${C.line}` }} />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
          className="px-2 py-2 rounded-lg text-sm" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <option value="deadline">Sort: deadline (soonest)</option>
          <option value="recent">Sort: recently added</option>
          <option value="type">Sort: type</option>
          <option value="alpha">Sort: A → Z</option>
          <option value="compensation">Sort: compensation</option>
        </select>
        <button onClick={() => setShowFilters((s) => !s)}
          className="px-3 py-2 rounded-lg text-sm font-semibold"
          style={{ background: showFilters ? C.ink : C.card, color: showFilters ? "#fff" : C.ink, border: `1px solid ${showFilters ? C.ink : C.line}` }}>
          Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
        </button>
        <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
          {[["grid", "▦ Cards"], ["table", "☰ Table"]].map(([k, label]) => (
            <button key={k} onClick={() => setLayout(k)} className="px-3 py-2 text-sm font-semibold"
              style={{ background: layout === k ? C.ink : C.card, color: layout === k ? "#fff" : C.iron }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="mb-3 p-4 rounded-lg" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: C.faint }}>Type</div>
              <div className="flex flex-wrap gap-1.5">
                {TYPES.map((t) => (
                  <button key={t} onClick={() => toggleType(t)} className="px-2.5 py-1 rounded-full text-xs font-semibold"
                    style={{
                      background: filters.types.includes(t) ? C.red : C.mist,
                      color: filters.types.includes(t) ? "#fff" : C.iron,
                    }}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: C.faint }}>Location</div>
              <select value={filters.loc} onChange={(e) => setFilters((f) => ({ ...f, loc: e.target.value }))}
                className="px-2 py-1 rounded text-sm" style={{ border: `1px solid ${C.line}` }}>
                <option value="all">Anywhere</option>
                <option value="remote">Remote</option>
                <option value="oncampus">Pittsburgh / on-campus</option>
                <option value="other">Elsewhere</option>
              </select>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: C.faint }}>Pay</div>
              <select value={filters.paid} onChange={(e) => setFilters((f) => ({ ...f, paid: e.target.value }))}
                className="px-2 py-1 rounded text-sm" style={{ border: `1px solid ${C.line}` }}>
                <option value="all">Paid or unpaid</option>
                <option value="paid">Paid only</option>
                <option value="unpaid">Unpaid / credit</option>
              </select>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: C.faint }}>Your year</div>
              <select value={filters.year} onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))}
                className="px-2 py-1 rounded text-sm" style={{ border: `1px solid ${C.line}` }}>
                <option value="all">Any year</option>
                <option value="freshman">Freshman</option>
                <option value="sophomore">Sophomore</option>
                <option value="junior">Junior</option>
                <option value="senior">Senior</option>
              </select>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: C.faint }}>Saved</div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={filters.savedOnly}
                  onChange={(e) => setFilters((f) => ({ ...f, savedOnly: e.target.checked }))} />
                Saved only ★
              </label>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: C.faint }}>Hidden</div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={filters.showHidden}
                  onChange={(e) => setFilters((f) => ({ ...f, showHidden: e.target.checked }))} />
                Show hidden{hiddenCount ? ` (${hiddenCount})` : ""}
              </label>
            </div>
          </div>
          {allTags.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: C.faint }}>Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((t) => (
                  <button key={t} onClick={() => toggleTag(t)} className="px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{
                      background: filters.tags.includes(t) ? C.ink : C.mist,
                      color: filters.tags.includes(t) ? "#fff" : C.iron,
                    }}>{t}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {filters.types.map((t) => <Chip key={t} label={t} onRemove={() => toggleType(t)} />)}
          {filters.loc !== "all" && <Chip label={{ remote: "Remote", oncampus: "Pittsburgh", other: "Elsewhere" }[filters.loc]} onRemove={() => setFilters((f) => ({ ...f, loc: "all" }))} />}
          {filters.paid !== "all" && <Chip label={filters.paid === "paid" ? "Paid only" : "Unpaid / credit"} onRemove={() => setFilters((f) => ({ ...f, paid: "all" }))} />}
          {filters.year !== "all" && <Chip label={filters.year} onRemove={() => setFilters((f) => ({ ...f, year: "all" }))} />}
          {filters.savedOnly && <Chip label="Saved ★" onRemove={() => setFilters((f) => ({ ...f, savedOnly: false }))} />}
          {filters.showHidden && <Chip label="Showing hidden" onRemove={() => setFilters((f) => ({ ...f, showHidden: false }))} />}
          {filters.tags.map((t) => <Chip key={t} label={"#" + t} onRemove={() => toggleTag(t)} />)}
          <button onClick={clearFilters} className="text-xs font-semibold underline" style={{ color: C.red }}>Clear all</button>
        </div>
      )}

      <div className="text-xs mb-3" style={{ color: C.faint }}>
        Showing {filtered.length} of {total} opportunities
        {hiddenCount > 0 && !filters.showHidden ? ` · ${hiddenCount} hidden` : ""}
        {refreshing ? " · fetching fresh listings…" : ""}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center rounded-lg" style={{ background: C.card, border: `1px dashed ${C.line}` }}>
          <div className="text-2xl mb-2" style={{ fontFamily: SERIF }}>Nothing matches yet</div>
          <div className="text-sm mb-4" style={{ color: C.iron }}>
            Try clearing a filter or two — or hit Refresh opportunities to pull fresh listings from the web.
          </div>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="px-4 py-2 rounded font-semibold text-white text-sm" style={{ background: C.red }}>
              Clear all filters
            </button>
          )}
        </div>
      ) : layout === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((o) => (
            <OppCard key={o.id} o={o} saved={saved.includes(o.id)} toggleSave={() => toggleSave(o.id)}
              isHidden={hidden.includes(o.id)} toggleHidden={() => toggleHidden(o.id)} onOpen={() => openModal(o.id)} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg overflow-x-auto" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <table className="w-full text-sm" style={{ minWidth: 760 }}>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider" style={{ color: C.faint, borderBottom: `2px solid ${C.line}` }}>
                <th className="px-3 py-2">★</th>
                <th className="px-3 py-2">Opportunity</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Deadline</th>
                <th className="px-3 py-2">Compensation</th>
                <th className="px-3 py-2">Eligibility</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} onClick={() => openModal(o.id)} className="cursor-pointer hover:bg-black hover:bg-opacity-5"
                  style={{ borderBottom: `1px solid ${C.line}`, opacity: hidden.includes(o.id) ? 0.55 : 1 }}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Star on={saved.includes(o.id)} onClick={() => toggleSave(o.id)} />
                    <HideButton hidden={hidden.includes(o.id)} onClick={() => toggleHidden(o.id)} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-semibold flex items-center gap-2">{o.title} {isNew(o) && <NewBadge />}</div>
                    <div className="text-xs" style={{ color: C.iron }}>{o.organization}</div>
                  </td>
                  <td className="px-3 py-2"><TypeBadge type={o.type} /></td>
                  <td className="px-3 py-2 text-xs" style={{ color: C.iron }}>{o.remote ? "Remote · " : ""}{o.location}</td>
                  <td className="px-3 py-2"><DeadlinePill deadline={o.deadline} /></td>
                  <td className="px-3 py-2 text-xs" style={{ color: C.iron }}>{o.compensation}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: C.iron }}>{o.eligibility}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function isNew(o) {
  return o.fetchedAt && Date.now() - o.fetchedAt < 7 * DAY;
}

function railColor(o) {
  const d = daysUntil(o.deadline);
  if (o.deadline === "Rolling") return C.rolling;
  if (d != null && d < 0) return C.line;
  if (d != null && d <= 14) return C.red;
  return "#C9C4BB";
}

function OppCard({ o, saved, toggleSave, isHidden, toggleHidden, onOpen }) {
  return (
    <div onClick={onOpen}
      className="rounded-lg p-4 cursor-pointer transition-shadow hover:shadow-md flex flex-col gap-2"
      style={{ background: C.card, border: `1px solid ${C.line}`, borderLeft: `4px solid ${railColor(o)}`, opacity: isHidden ? 0.55 : 1 }}>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="font-semibold leading-snug flex items-center gap-2 flex-wrap" style={{ fontFamily: SERIF, fontSize: 16 }}>
            {o.title} {isNew(o) && <NewBadge />}
          </div>
          <div className="text-xs mt-0.5" style={{ color: C.iron }}>{o.organization}</div>
        </div>
        <Star on={saved} onClick={toggleSave} />
        <HideButton hidden={isHidden} onClick={toggleHidden} />
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">
        <TypeBadge type={o.type} />
        <DeadlinePill deadline={o.deadline} />
      </div>
      <div className="text-xs" style={{ color: C.iron }}>
        {o.remote ? "🌐 Remote · " : "📍 "}{o.location}
      </div>
      <div className="text-xs" style={{ color: C.iron }}>💰 {o.compensation}</div>
      <div className="text-xs" style={{ color: C.faint }}>🎓 {o.eligibility}</div>
    </div>
  );
}

/* ============================== DETAIL MODAL ============================== */
function DetailModal({ opp, onClose, saved, toggleSave, inTracker, addToTracker, note, setNote, isHidden, toggleHidden, edited, onSaveEdit, onResetEdit }) {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(20,19,17,0.55)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 sm:p-6"
        style={{ background: C.card }}>
        {editing ? (
          <EditForm opp={opp} edited={edited}
            onCancel={() => setEditing(false)}
            onSave={(fields) => { onSaveEdit(fields); setEditing(false); }}
            onReset={() => { onResetEdit(); setEditing(false); }} />
        ) : (
        <>
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <TypeBadge type={opp.type} />
              <DeadlinePill deadline={opp.deadline} />
              {isNew(opp) && <NewBadge />}
              {edited && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                  style={{ background: C.mist, color: C.iron }}>Edited by you</span>
              )}
              {isHidden && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                  style={{ background: "#F0EEEA", color: C.faint }}>Hidden</span>
              )}
            </div>
            <h2 className="leading-tight" style={{ fontFamily: SERIF, fontSize: 24 }}>{opp.title}</h2>
            <div className="text-sm mt-0.5" style={{ color: C.iron }}>{opp.organization}</div>
          </div>
          <button onClick={onClose} className="text-2xl leading-none px-2 hover:opacity-60" style={{ color: C.iron }}>×</button>
        </div>

        <p className="text-sm mt-4 leading-relaxed">{opp.description || "No description available — check the application page for details."}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-4 text-sm">
          <div><span className="font-semibold">Location: </span>{opp.remote ? "Remote · " : ""}{opp.location}</div>
          <div><span className="font-semibold">Deadline: </span>{fmtDeadline(opp.deadline)}</div>
          <div><span className="font-semibold">Compensation: </span>{opp.compensation}</div>
          <div><span className="font-semibold">Eligibility: </span>{opp.eligibility}</div>
        </div>

        {opp.tags && opp.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {opp.tags.map((t) => (
              <span key={t} className="text-xs px-2 py-0.5 rounded-full" style={{ background: C.mist, color: C.iron }}>#{t}</span>
            ))}
          </div>
        )}

        <div className="mt-4">
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: C.faint }}>Your notes</div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Professors to email, essay ideas, referral contacts…"
            rows={3} className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ border: `1px solid ${C.line}`, background: C.paper }} />
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {opp.applyUrl ? (
            <a href={opp.applyUrl} target="_blank" rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg font-semibold text-sm text-white" style={{ background: C.red }}>
              Open application page ↗
            </a>
          ) : (
            <span className="px-4 py-2 rounded-lg text-sm" style={{ background: C.mist, color: C.iron }}>No link available — search the program name</span>
          )}
          <button onClick={toggleSave} className="px-4 py-2 rounded-lg font-semibold text-sm"
            style={{ background: saved ? "#FFF6DC" : C.mist, color: saved ? "#8A6D00" : C.ink, border: `1px solid ${C.line}` }}>
            {saved ? "★ Saved" : "☆ Save"}
          </button>
          <button onClick={addToTracker} disabled={inTracker} className="px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-60"
            style={{ background: C.ink, color: "#fff" }}>
            {inTracker ? "✓ In tracker" : "+ Add to tracker"}
          </button>
          <button onClick={() => setEditing(true)} className="px-4 py-2 rounded-lg font-semibold text-sm"
            style={{ background: C.mist, color: C.ink, border: `1px solid ${C.line}` }}>
            ✎ Edit
          </button>
          <button onClick={toggleHidden} className="px-4 py-2 rounded-lg font-semibold text-sm"
            style={{ background: C.mist, color: isHidden ? C.ink : C.iron, border: `1px solid ${C.line}` }}>
            {isHidden ? "↺ Unhide" : "✕ Hide"}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Edit form ------------------------------- */
function EditForm({ opp, edited, onSave, onCancel, onReset }) {
  const [form, setForm] = useState({
    title: opp.title,
    organization: opp.organization,
    type: opp.type,
    location: opp.location,
    remote: !!opp.remote,
    description: opp.description || "",
    rolling: opp.deadline === "Rolling",
    deadlineDate: opp.deadline === "Rolling" ? "" : opp.deadline,
    compensation: opp.compensation || "",
    eligibility: opp.eligibility || "",
    tags: (opp.tags || []).join(", "),
    applyUrl: opp.applyUrl || "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const canSave = form.title.trim() && form.organization.trim();

  const submit = () => {
    if (!canSave) return;
    onSave({
      title: form.title.trim(),
      organization: form.organization.trim(),
      type: form.type,
      location: form.location.trim() || "See listing",
      remote: form.remote,
      description: form.description.trim(),
      deadline: form.rolling || !form.deadlineDate ? "Rolling" : form.deadlineDate,
      compensation: form.compensation.trim() || "See listing",
      eligibility: form.eligibility.trim() || "Undergraduates",
      tags: form.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      applyUrl: form.applyUrl.trim(),
    });
  };

  const inputStyle = { border: `1px solid ${C.line}`, background: C.paper };
  const Label = ({ children }) => (
    <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: C.faint }}>{children}</div>
  );

  return (
    <div>
      <div className="flex items-start gap-3 mb-4">
        <h2 className="flex-1 leading-tight" style={{ fontFamily: SERIF, fontSize: 22 }}>Edit opportunity</h2>
        <button onClick={onCancel} className="text-2xl leading-none px-2 hover:opacity-60" style={{ color: C.iron }}>×</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div className="sm:col-span-2">
          <Label>Title *</Label>
          <input value={form.title} onChange={set("title")} className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
        </div>
        <div>
          <Label>Organization *</Label>
          <input value={form.organization} onChange={set("organization")} className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
        </div>
        <div>
          <Label>Type</Label>
          <select value={form.type} onChange={set("type")} className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <Label>Location</Label>
          <input value={form.location} onChange={set("location")} className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.remote} onChange={set("remote")} /> Remote
          </label>
        </div>
        <div>
          <Label>Deadline</Label>
          <div className="flex items-center gap-3">
            <input type="date" value={form.deadlineDate} onChange={set("deadlineDate")} disabled={form.rolling}
              className="px-3 py-2 rounded-lg outline-none disabled:opacity-50" style={inputStyle} />
            <label className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={form.rolling} onChange={set("rolling")} /> Rolling
            </label>
          </div>
        </div>
        <div>
          <Label>Compensation</Label>
          <input value={form.compensation} onChange={set("compensation")} className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
        </div>
        <div className="sm:col-span-2">
          <Label>Eligibility</Label>
          <input value={form.eligibility} onChange={set("eligibility")} className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
        </div>
        <div className="sm:col-span-2">
          <Label>Description</Label>
          <textarea value={form.description} onChange={set("description")} rows={4}
            className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
        </div>
        <div className="sm:col-span-2">
          <Label>Tags (comma-separated)</Label>
          <input value={form.tags} onChange={set("tags")} placeholder="machine learning, systems, paid"
            className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
        </div>
        <div className="sm:col-span-2">
          <Label>Application URL</Label>
          <input value={form.applyUrl} onChange={set("applyUrl")} placeholder="https://…"
            className="w-full px-3 py-2 rounded-lg outline-none" style={inputStyle} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-5">
        <button onClick={submit} disabled={!canSave}
          className="px-4 py-2 rounded-lg font-semibold text-sm text-white disabled:opacity-50" style={{ background: C.red }}>
          Save changes
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg font-semibold text-sm"
          style={{ background: C.mist, color: C.ink, border: `1px solid ${C.line}` }}>
          Cancel
        </button>
        {edited && (
          <button onClick={onReset} className="ml-auto px-4 py-2 rounded-lg font-semibold text-sm"
            style={{ background: "transparent", color: C.red, border: `1px solid #F0C6CE` }}>
            Reset to original
          </button>
        )}
      </div>
      {!canSave && <div className="text-xs mt-2" style={{ color: C.red }}>Title and organization are required.</div>}
    </div>
  );
}

/* ============================== CALENDAR VIEW ============================= */
function CalendarView({ opportunities, calMonth, setCalMonth, calSelected, setCalSelected, openModal }) {
  const { y, m } = calMonth;
  const monthName = new Date(y, m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const firstWeekday = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayIso = new Date().toISOString().slice(0, 10);

  const byDate = useMemo(() => {
    const map = {};
    opportunities.forEach((o) => {
      if (o.deadline === "Rolling") return;
      (map[o.deadline] = map[o.deadline] || []).push(o);
    });
    return map;
  }, [opportunities]);

  const rolling = opportunities.filter((o) => o.deadline === "Rolling");
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const isoFor = (d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const selectedList = calSelected ? byDate[calSelected] || [] : [];

  const nav = (delta) => {
    const nd = new Date(y, m + delta, 1);
    setCalMonth({ y: nd.getFullYear(), m: nd.getMonth() });
    setCalSelected(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 style={{ fontFamily: SERIF, fontSize: 22 }}>{monthName}</h2>
        <div className="flex gap-1">
          <button onClick={() => nav(-1)} className="px-3 py-1.5 rounded font-bold" style={{ background: C.card, border: `1px solid ${C.line}` }}>‹</button>
          <button onClick={() => { const t = new Date(); setCalMonth({ y: t.getFullYear(), m: t.getMonth() }); setCalSelected(null); }}
            className="px-3 py-1.5 rounded text-sm font-semibold" style={{ background: C.card, border: `1px solid ${C.line}` }}>Today</button>
          <button onClick={() => nav(1)} className="px-3 py-1.5 rounded font-bold" style={{ background: C.card, border: `1px solid ${C.line}` }}>›</button>
        </div>
      </div>

      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
        <div className="grid grid-cols-7 text-center text-xs font-bold uppercase tracking-wider py-2"
          style={{ background: C.ink, color: "#B9B5AE" }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7" style={{ background: C.card }}>
          {cells.map((d, i) => {
            if (d === null) return <div key={"e" + i} className="min-h-[72px]" style={{ borderTop: `1px solid ${C.line}`, background: C.paper }} />;
            const iso = isoFor(d);
            const items = byDate[iso] || [];
            const isToday = iso === todayIso;
            const isSel = iso === calSelected;
            return (
              <button key={iso} onClick={() => setCalSelected(iso === calSelected ? null : iso)}
                className="min-h-[72px] p-1.5 text-left align-top hover:bg-black hover:bg-opacity-5 transition-colors"
                style={{
                  borderTop: `1px solid ${C.line}`, borderLeft: i % 7 === 0 ? "none" : `1px solid ${C.line}`,
                  background: isSel ? "#FBE9EC" : undefined,
                }}>
                <div className="text-xs font-semibold inline-flex items-center justify-center rounded-full"
                  style={{
                    width: 22, height: 22,
                    background: isToday ? C.red : "transparent",
                    color: isToday ? "#fff" : C.iron,
                  }}>{d}</div>
                {items.slice(0, 2).map((o) => (
                  <div key={o.id} className="mt-1 text-[10px] leading-tight font-semibold truncate px-1 py-0.5 rounded"
                    style={{ background: "#FBE9EC", color: C.redDark }}>
                    {o.title}
                  </div>
                ))}
                {items.length > 2 && <div className="text-[10px] mt-0.5" style={{ color: C.faint }}>+{items.length - 2} more</div>}
              </button>
            );
          })}
        </div>
      </div>

      {calSelected && (
        <div className="mt-3 p-4 rounded-lg" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div className="font-semibold mb-2" style={{ fontFamily: SERIF }}>
            Due {new Date(calSelected + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </div>
          {selectedList.length === 0 ? (
            <div className="text-sm" style={{ color: C.iron }}>No deadlines on this date. A quiet day — good time to draft essays.</div>
          ) : selectedList.map((o) => (
            <button key={o.id} onClick={() => openModal(o.id)}
              className="w-full text-left flex items-center gap-2 py-2 hover:opacity-70" style={{ borderBottom: `1px solid ${C.line}` }}>
              <TypeBadge type={o.type} />
              <span className="font-semibold text-sm">{o.title}</span>
              <span className="text-xs" style={{ color: C.iron }}>· {o.organization}</span>
            </button>
          ))}
        </div>
      )}

      {rolling.length > 0 && (
        <div className="mt-4">
          <h3 className="font-semibold mb-2" style={{ fontFamily: SERIF, fontSize: 17, color: C.rolling }}>
            Rolling deadlines — apply any time
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {rolling.map((o) => (
              <button key={o.id} onClick={() => openModal(o.id)}
                className="text-left p-3 rounded-lg hover:shadow-sm transition-shadow"
                style={{ background: C.card, border: `1px solid ${C.line}`, borderLeft: `4px solid ${C.rolling}` }}>
                <div className="font-semibold text-sm">{o.title}</div>
                <div className="text-xs" style={{ color: C.iron }}>{o.organization}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================== TRACKER VIEW ============================== */
function TrackerView({ userData, byId, setTrackerField, removeFromTracker, setNote, openModal, exportJSON, exportCSV, goBrowse }) {
  const [dragId, setDragId] = useState(null);
  const entries = Object.entries(userData.tracker);

  const cardsByStage = useMemo(() => {
    const m = {};
    STAGES.forEach((s) => (m[s] = []));
    entries.forEach(([id, t]) => {
      const stage = STAGES.includes(t.status) ? t.status : "Interested";
      m[stage].push([id, t]);
    });
    return m;
  }, [entries]);

  const oppFor = (id, t) => byId[id] || t.snapshot || { title: "Removed listing", organization: "", deadline: "Rolling", type: "Research" };

  if (entries.length === 0) {
    return (
      <div className="py-16 text-center rounded-lg" style={{ background: C.card, border: `1px dashed ${C.line}` }}>
        <div className="text-2xl mb-2" style={{ fontFamily: SERIF }}>Your tracker is empty</div>
        <div className="text-sm mb-4" style={{ color: C.iron }}>
          Open any opportunity and hit "Add to tracker" to build your application pipeline. Tracked items stick around even after data refreshes.
        </div>
        <button onClick={goBrowse} className="px-4 py-2 rounded font-semibold text-white text-sm" style={{ background: C.red }}>
          Browse opportunities
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 style={{ fontFamily: SERIF, fontSize: 22 }}>Application tracker</h2>
        <span className="text-xs" style={{ color: C.faint }}>Drag cards between columns, or use the status dropdown on mobile.</span>
        <div className="ml-auto flex gap-2">
          <button onClick={exportJSON} className="px-2.5 py-1.5 rounded text-xs font-semibold" style={{ background: C.card, border: `1px solid ${C.line}` }}>Export JSON</button>
          <button onClick={exportCSV} className="px-2.5 py-1.5 rounded text-xs font-semibold" style={{ background: C.card, border: `1px solid ${C.line}` }}>Export CSV</button>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2" style={{ minHeight: 300 }}>
        {STAGES.map((stage) => (
          <div key={stage}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain") || dragId; if (id) setTrackerField(id, "status", stage); setDragId(null); }}
            className="flex-shrink-0 w-64 rounded-lg p-2"
            style={{ background: C.mist, border: `1px solid ${C.line}` }}>
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: stage === "Offer" ? C.ok : stage === "Rejected" ? C.faint : C.iron }}>
                {stage}
              </span>
              <span className="text-xs font-semibold px-1.5 rounded-full" style={{ background: C.card, color: C.iron }}>
                {cardsByStage[stage].length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {cardsByStage[stage].map(([id, t]) => {
                const o = oppFor(id, t);
                return (
                  <div key={id} draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", id); setDragId(id); }}
                    onDragEnd={() => setDragId(null)}
                    className="rounded-lg p-3 cursor-grab active:cursor-grabbing"
                    style={{ background: C.card, border: `1px solid ${C.line}`, opacity: dragId === id ? 0.5 : 1 }}>
                    <button onClick={() => byId[id] && openModal(id)} className="text-left w-full">
                      <div className="font-semibold text-sm leading-snug">{o.title}</div>
                      <div className="text-xs mt-0.5" style={{ color: C.iron }}>{o.organization}</div>
                    </button>
                    <div className="mt-2"><DeadlinePill deadline={o.deadline} /></div>
                    <select value={t.status} onChange={(e) => setTrackerField(id, "status", e.target.value)}
                      className="mt-2 w-full text-xs px-1.5 py-1 rounded" style={{ border: `1px solid ${C.line}` }}>
                      {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <label className="block mt-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: C.faint }}>
                      Date applied
                      <input type="date" value={t.dateApplied || ""}
                        onChange={(e) => setTrackerField(id, "dateApplied", e.target.value)}
                        className="mt-0.5 w-full text-xs px-1.5 py-1 rounded font-normal" style={{ border: `1px solid ${C.line}` }} />
                    </label>
                    <textarea value={userData.notes[id] || ""} onChange={(e) => setNote(id, e.target.value)}
                      placeholder="Note…" rows={2}
                      className="mt-2 w-full text-xs px-1.5 py-1 rounded outline-none" style={{ border: `1px solid ${C.line}`, background: C.paper }} />
                    <button onClick={() => removeFromTracker(id)} className="mt-1.5 text-[11px] font-semibold underline" style={{ color: C.faint }}>
                      Remove from tracker
                    </button>
                  </div>
                );
              })}
              {cardsByStage[stage].length === 0 && (
                <div className="text-xs text-center py-6 rounded" style={{ color: C.faint, border: `1px dashed ${C.line}` }}>
                  Drop a card here
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================= DASHBOARD VIEW ============================= */
function DashboardView({ opportunities, userData, openModal }) {
  const typeCounts = TYPES.map((t) => ({ name: t, count: opportunities.filter((o) => o.type === t).length }));
  const stageCounts = STAGES.map((s) => ({
    name: s, count: Object.values(userData.tracker).filter((t) => (STAGES.includes(t.status) ? t.status : "Interested") === s).length,
  }));
  const week = opportunities.filter((o) => { const d = daysUntil(o.deadline); return d != null && d >= 0 && d <= 7; })
    .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline));
  const month = opportunities.filter((o) => { const d = daysUntil(o.deadline); return d != null && d > 7 && d <= 30; })
    .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline));

  const stat = (label, value, accent) => (
    <div className="rounded-lg p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="text-3xl font-bold" style={{ fontFamily: SERIF, color: accent || C.ink }}>{value}</div>
      <div className="text-xs mt-1 uppercase tracking-wider font-semibold" style={{ color: C.faint }}>{label}</div>
    </div>
  );

  const typeColors = ["#2E6B45", "#3A5A8C", "#8A5A17", "#6B4A8E", "#8E3A5F"];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stat("Opportunities", opportunities.length)}
        {stat("Saved ★", userData.saved.length, "#B78A00")}
        {stat("In tracker", Object.keys(userData.tracker).length, C.rolling)}
        {stat("Due this week", week.length, C.red)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-lg p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div className="font-semibold mb-3" style={{ fontFamily: SERIF }}>Opportunities by type</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeCounts} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.iron }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.iron }} />
                <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {typeCounts.map((_, i) => <Cell key={i} fill={typeColors[i % typeColors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div className="font-semibold mb-3" style={{ fontFamily: SERIF }}>Application funnel</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageCounts} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: C.iron }} />
                <YAxis type="category" dataKey="name" width={82} tick={{ fontSize: 11, fill: C.iron }} />
                <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Bar dataKey="count" fill={C.red} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <DeadlineList title="Deadlines this week" items={week} empty="Nothing due in the next 7 days. Breathe." openModal={openModal} urgent />
        <DeadlineList title="Deadlines this month" items={month} empty="No deadlines between 1 and 4 weeks out." openModal={openModal} />
      </div>
    </div>
  );
}

function DeadlineList({ title, items, empty, openModal, urgent }) {
  return (
    <div className="rounded-lg p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="font-semibold mb-2" style={{ fontFamily: SERIF, color: urgent ? C.red : C.ink }}>{title}</div>
      {items.length === 0 ? (
        <div className="text-sm py-4" style={{ color: C.faint }}>{empty}</div>
      ) : items.map((o) => (
        <button key={o.id} onClick={() => openModal(o.id)}
          className="w-full flex items-center gap-2 py-2 text-left hover:opacity-70" style={{ borderBottom: `1px solid ${C.line}` }}>
          <span className="text-sm font-semibold flex-1">{o.title}</span>
          <DeadlinePill deadline={o.deadline} />
        </button>
      ))}
    </div>
  );
}
