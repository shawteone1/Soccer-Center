import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MonthView, WeekView } from './CalendarViews';
import { calendarDate, calendarTime } from '@/lib/portal/calendar-display';
const event = { id: '1', title: 'United vs Storm', startAt: '2026-11-03T01:30:00Z', allDay: false, playerId: 'demo', playerName: 'Jordan', eventType: 'game' };
const props = { events: [event], anchor: new Date(2026, 10, 2), onPrev: vi.fn(), onNext: vi.fn(), onEventClick: vi.fn(), colorMap: new Map([['demo', '#d97706']]) };
describe('calendar date presentation', () => {
  it('groups an evening UTC timestamp into the correct Denver day', () => {
    expect(calendarDate(event.startAt)).toBe('2026-11-02');
    expect(calendarTime(event.startAt)).toBe('6:30 PM');
  });
  it('preserves all-day dates and handles both offsets across daylight-saving change', () => {
    expect(calendarDate('2026-11-03T00:00:00Z', true)).toBe('2026-11-03');
    expect(calendarTime('2026-11-01T07:30:00Z')).toBe('1:30 AM');
    expect(calendarTime('2026-11-01T08:30:00Z')).toBe('1:30 AM');
  });
  it('does not invent a timezone for source wall times', () => {
    expect(calendarTime('2026-11-02T18:30:00')).toBe('18:30 (source time)');
  });
});
describe('calendar interactions', () => {
  it('shows full title, player, Denver time and forwards the original event', () => {
    render(<MonthView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Monday, November 2: 1 events' }));
    const agenda = screen.getByRole('region', { name: 'Selected day events' });
    fireEvent.click(within(agenda).getByRole('button', { name: '6:30 PM · United vs Storm · Jordan' }));
    expect(props.onEventClick).toHaveBeenCalledWith(event);
  });
  it('makes overflow events available through a real button', () => {
    render(<MonthView {...props} events={[event, {...event, id:'2', title:'Second match'}, {...event, id:'3', title:'Third match'}]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 3 events for Monday, November 2' }));
    expect(within(screen.getByRole('region', { name: 'Selected day events' })).getAllByRole('button')).toHaveLength(3);
  });
  it('week view uses full event details and preserves navigation', () => {
    render(<WeekView {...props} />);
    expect(screen.getByRole('button', { name: '6:30 PM · United vs Storm · Jordan' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(props.onNext).toHaveBeenCalled();
  });
});
