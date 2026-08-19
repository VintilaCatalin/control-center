import { useMemo } from 'react';
import { useSnapshotData } from '../../api/SnapshotProvider';
import type { CalendarEvent, TaskEntry, UpcomingItem } from '../../api/types';
import { useAppNavigation } from '../../shell/AppNavigationContext';
import { dateFromKey, localDateKey } from '../Tasks/taskViews';
import styles from './HorizonGlance.module.css';

type HorizonItem = {
  id: string;
  kind: 'task' | 'event' | 'release';
  title: string;
  context: string;
  when: number;
  allDay: boolean;
};

function CalendarGlyph() {
  return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>;
}

function taskItem(task: TaskEntry): HorizonItem | null {
  const dates = [task.scheduled_on, task.deadline_on].filter((value): value is string => !!value).sort();
  if (!dates[0]) return null;
  const isDeadline = task.deadline_on === dates[0];
  return { id: `task-${task.id}`, kind: 'task', title: task.title, context: isDeadline ? 'Task deadline' : 'Scheduled task', when: dateFromKey(dates[0]).getTime(), allDay: true };
}

function eventItem(event: CalendarEvent, index: number): HorizonItem {
  return { id: `event-${event.when}-${index}`, kind: 'event', title: event.title, context: event.location || 'Calendar', when: event.when * 1000, allDay: event.all_day };
}

function releaseItem(item: UpcomingItem, index: number): HorizonItem | null {
  if (!item.when) return null;
  return { id: `release-${item.when}-${index}`, kind: 'release', title: item.title, context: item.sub || (item.kind === 'tv' ? 'TV release' : 'Movie release'), when: item.when * 1000, allDay: true };
}

function dayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (localDateKey(date) === localDateKey(today)) return 'Today';
  if (localDateKey(date) === localDateKey(tomorrow)) return 'Tomorrow';
  const diff = Math.round((dateFromKey(localDateKey(date)).getTime() - dateFromKey(localDateKey(today)).getTime()) / 86_400_000);
  if (diff < 7) return date.toLocaleDateString(undefined, { weekday: 'short' });
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function timeLabel(item: HorizonItem): string {
  if (item.allDay) return item.context;
  const time = new Date(item.when).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${time} · ${item.context}`;
}

export function HorizonGlance() {
  const { snapshot } = useSnapshotData();
  const { navigateToApp } = useAppNavigation();
  const items = useMemo(() => {
    const start = dateFromKey(localDateKey()).getTime();
    const end = start + 31 * 86_400_000;
    return [
      ...(snapshot?.tasks?.tasks ?? []).filter((task) => task.status === 'open').map(taskItem),
      ...(snapshot?.calendar?.items ?? []).map(eventItem),
      ...(snapshot?.upcoming?.items ?? []).map(releaseItem),
    ].filter((item): item is HorizonItem => !!item && item.when >= start && item.when < end).sort((a, b) => a.when - b.when).slice(0, 6);
  }, [snapshot?.tasks?.tasks, snapshot?.calendar?.items, snapshot?.upcoming?.items]);

  function open(item: HorizonItem) {
    if (item.kind === 'task') navigateToApp('tasks');
    else if (item.kind === 'release') navigateToApp('plex');
  }

  return <div className={styles.glance}>
    <header className={styles.head}>
      <span className={styles.heading}><CalendarGlyph /> On the horizon</span>
      <span className={styles.range}>Next 30 days</span>
    </header>
    {items.length === 0 ? <div className={styles.empty}><strong>A clear horizon</strong><span>No deadlines, events, or releases are approaching.</span></div> : <div className={styles.timeline}>
      {items.map((item, index) => <button type="button" key={item.id} className={styles.item} onClick={() => open(item)} disabled={item.kind === 'event'}>
        <span className={styles.date}><strong>{dayLabel(item.when)}</strong><small>{new Date(item.when).toLocaleDateString(undefined, { day: '2-digit' })}</small></span>
        <span className={styles.track}><i data-kind={item.kind} />{index < items.length - 1 && <b />}</span>
        <span className={styles.copy}><strong>{item.title}</strong><small>{timeLabel(item)}</small></span>
        <span className={styles.kind}>{item.kind}</span>
      </button>)}
    </div>}
  </div>;
}
