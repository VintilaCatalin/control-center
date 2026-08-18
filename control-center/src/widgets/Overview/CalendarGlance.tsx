import { useMemo, useState } from 'react';
import { useSnapshotData } from '../../api/SnapshotProvider';
import type { CalendarEvent } from '../../api/types';
import { CalendarAgenda } from './CalendarAgenda';
import styles from './CalendarGlance.module.css';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function ChevronLeftIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
function ChevronRightIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

interface DayCell {
  date: Date;
  inMonth: boolean;
  hasEvent: boolean;
}

function buildMonth(viewDate: Date, eventDays: Set<string>): DayCell[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - start.getDay());

  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({ date: d, inMonth: d.getMonth() === month, hasEvent: eventDays.has(d.toDateString()) });
  }
  return cells;
}

function timeLabel(event: CalendarEvent): string {
  if (event.ongoing) return 'Now';
  if (event.all_day) return 'All day';
  return new Date(event.when * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// A real month grid, not a plain event list wearing a "Calendar" label -
// today highlighted, a dot on any day with a real event. Clicking a day
// swaps the agenda below for that day's own events (real data, filtered
// client-side from the same snapshot.calendar.items already loaded - no
// second fetch) - clicking it again (or the × ) returns to the default
// "Upcoming" agenda. Month navigation is view-only (no event creation
// here - Settings' calendar_ics integration owns the source of truth).
export function CalendarGlance() {
  const { snapshot } = useSnapshotData();
  const cal = snapshot?.calendar;
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selected, setSelected] = useState<Date | null>(null);
  const today = new Date();

  const eventDays = useMemo(() => {
    const set = new Set<string>();
    for (const e of cal?.items ?? []) set.add(new Date(e.when * 1000).toDateString());
    return set;
  }, [cal]);

  const cells = useMemo(() => buildMonth(viewDate, eventDays), [viewDate, eventDays]);
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const selectedEvents = useMemo(() => {
    if (!selected) return null;
    return (cal?.items ?? []).filter((e) => new Date(e.when * 1000).toDateString() === selected.toDateString());
  }, [selected, cal]);

  function shiftMonth(delta: number) {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }

  function handleDayClick(date: Date) {
    setSelected((prev) => (prev && prev.toDateString() === date.toDateString() ? null : date));
  }

  return (
    <div className={styles.zone}>
      <div className={styles.monthHead}>
        <span className={styles.monthLabel}>{monthLabel}</span>
        <div className={styles.monthNav}>
          <button type="button" className={styles.navBtn} onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeftIcon />
          </button>
          <button type="button" className={styles.navBtn} onClick={() => shiftMonth(1)} aria-label="Next month">
            <ChevronRightIcon />
          </button>
        </div>
      </div>

      <div className={styles.weekdays}>
        {WEEKDAYS.map((w, i) => (
          <span key={i} className={styles.weekday}>
            {w}
          </span>
        ))}
      </div>

      <div className={styles.month}>
        {cells.map((cell, i) => {
          const isToday = cell.date.toDateString() === today.toDateString();
          const isSelected = !!selected && cell.date.toDateString() === selected.toDateString();
          return (
            <button
              key={i}
              type="button"
              className={[styles.day, cell.inMonth ? '' : styles.dayOutside, isToday ? styles.dayToday : '', isSelected ? styles.daySelected : ''].join(' ')}
              onClick={() => handleDayClick(cell.date)}
            >
              <span className={styles.dayNum}>{cell.date.getDate()}</span>
              {cell.hasEvent && <span className={styles.dayDot} />}
            </button>
          );
        })}
      </div>

      <div className={styles.agenda}>
        {selected ? (
          <>
            <div className={styles.agendaHead}>
              <span className={styles.sectionLabel}>{selected.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
              <button type="button" className={styles.clearBtn} onClick={() => setSelected(null)} aria-label="Back to upcoming">
                <CloseIcon />
              </button>
            </div>
            {selectedEvents && selectedEvents.length > 0 ? (
              <div className={styles.dayList}>
                {selectedEvents.map((e, i) => (
                  <div key={i} className={styles.dayEvent}>
                    <span className={styles.dayEventTime}>{timeLabel(e)}</span>
                    <span className={styles.dayEventText}>
                      <span className={styles.dayEventTitle}>{e.title}</span>
                      {e.location && <span className={styles.dayEventLocation}>{e.location}</span>}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.dayEmpty}>Nothing on this day.</div>
            )}
          </>
        ) : (
          <>
            <span className={styles.sectionLabel}>Upcoming</span>
            <CalendarAgenda limit={4} />
          </>
        )}
      </div>
    </div>
  );
}
