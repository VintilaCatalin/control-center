import { AnimatePresence, motion } from 'framer-motion';
import { useSnapshotData } from '../../api/SnapshotProvider';
import { duration, ease } from '../../tokens/motion';
import { DropletIcon, FeelsIcon, WindIcon } from './statIcons';
import { WeatherIcon } from './WeatherIcon';
import styles from './Weather.module.css';

const fade = {
  initial: { opacity: 0, y: 5 },
  animate: { opacity: 1, y: 0 },
};

export function Weather() {
  const { snapshot, loading, error } = useSnapshotData();

  if (!snapshot && loading) return <WeatherSkeleton />;
  if (!snapshot && error) return <WeatherMessage tone="error">Can't reach the panel backend</WeatherMessage>;
  if (snapshot?.errors?.weather) return <WeatherMessage tone="error">Weather unavailable</WeatherMessage>;

  const weather = snapshot?.weather;
  if (!weather) return <WeatherMessage tone="quiet">Fetching weather…</WeatherMessage>;

  const today = weather.days[0];
  const hours = (weather.hours ?? []).slice(0, 5);
  const days = weather.days.slice(1, 4);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="ready"
        className={styles.root}
        initial={fade.initial}
        animate={fade.animate}
        transition={{ duration: duration.slow, ease }}
      >
        <header className={styles.hero}>
          <div className={styles.locationBlock}>
            <span className={styles.place}>{weather.place}</span>
            <span className={styles.conditionLabel}>{weather.label}</span>
          </div>
          <div className={styles.current}>
            <WeatherIcon icon={weather.icon} isDay={weather.is_day} size={39} />
            <div className={styles.temp}>
              {weather.temp}<sup>°{weather.unit}</sup>
            </div>
          </div>
          {today && (
            <div className={styles.todayRange}>
              <span>Today</span>
              <strong>{today.high}°</strong>
              <span>{today.low}°</span>
            </div>
          )}
        </header>

        <div className={styles.stats}>
          <span className={styles.stat}>
            <FeelsIcon />
            <span><small>Feels like</small><strong>{weather.feels}°</strong></span>
          </span>
          <span className={styles.stat}>
            <DropletIcon />
            <span><small>Humidity</small><strong>{weather.humidity}%</strong></span>
          </span>
          <span className={styles.stat}>
            <WindIcon />
            <span><small>Wind</small><strong>{weather.wind} km/h</strong></span>
          </span>
        </div>

        {hours.length > 0 && (
          <section className={styles.section} aria-label="Hourly forecast">
            <div className={styles.sectionTitle}>Next hours</div>
            <div className={styles.hoursRow}>
              {hours.map((hour) => (
                <div key={hour.time} className={styles.hour}>
                  <span className={styles.hourLabel}>{hour.label}</span>
                  <WeatherIcon icon={hour.icon} isDay={weather.is_day} size={17} />
                  <strong>{hour.temp}°</strong>
                </div>
              ))}
            </div>
          </section>
        )}

        {days.length > 0 && (
          <section className={styles.section} aria-label="Three day forecast">
            <div className={styles.sectionTitle}>Next days</div>
            <div className={styles.days}>
              {days.map((day) => (
                <div key={day.date} className={styles.day}>
                  <span className={styles.dayLabel}>{day.label}</span>
                  <WeatherIcon icon={day.icon} size={18} />
                  <span className={styles.dayTemps}>
                    <strong>{day.high}°</strong>
                    <span>{day.low}°</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function WeatherSkeleton() {
  return (
    <div className={styles.root} aria-busy="true" aria-label="Loading weather">
      <div className={styles.hero}>
        <span className={`${styles.skeleton} ${styles.skeletonPlace}`} />
        <span className={`${styles.skeleton} ${styles.skeletonTemp}`} />
      </div>
      <div className={styles.stats}>
        {[0, 1, 2].map((item) => <span key={item} className={`${styles.skeleton} ${styles.skeletonStat}`} />)}
      </div>
      <span className={`${styles.skeleton} ${styles.skeletonRows}`} />
      <span className={`${styles.skeleton} ${styles.skeletonRows}`} />
    </div>
  );
}

function WeatherMessage({ tone, children }: { tone: 'error' | 'quiet'; children: React.ReactNode }) {
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
