function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export function getOpportunityIdentity(opportunity) {
  if (!opportunity || typeof opportunity !== "object") return null;

  const rawId = typeof opportunity.id === "string" ? opportunity.id.trim() : "";
  if (rawId) return `id:${rawId.toLowerCase()}`;

  const title = normalizeText(opportunity.title);
  const organization = normalizeText(opportunity.organization);
  const type = normalizeText(opportunity.type);
  const deadline = normalizeText(opportunity.deadline);
  const location = normalizeText(opportunity.location);
  const applyUrl = normalizeText(opportunity.applyUrl);

  return `meta:${title}::${organization}::${type}::${deadline}::${location}::${applyUrl}`;
}

export function dedupeOpportunityList(items) {
  const deduped = [];
  const seen = new Set();

  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== "object") continue;
    const key = getOpportunityIdentity(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export function mergeUniqueOpportunities(existingItems = [], incomingItems = [], fetchedAt = null) {
  const merged = [];
  const seen = new Set();
  const additions = [];

  for (const item of dedupeOpportunityList(existingItems)) {
    const key = getOpportunityIdentity(item);
    if (!key) continue;
    seen.add(key);
    merged.push(item);
  }

  for (const item of Array.isArray(incomingItems) ? incomingItems : []) {
    if (!item || typeof item !== "object") continue;
    const key = getOpportunityIdentity(item);
    if (!key || seen.has(key)) continue;

    const nextItem = { ...item };
    if (fetchedAt != null) nextItem.fetchedAt = fetchedAt;

    seen.add(key);
    additions.push(nextItem);
    merged.push(nextItem);
  }

  return { merged, additions };
}
