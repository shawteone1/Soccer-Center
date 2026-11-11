import { it, expect } from 'vitest';
import { canonicalRegionSlug, regionSlugAliases } from './region-slugs';
it.each([
  ['cal-south', 'california-south'], ['california-south', 'california-south'],
  ['cal-north', 'california-north'], ['california-north', 'california-north'],
  [' Colorado ', 'colorado'], ['arizona', 'arizona'], ['oregon', 'oregon'],
  ['washington', 'washington'], ['nevada', 'nevada'],
])('normalizes %s without conflating regions', (input, expected) => {
  expect(canonicalRegionSlug(input)).toBe(expected);
  expect(regionSlugAliases(input)).toContain(expected);
});
