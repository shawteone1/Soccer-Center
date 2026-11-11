import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { calendarDate, calendarTime, localDateKey } from '@/lib/portal/calendar-display';
import '@/styles/portal-calendar.css';

export interface CalendarDisplayEvent {
  id: string; title: string; startAt: string; allDay: boolean;
  playerId: string | null; playerName: string | null; eventType: string;
  location?: string | null;
}
interface ViewProps<T extends CalendarDisplayEvent> {
  events: T[]; anchor: Date; onPrev: () => void; onNext: () => void;
  onEventClick: (event: T) => void; colorMap: Map<string | null, string>;
}
function EventButton<T extends CalendarDisplayEvent>({ event, onClick, color }: {
  event: T; onClick: (event: T) => void; color?: string;
}) {
  return <button type="button" className="pp-cal-event" onClick={() => onClick(event)}
    title={`${event.title}${event.playerName ? ` · ${event.playerName}` : ''}`}
    style={{ borderLeftColor: color ?? '#23476b' }}
    aria-label={`${calendarTime(event.startAt, event.allDay)} · ${event.title}${event.playerName ? ` · ${event.playerName}` : ''}`}>
    <span className="pp-cal-time">{calendarTime(event.startAt, event.allDay)}</span>
    <strong>{event.title}</strong>
    {event.playerName && <span className="pp-cal-player">{event.playerName}</span>}
  </button>;
}
function Toolbar({ label, unit, onPrev, onNext }: { label: string; unit: string; onPrev: () => void; onNext: () => void }) {
  return <div className="pp-cal-toolbar">
    <button type="button" onClick={onPrev} aria-label={`Previous ${unit}`}><ChevronLeft size={20} /></button>
    <div><strong aria-live="polite">{label}</strong><small>Times shown in America/Denver</small></div>
    <button type="button" onClick={onNext} aria-label={`Next ${unit}`}><ChevronRight size={20} /></button>
  </div>;
}
function dateLabel(key: string) {
  return new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
export function MonthView<T extends CalendarDisplayEvent>({ events, anchor, onPrev, onNext, onEventClick, colorMap }: ViewProps<T>) {
  const year = anchor.getFullYear(), month = anchor.getMonth();
  const today = calendarDate(new Date().toISOString());
  const monthKey = localDateKey(new Date(year, month, 1)).slice(0, 7);
  const [picked, setPicked] = useState('');
  const selected = picked.startsWith(monthKey) ? picked : today.startsWith(monthKey) ? today : `${monthKey}-01`;
  const first = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((first + count) / 7) * 7 }, (_, i) => i >= first && i < first + count ? i - first + 1 : null);
  const byDate = new Map<string, T[]>();
  for (const event of [...events].sort((a, b) => a.startAt.localeCompare(b.startAt))) {
    const key = calendarDate(event.startAt, event.allDay);
    byDate.set(key, [...(byDate.get(key) ?? []), event]);
  }
  const selectedEvents = byDate.get(selected) ?? [];
  return <section className="pp-calendar" aria-label="Monthly calendar">
    <Toolbar label={anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} unit="month" onPrev={onPrev} onNext={onNext} />
    <div className="pp-cal-weekdays" aria-hidden="true">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <span key={d}>{d}</span>)}</div>
    <div className="pp-cal-month">
      {cells.map((day, i) => {
        if (!day) return <div key={i} className="pp-cal-empty" />;
        const key = `${monthKey}-${String(day).padStart(2, '0')}`;
        const dayEvents = byDate.get(key) ?? [];
        return <div key={i} className={`pp-cal-day${key === today ? ' is-today' : ''}${key === selected ? ' is-selected' : ''}`}>
          <button type="button" className="pp-cal-day-select" onClick={() => setPicked(key)} aria-pressed={selected === key}
            aria-current={key === today ? 'date' : undefined} aria-label={`${dateLabel(key)}: ${dayEvents.length} events`}>
            <span>{day}</span><small className="pp-cal-mobile-count">{dayEvents.length ? `${dayEvents.length} evt` : ''}</small>
          </button>
          <div className="pp-cal-month-events">
            {dayEvents.slice(0, 2).map((event, index) => <EventButton key={`${event.id}-${event.playerId}-${index}`} event={event} onClick={onEventClick} color={colorMap.get(event.playerId)} />)}
            {dayEvents.length > 2 && <button className="pp-cal-more" type="button" onClick={() => setPicked(key)} aria-label={`Show all ${dayEvents.length} events for ${dateLabel(key)}`}>+{dayEvents.length - 2} more</button>}
          </div>
        </div>;
      })}
    </div>
    <section className="pp-cal-day-agenda" aria-label="Selected day events" aria-live="polite">
      <h3>{dateLabel(selected)} <span>· {selectedEvents.length} {selectedEvents.length === 1 ? 'event' : 'events'}</span></h3>
      {selectedEvents.length ? selectedEvents.map((event, index) => <EventButton key={`${event.id}-${event.playerId}-${index}`} event={event} onClick={onEventClick} color={colorMap.get(event.playerId)} />) : <p>No events for this day.</p>}
    </section>
  </section>;
}
export function WeekView<T extends CalendarDisplayEvent>({ events, anchor, onPrev, onNext, onEventClick, colorMap }: ViewProps<T>) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - anchor.getDay());
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const today = calendarDate(new Date().toISOString());
  return <section className="pp-calendar" aria-label="Weekly calendar">
    <Toolbar label={`${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`} unit="week" onPrev={onPrev} onNext={onNext} />
    <div className="pp-cal-week">{days.map(day => {
      const key = localDateKey(day);
      const dayEvents = events.filter(e => calendarDate(e.startAt, e.allDay) === key).sort((a, b) => a.startAt.localeCompare(b.startAt));
      return <section key={key} className={`pp-cal-week-day${key === today ? ' is-today' : ''}`}>
        <h3 aria-current={key === today ? 'date' : undefined}>{day.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</h3>
        {dayEvents.length ? dayEvents.map((event, index) => <EventButton key={`${event.id}-${event.playerId}-${index}`} event={event} onClick={onEventClick} color={colorMap.get(event.playerId)} />) : <p>No events</p>}
      </section>;
    })}</div>
  </section>;
}
