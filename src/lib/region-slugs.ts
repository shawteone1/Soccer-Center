/** Shared aliases: old tryout links/imports used cal-*, the directory uses california-*. */
export function canonicalRegionSlug(value: string): string {
  const slug = value.trim().toLowerCase();
  return ({ 'cal-south': 'california-south', 'cal-north': 'california-north' } as Record<string, string>)[slug] ?? slug;
}
export function regionSlugAliases(value: string): string[] {
  const canonical = canonicalRegionSlug(value);
  if (canonical === 'california-south') return [canonical, 'cal-south'];
  if (canonical === 'california-north') return [canonical, 'cal-north'];
  return [canonical];
}
