import { useSnapshotData } from '../../api/SnapshotProvider';
import type { CalendarEvent } from '../../api/types';
import styles from './CalendarAgenda.module.css';

function dayLabel(when: number): string {
  const date = new Date(when * 1000);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, tomorrow)) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeLabel(event: CalendarEvent): string {
  if (event.ongoing) return 'Now';
  if (event.all_day) return 'All day';
  return new Date(event.when * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// A vertical timeline, not a plain agenda list - a connecting line
// threading through each event's own dot is what makes "what's my day
// looking like" read as a real timeline of the day rather than a list
// that happens to have times in it. Grouped by day label so a run of
// same-day events doesn't repeat "Today" on every row. No card of its
// own - lives directly on whatever canvas its parent provides.
export function CalendarAgenda({ limit = 6 }: { limit?: number }) {
  const { snapshot } = useSnapshotData();
  const cal = snapshot?.calendar;

  if (!cal?.configured) {
    return <div className={styles.empty}>No calendar connected.</div>;
  }
  if (cal.error) {
    return <div className={styles.empty}>Calendar unavailable.</div>;
  }
  // The feed now carries recent past events too (so month navigation has
  // something to show going backward) - "Upcoming" itself must still only
  // ever look forward, so it filters those back out rather than trusting
  // the feed's own ordering.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const upcoming = cal.items.filter((e) => e.ongoing || e.when * 1000 >= startOfToday.getTime());

  if (upcoming.length === 0) {
    return <div className={styles.empty}>Nothing upcoming on your calendar.</div>;
  }

  const items = upcoming.slice(0, limit);
  let lastDay = '';

  return (
    <div className={styles.timeline}>
      {items.map((event, i) => {
        const day = dayLabel(event.when);
        const showDay = day !== lastDay;
        lastDay = day;
        return (
          <div key={i} className={styles.entry}>
            {showDay && <span className={styles.dayHeading}>{day}</span>}
            <div className={[styles.event, event.ongoing ? styles.eventOngoing : ''].join(' ')}>
              <span className={styles.rail}>
                <span className={styles.dot} />
                {i < items.length - 1 && <span className={styles.line} />}
              </span>
              <span className={styles.time}>{timeLabel(event)}</span>
              <span className={styles.text}>
                <span className={styles.title}>{event.title}</span>
                {event.location && <span className={styles.location}>{event.location}</span>}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
