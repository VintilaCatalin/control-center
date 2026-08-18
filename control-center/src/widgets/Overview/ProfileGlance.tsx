import { useEffect, useState } from 'react';
import { useSnapshotData } from '../../api/SnapshotProvider';
import { useAppNavigation } from '../../shell/AppNavigationContext';
import { GearIcon, PlugIcon, SlidersIcon } from '../../shell/icons';
import styles from './ProfileGlance.module.css';

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// The photo and the greeting ARE the panel now - a real portrait, big,
// with an accent ring, and "Good evening, Catalin" set large enough to
// be the actual headline of Overview, not a caption next to a clock.
// Time/date drop to a quiet secondary line underneath (Time already has
// its own panel elsewhere in the app) - this one is about who, not what
// time.
export function ProfileGlance() {
  const { snapshot } = useSnapshotData();
  const { openSettings } = useAppNavigation();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const profile = snapshot?.ui?.profile;
  const name = profile?.name || 'there';
  const initial = (profile?.name || 'V').slice(0, 1).toUpperCase();

  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });

  const openTasks = (snapshot?.tasks?.tasks ?? []).filter((t) => !t.done).length;
  const todayEvents = (snapshot?.calendar?.items ?? []).filter((e) => {
    const d = new Date(e.when * 1000);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }).length;

  const context =
    openTasks > 0 && todayEvents > 0
      ? `${openTasks} open task${openTasks === 1 ? '' : 's'} · ${todayEvents} event${todayEvents === 1 ? '' : 's'} today`
      : openTasks > 0
        ? `${openTasks} open task${openTasks === 1 ? '' : 's'}`
        : todayEvents > 0
          ? `${todayEvents} event${todayEvents === 1 ? '' : 's'} today`
          : 'Nothing pressing right now';

  return (
    <div className={styles.glance}>
      <div className={styles.links}>
        <button type="button" className={styles.link} onClick={() => openSettings('settings')} title="Settings">
          <GearIcon />
        </button>
        <button type="button" className={styles.link} onClick={() => openSettings('system')} title="System & Preferences">
          <SlidersIcon />
        </button>
        <button type="button" className={styles.link} onClick={() => openSettings('integrations')} title="Integrations">
          <PlugIcon />
        </button>
      </div>

      <div className={styles.hero}>
        <span className={styles.avatarRing}>
          <span className={styles.avatar}>{profile?.photo ? <img className={styles.avatarImg} src={profile.photo} alt="" /> : initial}</span>
        </span>

        <div className={styles.text}>
          <span className={styles.greeting}>
            {timeGreeting()},
            <br />
            {name}
          </span>
          <span className={styles.subline}>
            {time} · {weekday}
          </span>
          <span className={styles.context}>{context}</span>
        </div>
      </div>
    </div>
  );
}
