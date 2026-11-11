/** Calendar-only presentation helpers. Stored timestamps and feed parsing are unchanged. */
export const CALENDAR_ZONE = 'America/Denver';
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CALENDAR_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
export function calendarDate(startAt: string, allDay = false): string {
  // All-day dates are calendar dates, not instants: never shift them across zones.
  if (allDay || /^\d{4}-\d{2}-\d{2}$/.test(startAt)) return startAt.slice(0, 10);
  // A timestamp without a zone has no unambiguous instant. Preserve its wall date.
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(startAt)) return startAt.slice(0, 10);
  const date = new Date(startAt);
  if (Number.isNaN(date.valueOf())) return '';
  const parts = dayFormatter.formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)?.value).join('-');
}
export function calendarTime(startAt: string, allDay = false): string {
  if (allDay || startAt.length === 10) return 'All day';
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(startAt)) return `${startAt.slice(11, 16)} (source time)`;
  const date = new Date(startAt);
  if (Number.isNaN(date.valueOf())) return 'Time unavailable';
  return date.toLocaleTimeString('en-US', { timeZone: CALENDAR_ZONE, hour: 'numeric', minute: '2-digit' });
}
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
