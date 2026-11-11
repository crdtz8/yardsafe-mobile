// Asset-tag matching for tool scanning. Barcode readers and people enter tags
// slightly differently (spaces, upper/lower case), so tags are compared in a
// normalized form. The database's unique-tag rule uses the same normalization
// (see pss-safety-training/supabase/migrations/071_tools_asset_tag_unique.sql).

/** "rcg 0142 " → "RCG0142" */
export const normalizeTag = (s?: string | null): string =>
  (s ?? '').trim().replace(/\s+/g, '').toUpperCase();

/** The tool whose asset tag matches a scanned/typed value, or null. */
export function findToolByTag<T extends { asset_tag: string | null }>(tools: T[], scanned: string): T | null {
  const key = normalizeTag(scanned);
  if (!key) return null;
  return tools.find(t => normalizeTag(t.asset_tag) === key) ?? null;
}
