export const COACH_CARD_STYLES = ['classic', 'trading', 'editorial'] as const;
export type CoachCardStyle = typeof COACH_CARD_STYLES[number];
export function coachCardStyle(value: unknown): CoachCardStyle {
  return value === 'trading' || value === 'editorial' ? value : 'classic';
}
/** Presentation travels with the copied link; never changes its token or permissions. */
export function styledCoachUrl(url: string, style: CoachCardStyle): string {
  const parsed = new URL(url, 'https://soccercenter.org');
  if (style === 'classic') parsed.searchParams.delete('style');
  else parsed.searchParams.set('style', style);
  return /^https?:\/\//.test(url) ? parsed.toString() : `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
