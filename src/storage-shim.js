/*
 * Storage layer for the app's `window.storage` API (async, { key, value } records).
 *
 * Locally it is backed by localStorage, and it can optionally sync every key
 * to a private GitHub Gist so your data follows you across browsers/devices:
 *
 *   window.storage.sync.configure(token)  — connect with a GitHub token ("gist" scope)
 *   window.storage.sync.disconnect()      — stop syncing (local data and the gist are kept)
 *   window.storage.sync.syncNow()         — manual two-way sync
 *   window.storage.sync.getStatus()       — { enabled, syncing, lastSyncAt, error, gistUrl, account }
 *   window.storage.ready                  — resolves once the initial pull has finished
 *
 * Sync model: one JSON file in a secret gist holds every key with a per-key
 * timestamp; merges are last-write-wins per key, with deletions kept as
 * tombstones so they propagate. Connecting a device to an already-existing
 * sync gist adopts the cloud copy for keys present there.
 *
 * Events on window:
 *   "hub-sync-status"         detail = status object (fires on any status change)
 *   "hub-sync-remote-change"  detail = { keys } (fires when a pull changed local data)
 *
 * In the artifact runtime window.storage already exists; this file then does nothing.
 */
const PREFIX = "cmu-opportunity-hub:";
const SYNC_CONFIG_KEY = "cmu-opportunity-hub-sync:config"; // { token, gistId, gistUrl, account } — per device, never synced
const SYNC_META_KEY = "cmu-opportunity-hub-sync:meta";     // { [key]: updatedAt } for last-write-wins merges
const GIST_FILENAME = "cmu-opportunity-hub-sync.json";
const GIST_DESCRIPTION = "CMU CS Opportunity Hub sync data (managed by the app)";
const API_ROOT = "https://api.github.com";
const PUSH_DEBOUNCE_MS = 2500;
const PULL_INTERVAL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;

