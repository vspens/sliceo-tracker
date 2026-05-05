export function normalizeUtmValue(value: string | null | undefined, fallback = "") {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");

  return normalized || fallback;
}

export function isLikelyBot(userAgent: string | null | undefined) {
  const ua = (userAgent ?? "").toLowerCase();
  return /(bot|spider|crawler|headless|preview|slurp|bingpreview)/.test(ua);
}
