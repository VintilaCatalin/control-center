import { AnimatePresence, motion } from 'framer-motion';
import { useSnapshotData } from '../../api/SnapshotProvider';
import { duration, ease } from '../../tokens/motion';
import { WeatherIcon } from './WeatherIcon';
import styles from './Weather.module.css';

const fade = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

function DropletIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3s6.5 7.1 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10.1 12 3 12 3Z" />
    </svg>
  );
}

function WindIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8h11.5a2.75 2.75 0 1 0-2.6-3.7M3 12.5h14.5a2.75 2.75 0 1 1-2.6 3.7M3 17h9.5a2.25 2.25 0 1 1-2.1 3" />
    </svg>
  );
}

function FeelsIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 14.76V4.5a2.5 2.5 0 0 0-5 0v10.26a4.5 4.5 0 1 0 5 0Z" strokeLinejoin="round" />
    </svg>
  );
}

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

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="ready"
        className={styles.root}
        initial={fade.initial}
        animate={fade.animate}
        transition={{ duration: duration.slow, ease }}
      >
        <div className={styles.now}>
          <span className={styles.place}>{w.place}</span>
          <div className={styles.tempRow}>
            <div className={styles.temp}>
              {w.temp}
              <sup>°{w.unit}</sup>
            </div>
            <div className={styles.condition}>
              <WeatherIcon icon={w.icon} isDay={w.is_day} size={26} />
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
            {days.map((d) => (
              <div key={d.date} className={styles.day}>
                <span className={styles.dayLabel}>{d.label}</span>
                <WeatherIcon icon={d.icon} size={18} />
                <span className={styles.dayHigh}>{d.high}°</span>
                <span className={styles.dayLow}>{d.low}°</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function WeatherSkeleton() {
  return (
    <div className={styles.root} aria-busy="true" aria-label="Loading weather">
      <div className={styles.now}>
        <span className={`${styles.skel} ${styles.skelTemp}`} />
        <span className={`${styles.skel} ${styles.skelMeta}`} />
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
