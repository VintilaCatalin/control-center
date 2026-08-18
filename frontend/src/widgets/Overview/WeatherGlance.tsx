import { useSnapshotData } from '../../api/SnapshotProvider';
import { WeatherIcon } from '../Weather/WeatherIcon';
import styles from './WeatherGlance.module.css';

// Weather fills its own panel now, not condensed into a corner of a
// combined card - the same real snapshot.weather data, laid out at full
// size: a big current temperature and condition, humidity/wind context,
// and the forecast strip below.
export function WeatherGlance() {
  const { snapshot } = useSnapshotData();
  const w = snapshot?.weather;

  if (!w) {
    return <div className={styles.empty}>Fetching weather…</div>;
  }
  if (snapshot?.errors?.weather) {
    return <div className={styles.empty}>Weather unavailable.</div>;
  }

  return (
    <div className={styles.zone}>
      <div className={styles.now}>
        <WeatherIcon icon={w.icon} size={44} />
        <div className={styles.nowText}>
          <span className={styles.temp}>
            {w.temp}
            <sup>°{w.unit}</sup>
          </span>
          <span className={styles.condition}>{w.label}</span>
        </div>
      </div>

      <div className={styles.context}>
        <span>Feels like {w.feels}°</span>
        <span className={styles.dot}>·</span>
        <span>{w.humidity}% humidity</span>
        <span className={styles.dot}>·</span>
        <span>{w.wind} mph wind</span>
      </div>

      <div className={styles.place}>{w.place}</div>

      {w.days.length > 1 && (
        <div className={styles.forecast}>
          {w.days.slice(1, 5).map((d) => (
            <div key={d.date} className={styles.day}>
              <span className={styles.dayLabel}>{d.label}</span>
              <WeatherIcon icon={d.icon} size={20} />
              <span className={styles.dayHigh}>{d.high}°</span>
              <span className={styles.dayLow}>{d.low}°</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
