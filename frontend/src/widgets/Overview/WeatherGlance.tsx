import { useSnapshotData } from '../../api/SnapshotProvider';
import { DropletIcon, FeelsIcon, WindIcon } from '../Weather/statIcons';
import { WeatherIcon } from '../Weather/WeatherIcon';
import styles from './WeatherGlance.module.css';

// Weather fills its own panel now, not condensed into a corner of a
// combined card - the same real snapshot.weather data, laid out at full
// size: a big current temperature and condition, humidity/wind/feels-like
// as real stat chips, and a 5-day outlook with a per-day range bar (one
// shared scale across the week, not five independent bars) instead of
// just two stacked numbers.
export function WeatherGlance() {
  const { snapshot } = useSnapshotData();
  const w = snapshot?.weather;

  if (!w) {
    return <div className={styles.empty}>Fetching weather…</div>;
  }
  if (snapshot?.errors?.weather) {
    return <div className={styles.empty}>Weather unavailable.</div>;
  }

  const days = w.days.slice(1, 6);
  const trackMin = days.length ? Math.min(...days.map((d) => d.low)) : 0;
  const trackMax = days.length ? Math.max(...days.map((d) => d.high)) : 1;
  const span = Math.max(1, trackMax - trackMin);

  return (
    <div className={styles.zone}>
      <div className={styles.hero}>
        <div className={styles.heroIcon}>
          <WeatherIcon icon={w.icon} isDay={w.is_day} size={40} />
        </div>
        <div className={styles.nowText}>
          <span className={styles.place}>{w.place}</span>
          <span className={styles.temp}>
            {w.temp}
            <sup>°{w.unit}</sup>
          </span>
          <span className={styles.condition}>{w.label}</span>
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

      {days.length > 0 && (
        <div className={styles.forecast}>
          {days.map((d) => {
            const top = ((trackMax - d.high) / span) * 100;
            const height = Math.max(10, ((d.high - d.low) / span) * 100);
            return (
              <div key={d.date} className={styles.day}>
                <span className={styles.dayLabel}>{d.label}</span>
                <WeatherIcon icon={d.icon} size={20} />
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
    </div>
  );
}
