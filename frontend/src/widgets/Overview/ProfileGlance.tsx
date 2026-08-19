import { useEffect, useMemo, useState } from 'react';
import { useSnapshotData } from '../../api/SnapshotProvider';
import { useAppNavigation } from '../../shell/AppNavigationContext';
import { GearIcon, PlugIcon, SlidersIcon } from '../../shell/icons';
import { localDateKey } from '../Tasks/taskViews';
import styles from './ProfileGlance.module.css';

function timeGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function eventTime(when: number, allDay: boolean): string {
  if (allDay) return 'All day';
  return new Date(when * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function ProfileGlance() {
  const { snapshot } = useSnapshotData();
  const { openSettings } = useAppNavigation();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const profile = snapshot?.ui?.profile;
  const name = profile?.name || 'there';
  const initial = (profile?.name || 'V').slice(0, 1).toUpperCase();
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const today = localDateKey(now);
  const tasks = snapshot?.tasks?.tasks ?? [];
  const openTasks = tasks.filter((task) => task.status === 'open');
  const todayTasks = openTasks.filter((task) =>
    (!!task.scheduled_on && task.scheduled_on <= today) || (!!task.deadline_on && task.deadline_on <= today),
  );
  const nextEvent = useMemo(() => {
    const nowSeconds = now.getTime() / 1000;
    return [...(snapshot?.calendar?.items ?? [])]
      .filter((event) => event.ongoing || event.when >= nowSeconds)
      .sort((a, b) => a.when - b.when)[0];
  }, [snapshot?.calendar?.items, now]);
  const weather = snapshot?.weather;

  const summary = todayTasks.length > 0
    ? `${todayTasks.length} task${todayTasks.length === 1 ? '' : 's'} asking for your attention today.`
    : openTasks.length > 0
      ? `Today is clear. ${openTasks.length} open task${openTasks.length === 1 ? '' : 's'} can wait for you.`
      : 'Nothing pressing. Your day is completely clear.';

  return <div className={styles.glance}>
    <div className={styles.briefing}>
      <header className={styles.masthead}>
        <div className={styles.intro}>
          <span className={styles.date}>{dateLabel}</span>
          <h2 className={styles.hello}>{timeGreeting(now)}, <span>{name}.</span></h2>
          <p className={styles.summary}>{summary}</p>
        </div>
        <span className={styles.avatarRing}>
          <span className={styles.avatar}>{profile?.photo ? <img className={styles.avatarImg} src={profile.photo} alt="" /> : initial}</span>
        </span>
      </header>

      <div className={styles.pulse}>
        <div className={styles.signal}>
          <span className={styles.signalLabel}>Today</span>
          <strong className={styles.signalValue}>{todayTasks.length}</strong>
          <span className={styles.signalMeta}>{todayTasks.length === 1 ? 'task scheduled' : 'tasks scheduled'}</span>
        </div>
        <div className={[styles.signal, styles.next].join(' ')}>
          <span className={styles.signalLabel}>Next up</span>
          <strong className={styles.nextTitle}>{nextEvent?.title || 'Open calendar'}</strong>
          <span className={styles.signalMeta}>{nextEvent ? eventTime(nextEvent.when, nextEvent.all_day) : 'Nothing else today'}</span>
        </div>
        <div className={styles.signal}>
          <span className={styles.signalLabel}>Outside</span>
          <strong className={styles.weatherValue}>{weather ? `${weather.temp}°` : '—'}</strong>
          <span className={styles.signalMeta}>{weather?.label || 'Weather unavailable'}</span>
        </div>
      </div>

      <nav className={styles.links} aria-label="Quick settings">
        <button type="button" className={styles.link} onClick={() => openSettings('settings')}><GearIcon /><span>Settings</span></button>
        <button type="button" className={styles.link} onClick={() => openSettings('system')}><SlidersIcon /><span>System</span></button>
        <button type="button" className={styles.link} onClick={() => openSettings('integrations')}><PlugIcon /><span>Connect</span></button>
      </nav>
    </div>
  </div>;
}
