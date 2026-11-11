/**
 * Static option lists for parent/player profile forms.
 *
 * These are configuration constants — not user-visible inline-editable copy —
 * so they live here as plain TS rather than in virtual:content.
 * The parent-portal.json content file still owns the same values for the
 * existing parent-portal.tsx page; this file is the shared source for
 * components that cannot import virtual:content directly.
 */

export const PLAYER_POSITIONS = [
  'Goalkeeper',
  'Defender',
  'Midfielder',
  'Forward',
  'Winger',
  'Striker',
  'Center Back',
  'Full Back',
] as const;

export const SKILL_LEVELS = [
  { value: 'beginner',     label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced',     label: 'Advanced' },
] as const;

export const TRAINING_MODES = [
  { value: 'solo',    label: 'Solo' },
  { value: 'partner', label: 'Partner' },
  { value: 'team',    label: 'Team' },
  { value: 'any',     label: 'Any' },
] as const;

export const FOCUS_AREAS = [
  'Dribbling',
  'Passing',
  'Shooting',
  'Defending',
  'Fitness',
  'First Touch',
  'Set Pieces',
  'Goalkeeping',
] as const;

export const SESSION_LENGTHS = ['15 min', '30 min', '45 min', '60 min', '90 min'] as const;

export const FREQUENCIES = [
  'Once a week',
  '2–3 times a week',
  'Daily',
  'As needed',
] as const;

export const DEVELOPMENT_INTERESTS = [
  'Defending',
  'Attacking',
  'Midfield',
  'Goalkeeping',
  'Fitness',
  'Set Pieces',
  'Dribbling',
  'Passing',
] as const;

export const AGE_BANDS = [
  'U6','U7','U8','U9','U10','U11','U12',
  'U13','U14','U15','U16','U17','U18','U19',
] as const;

export const SEASONS = ['2025–26', '2026–27', '2027–28', '2028–29'] as const;

export const COLORADO_REGIONS = [
  { slug: 'colorado',         label: 'All Colorado' },
  { slug: 'denver-metro',     label: 'Denver Metro' },
  { slug: 'boulder',          label: 'Boulder' },
  { slug: 'colorado-springs', label: 'Colorado Springs' },
  { slug: 'fort-collins',     label: 'Fort Collins' },
  { slug: 'pueblo',           label: 'Pueblo' },
  { slug: 'western-slope',    label: 'Western Slope' },
] as const;
