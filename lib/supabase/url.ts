export function normalizeSupabaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  return withoutTrailingSlash.replace(/\/rest\/v1$/i, "");
}
