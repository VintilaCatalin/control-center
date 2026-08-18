import { AnimatePresence, motion } from 'framer-motion';
import { useSnapshotData } from '../../api/SnapshotProvider';
import { duration, ease } from '../../tokens/motion';
import { DropletIcon, FeelsIcon, WindIcon } from './statIcons';
import { WeatherIcon } from './WeatherIcon';
import styles from './Weather.module.css';

const fade = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

export function Weather() {
  const { snapshot, loading, error } = useSnapshotData();

  // No snapshot has ever arrived yet.
  if (!snapshot && loading) return <WeatherSkeleton />;

  // No snapshot has ever arrived, and the request failed - can't reach
  // the backend at all.
  if (!snapshot && error) {
    return <WeatherMessage tone="error">Can't reach the panel backend</WeatherMessage>;
  }

  const collectorError = snapshot?.errors?.weather;
  if (collectorError) {
    return <WeatherMessage tone="error">Weather unavailable</WeatherMessage>;
  }

  const w = snapshot?.weather;
  if (!w) {
    return <WeatherMessage tone="quiet">Fetching weather…</WeatherMessage>;
  }

  const days = w.days.slice(1, 6);
  const hours = w.hours ?? [];

  // A shared scale across the whole 5-day window, not per-day - so each
  // day's bar height is actually comparable to its neighbours (a 3-degree
  // range next to a 12-degree range should look narrow next to wide, not
  // both stretched to fill their own box).
  const trackMin = days.length ? Math.min(...days.map((d) => d.low)) : 0;
  const trackMax = days.length ? Math.max(...days.map((d) => d.high)) : 1;
  const span = Math.max(1, trackMax - trackMin);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="ready"
        className={styles.root}
        initial={fade.initial}
        animate={fade.animate}
        transition={{ duration: duration.slow, ease }}
      >
        <div className={styles.hero}>
          <div className={styles.heroIcon}>
            <WeatherIcon icon={w.icon} isDay={w.is_day} size={52} />
          </div>
          <div className={styles.heroText}>
            <span className={styles.place}>{w.place}</span>
            <div className={styles.temp}>
              {w.temp}
              <sup>°{w.unit}</sup>
            </div>
            <span className={styles.conditionLabel}>{w.label}</span>
          </div>
        </div>

        <div className={styles.stats}>
          <span className={styles.stat}>
            <FeelsIcon />
            Feels {w.feels}°
          </span>
          <span className={styles.stat}>
            <DropletIcon />
            {w.humidity}%
          </span>
          <span className={styles.stat}>
            <WindIcon />
            {w.wind} km/h
          </span>
        </div>

        {hours.length > 0 && (
          <div className={styles.hoursRow}>
            {hours.map((h) => (
              <div key={h.time} className={styles.hour}>
                <span className={styles.hourLabel}>{h.label}</span>
                <WeatherIcon icon={h.icon} isDay={w.is_day} size={16} />
                <span className={styles.hourTemp}>{h.temp}°</span>
              </div>
            ))}
          </div>
        )}

        {days.length > 0 && (
          <div className={styles.days}>
            {days.map((d) => {
              const top = ((trackMax - d.high) / span) * 100;
              const height = Math.max(10, ((d.high - d.low) / span) * 100);
              return (
                <div key={d.date} className={styles.day}>
                  <span className={styles.dayLabel}>{d.label}</span>
                  <WeatherIcon icon={d.icon} size={17} />
                  <span className={styles.dayHigh}>{d.high}°</span>
                  <div className={styles.rangeTrack}>
                    <div className={styles.rangeBar} style={{ top: `${top}%`, height: `${height}%` }} />
                  </div>
                  <span className={styles.dayLow}>{d.low}°</span>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function WeatherSkeleton() {
  return (
    <div className={styles.root} aria-busy="true" aria-label="Loading weather">
      <div className={styles.hero}>
        <span className={`${styles.skel} ${styles.skelIcon}`} style={{ width: 76, height: 76, borderRadius: 22 }} />
        <span className={`${styles.skel} ${styles.skelTemp}`} />
      </div>
      <div className={styles.days}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.day}>
            <span className={`${styles.skel} ${styles.skelLabel}`} />
            <span className={`${styles.skel} ${styles.skelIcon}`} />
            <span className={`${styles.skel} ${styles.skelHigh}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function WeatherMessage({
  tone,
  children,
}: {
  tone: 'error' | 'quiet';
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className={`${styles.root} ${styles.message} ${tone === 'error' ? styles.messageError : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: duration.base, ease }}
    >
      {children}
    </motion.div>
  );
}