if (!window.storage) {
  const loadJson = (k, fallback) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  };

  const meta = loadJson(SYNC_META_KEY, {});
  const saveMeta = () => localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
  let config = loadJson(SYNC_CONFIG_KEY, null);
  const saveConfig = () => {
    if (config) localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
    else localStorage.removeItem(SYNC_CONFIG_KEY);
  };

  const status = {
    enabled: !!(config && config.token),
    syncing: false,
    lastSyncAt: null,
    error: null,
    gistUrl: (config && config.gistUrl) || null,
    account: (config && config.account) || null,
  };
  const emitStatus = () => window.dispatchEvent(new CustomEvent("hub-sync-status", { detail: { ...status } }));

  const dirty = new Set();
  let pushTimer = null;
  let pullTimer = null;
  let syncQueued = false;

  function localKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k.slice(PREFIX.length));
    }
    return keys;
  }

  /* ----------------------------- GitHub API ------------------------------ */
  async function gh(path, opts = {}) {
    if (!config || !config.token) throw new Error("Sync is not configured");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(API_ROOT + path, {
        ...opts,
        signal: ctrl.signal,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer " + config.token,
          ...(opts.body ? { "Content-Type": "application/json" } : {}),
        },
      });
      if (res.status === 401) {
        throw new Error("GitHub rejected the token — it may have expired. Disconnect and reconnect with a fresh token.");
      }
      return res;
    } catch (e) {
      if (e.name === "AbortError") throw new Error("GitHub request timed out");
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  // Returns the { keys } payload, or null when the gist no longer exists.
  async function readGist() {
    const res = await gh("/gists/" + config.gistId);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("GitHub API error " + res.status);
    const gist = await res.json();
    const file = gist.files && gist.files[GIST_FILENAME];
    if (!file) return { keys: {} };
    let content = file.content;
    if (file.truncated) {
      // Inline content is capped at 1MB; the raw URL serves the full file.
      const raw = await fetch(file.raw_url);
      if (!raw.ok) throw new Error("Could not download sync data (" + raw.status + ")");
      content = await raw.text();
    }
    try {
      const data = JSON.parse(content);
      return data && typeof data === "object" && data.keys ? data : { keys: {} };
    } catch (e) { return { keys: {} }; }
  }

  function buildPayload() {
    const keys = {};
    for (const key of localKeys()) {
      keys[key] = { value: localStorage.getItem(PREFIX + key), updatedAt: meta[key] || 0 };
    }
    for (const key of Object.keys(meta)) {
      if (!(key in keys)) keys[key] = { value: null, updatedAt: meta[key] }; // deleted here — tombstone
    }
    return { app: "cmu-opportunity-hub", version: 1, keys };
  }

  // Merge remote into local. Newest-wins per key; `force` makes every remote
  // key win (used for the first sync after attaching to an existing gist).
  // Returns the keys whose local value actually changed.
  function applyRemote(remote, force) {
    const changed = [];
    for (const [key, rec] of Object.entries(remote.keys || {})) {
      if (!rec || typeof rec.updatedAt !== "number") continue;
      if (!force && (meta[key] || 0) >= rec.updatedAt) continue;
      const current = localStorage.getItem(PREFIX + key);
      if (rec.value == null) localStorage.removeItem(PREFIX + key);
      else localStorage.setItem(PREFIX + key, rec.value);
      meta[key] = rec.updatedAt;
      if (current !== rec.value) changed.push(key);
    }
    saveMeta();
    return changed;
  }

  function needsPush(remote) {
    const local = buildPayload().keys;
    const rkeys = remote.keys || {};
    const names = new Set([...Object.keys(local), ...Object.keys(rkeys)]);
    for (const k of names) {
      const l = local[k], r = rkeys[k];
      if (!l || !r || l.value !== r.value || l.updatedAt !== r.updatedAt) return true;
    }
    return false;
  }

  async function createGist() {
    const res = await gh("/gists", {
      method: "POST",
      body: JSON.stringify({
        description: GIST_DESCRIPTION,
        public: false,
        files: { [GIST_FILENAME]: { content: JSON.stringify(buildPayload(), null, 1) } },
      }),
    });
    if (!res.ok) throw new Error("Could not create the sync gist (" + res.status + ")");
    const gist = await res.json();
    config.gistId = gist.id;
    config.gistUrl = gist.html_url;
    saveConfig();
    status.gistUrl = gist.html_url;
  }

  // Full two-way sync: pull + merge, then push if anything local is newer.
  // Never rejects — failures land in status.error.
  async function syncNow(options = {}) {
    if (!config || !config.token) return;
    if (status.syncing) { syncQueued = true; return; }
    status.syncing = true;
    status.error = null;
    emitStatus();
    try {
      let remote = null;
      if (config.gistId) {
        remote = await readGist();
        if (remote === null) {
          // Gist was deleted out from under us — recreate it below.
          config.gistId = null;
          config.gistUrl = null;
          status.gistUrl = null;
          saveConfig();
        }
      }
      if (remote) {
        const changed = applyRemote(remote, options.preferRemote);
        if (changed.length) {
          window.dispatchEvent(new CustomEvent("hub-sync-remote-change", { detail: { keys: changed } }));
        }
      }
      if (!config.gistId) {
        await createGist();
      } else if (dirty.size || !remote || needsPush(remote)) {
        const res = await gh("/gists/" + config.gistId, {
          method: "PATCH",
          body: JSON.stringify({ files: { [GIST_FILENAME]: { content: JSON.stringify(buildPayload(), null, 1) } } }),
        });
        if (!res.ok) throw new Error("GitHub API error " + res.status + " while saving");
      }
      dirty.clear();
      status.lastSyncAt = Date.now();
    } catch (e) {
      status.error = (e && e.message) || String(e);
    } finally {
      status.syncing = false;
      emitStatus();
      if (syncQueued) { syncQueued = false; schedulePush(500); }
    }
  }

  function schedulePush(delay = PUSH_DEBOUNCE_MS) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => syncNow(), delay);
  }

  /* --------------------------- background timers -------------------------- */
  const onFocus = () => {
    if (status.lastSyncAt && Date.now() - status.lastSyncAt < 30000) return;
    syncNow();
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      // Tab going away — flush any pending changes right now.
      if (dirty.size) { clearTimeout(pushTimer); syncNow(); }
    } else {
      onFocus();
    }
  };
  function startTimers() {
    stopTimers();
    pullTimer = setInterval(() => syncNow(), PULL_INTERVAL_MS);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
  }
  function stopTimers() {
    clearInterval(pullTimer);
    clearTimeout(pushTimer);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
  }

  /* ------------------------------ public API ------------------------------ */
  async function configure(token) {
    token = String(token || "").trim();
    if (!token) throw new Error("Paste a GitHub token first.");
    const probe = await fetch(API_ROOT + "/user", {
      headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + token },
    });
    if (probe.status === 401) throw new Error('GitHub rejected that token. Create a classic token with only the "gist" scope.');
    if (!probe.ok) throw new Error("Could not reach GitHub (" + probe.status + ")");
    const user = await probe.json();
    config = { token, gistId: null, gistUrl: null, account: user.login || null };

    // Attach to an existing sync gist if one exists, so a second device
    // joins the same data instead of forking it.
    let foundExisting = false;
    for (let page = 1; page <= 3; page++) {
      const res = await gh("/gists?per_page=100&page=" + page);
      if (!res.ok) break;
      const gists = await res.json();
      const hit = gists.find((g) => g.files && g.files[GIST_FILENAME]);
      if (hit) {
        config.gistId = hit.id;
        config.gistUrl = hit.html_url;
        foundExisting = true;
        break;
      }
      if (gists.length < 100) break;
    }
    saveConfig();
    status.enabled = true;
    status.account = config.account;
    status.gistUrl = config.gistUrl;
    status.error = null;
    emitStatus();

    await syncNow({ preferRemote: foundExisting });
    if (status.error) {
      const msg = status.error;
      disconnect();
      throw new Error(msg);
    }
    startTimers();
  }

  function disconnect() {
    config = null;
    saveConfig();
    stopTimers();
    dirty.clear();
    status.enabled = false;
    status.syncing = false;
    status.error = null;
    status.gistUrl = null;
    status.account = null;
    status.lastSyncAt = null;
    emitStatus();
  }

  window.storage = {
    async get(key) {
      const value = localStorage.getItem(PREFIX + key);
      return value == null ? null : { key, value };
    },
    async set(key, value) {
      const prev = localStorage.getItem(PREFIX + key);
      localStorage.setItem(PREFIX + key, value);
      if (prev !== value) {
        meta[key] = Date.now();
        saveMeta();
        if (status.enabled) { dirty.add(key); schedulePush(); }
      }
      return { key, value };
    },
    async delete(key) {
      if (localStorage.getItem(PREFIX + key) != null) {
        localStorage.removeItem(PREFIX + key);
        meta[key] = Date.now();
        saveMeta();
        if (status.enabled) { dirty.add(key); schedulePush(); }
      }
      return { key, deleted: true };
    },
    sync: { configure, disconnect, syncNow: () => syncNow(), getStatus: () => ({ ...status }) },
    ready: Promise.resolve(),
  };

  if (status.enabled) {
    startTimers();
    window.storage.ready = syncNow();
  }
}
