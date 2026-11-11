/**
 * src/server/lib/coach-profile-fields.ts
 *
 * Single source of truth for the coach profile field contract.
 *
 * This module is imported by:
 *   - POST /api/parent/players/:playerId/coach-links  (server validation)
 *   - GET  /api/coach/profile/:token                  (field filter)
 *   - GET  /api/parent/players/:playerId/coach-fields  (UI field list)
 *
 * Field keys are the exact keys of CoachProjection from coach-projection.ts.
 * The UI label is what the parent sees when selecting fields.
 *
 * CANONICAL CONTRACT: "label" is the player's display name in the projection.
 * "name" is NOT a valid field key anywhere in this stack.
 */

export interface CoachProfileFieldDef {
  /** Exact key in CoachProjection */
  key: string;
  /** Human-readable label shown to the parent */
  label: string;
  /** Short description of what the coach will see */
  description: string;
  /** Whether this field is always recommended */
  recommended: boolean;
  /** Field group for UI grouping */
  group: 'identity' | 'positions' | 'club' | 'profile' | 'stats';
}

export const COACH_PROFILE_FIELDS: CoachProfileFieldDef[] = [
  // ── Identity ──────────────────────────────────────────────────────────────
  { key: 'label',           label: 'Player name',        description: 'First and last name',                             recommended: true,  group: 'identity' },
  { key: 'ageBand',         label: 'Age group',          description: 'Age band (e.g. U17)',                             recommended: true,  group: 'identity' },
  { key: 'graduationYear',  label: 'Graduation year',    description: 'Expected high school graduation year',            recommended: true,  group: 'identity' },
  { key: 'photo',           label: 'Player photo',       description: 'Profile photo shown on the coach card',          recommended: true,  group: 'identity' },
  { key: 'avatarInitials',  label: 'Avatar initials',    description: 'Initials shown when no photo is available',       recommended: false, group: 'identity' },
  // ── Positions ─────────────────────────────────────────────────────────────
  { key: 'primaryPosition',   label: 'Primary position',   description: 'Main playing position',                         recommended: true,  group: 'positions' },
  { key: 'secondaryPosition', label: 'Secondary position', description: 'Secondary playing position',                    recommended: false, group: 'positions' },
  { key: 'foot',              label: 'Dominant foot',      description: 'Left, right, or both',                          recommended: true,  group: 'positions' },
  { key: 'positions',         label: 'All positions',      description: 'Full list of positions played',                 recommended: false, group: 'positions' },
  { key: 'skillLevel',        label: 'Skill level',        description: 'Self-assessed skill level',                     recommended: false, group: 'positions' },
  // ── Club ──────────────────────────────────────────────────────────────────
  { key: 'clubName',      label: 'Club name',     description: 'Current club',                                           recommended: true,  group: 'club' },
  { key: 'affiliations',  label: 'Club history',  description: 'Past and current club affiliations',                    recommended: false, group: 'club' },
  { key: 'playingLevel',  label: 'Playing level', description: 'Competitive level (e.g. ECNL, NPL)',                    recommended: true,  group: 'club' },
  // ── Profile ───────────────────────────────────────────────────────────────
  { key: 'profileIntroduction', label: 'Player introduction', description: 'Short bio written by the parent',                    recommended: false, group: 'profile' },
  { key: 'achievements',        label: 'Achievements',        description: 'Notable achievements and honors',                     recommended: false, group: 'profile' },
  { key: 'collegeGoals',        label: 'College goals',       description: 'Academic and soccer aspirations',                     recommended: true,  group: 'profile' },
  { key: 'academics',           label: 'Academics',           description: 'GPA or UK exam results and intended major',           recommended: true,  group: 'profile' },
  { key: 'contactEmail',        label: 'Contact destination', description: 'Email address coaches use to reach the family',       recommended: true,  group: 'profile' },
  { key: 'highSchool',          label: 'High school',         description: 'School name and city/state',                                recommended: false, group: 'profile' },
  { key: 'highlights', label: 'Highlights', description: 'Only the videos you select in the next steps', recommended: false, group: 'profile' },
  { key: 'upcomingEvents', label: 'Upcoming events', description: 'Only the events you select in the next steps', recommended: true, group: 'profile' },
  // ── Stats ─────────────────────────────────────────────────────────────────
  { key: 'stats', label: 'Match statistics', description: 'Aggregated stats from selected match records', recommended: false, group: 'stats' },
];

/** Set of valid field keys — O(1) validation */
export const APPROVED_FIELDS_ALLOWLIST = new Set(
  COACH_PROFILE_FIELDS.map(f => f.key),
);

/** Fields always included in the coach view regardless of approvedFields */
export const ALWAYS_INCLUDED_FIELDS = new Set([
  'mediaOriginProtected',
  'statsTableAvailable',
  'approvedMatchRecordCount',
]);

/**
 * Validate an approvedFields array against the allowlist.
 * Returns the list of invalid field keys (empty = all valid).
 */
export function validateApprovedFields(fields: unknown): {
  valid: boolean;
  invalidFields: string[];
  error?: string;
} {
  if (!Array.isArray(fields)) {
    return { valid: false, invalidFields: [], error: 'approvedFields must be an array' };
  }
  if (fields.length === 0) {
    return { valid: false, invalidFields: [], error: 'approvedFields must not be empty' };
  }
  const invalid = (fields as unknown[]).filter(
    f => typeof f !== 'string' || !APPROVED_FIELDS_ALLOWLIST.has(f as string),
  );
  if (invalid.length > 0) {
    return {
      valid: false,
      invalidFields: invalid.map(f => String(f)),
      error: `Unknown field(s): ${invalid.map(f => String(f)).join(', ')}`,
    };
  }
  return { valid: true, invalidFields: [] };
}
