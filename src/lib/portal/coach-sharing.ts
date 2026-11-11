/** Shared consent mapping for owner previews and token-scoped coach responses.
 * Callers must first scope media, events and match rows to selected, owned IDs.
 * Unknown keys and internal flat database fields are never exposed.
 */
const FIELD_OUTPUTS: Record<string, readonly string[]> = {
  label: ['label'], ageBand: ['ageBand'], graduationYear: ['graduationYear'],
  photo: ['avatarUrl'], avatarInitials: ['avatarInitials'],
  primaryPosition: ['primaryPosition'], secondaryPosition: ['secondaryPosition'],
  foot: ['foot'], positions: ['positions'], skillLevel: ['skillLevel'],
  clubName: ['clubName'], affiliations: ['affiliations'], playingLevel: ['playingLevel'],
  profileIntroduction: ['profileIntroduction'], achievements: ['achievements'],
  collegeGoals: ['collegeGoals'], academics: ['academics', 'ukEducation'], contactEmail: ['contactEmail'],
  highSchool: ['highSchool', 'schoolCity', 'schoolState'],
  stats: ['stats', 'statsTableAvailable', 'approvedMatchRecordCount'],
  highlights: ['highlights'], upcomingEvents: ['upcomingEvents'],
};

export function filterCoachProfile<T extends object>(profile: T, fields: Iterable<string>): Partial<T> {
  const source = profile as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    for (const key of (Object.prototype.hasOwnProperty.call(FIELD_OUTPUTS, field) ? FIELD_OUTPUTS[field] : []) ?? []) {
      if (Object.prototype.hasOwnProperty.call(source, key)) result[key] = source[key];
    }
  }
  if ('mediaOriginProtected' in source) result.mediaOriginProtected = source.mediaOriginProtected;
  return result as Partial<T>;
}

/** Explicit empty selections are significant: never omit these query keys. */
export function coachPreviewParams(fields: Iterable<string>, matches: Iterable<string>, media: Iterable<string>, events: Iterable<string>) {
  return new URLSearchParams({
    approvedFields: Array.from(fields).join(','),
    matchIds: Array.from(matches).join(','),
    selectedMedia: Array.from(media).join(','),
    selectedEvents: Array.from(events).join(','),
  });
}
