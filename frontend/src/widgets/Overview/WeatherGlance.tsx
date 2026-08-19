import { useSnapshotData } from '../../api/SnapshotProvider';
import { DropletIcon, FeelsIcon, WindIcon } from '../Weather/statIcons';
import { WeatherIcon } from '../Weather/WeatherIcon';
import styles from './WeatherGlance.module.css';

export function WeatherGlance() {
  const { snapshot } = useSnapshotData();
  const weather = snapshot?.weather;

  if (!weather) return <div className={styles.empty}>Fetching weather…</div>;
  if (snapshot?.errors?.weather) return <div className={styles.empty}>Weather unavailable.</div>;

  const today = weather.days[0];
  const days = weather.days.slice(1, 6);

  return <div className={styles.weather}>
    <header className={styles.heading}>
      <span className={styles.place}>{weather.place}</span>
      <span className={styles.condition}>{weather.label}</span>
    </header>

    <div className={styles.current}>
      <div className={styles.temperature}>
        <span className={styles.number}>{weather.temp}</span>
        <span className={styles.degree}>°{weather.unit}</span>
      </div>
      <div className={styles.sky}>
        <span className={styles.iconGlow} aria-hidden="true" />
        <WeatherIcon icon={weather.icon} isDay={weather.is_day} size={70} />
      </div>
      <div className={styles.todayRange}>
        <span>Today</span>
        <strong>{today ? `${today.high}°` : '—'}</strong>
        <em>{today ? `${today.low}°` : '—'}</em>
      </div>
    </div>

    <div className={styles.facts}>
      <span className={styles.fact}><FeelsIcon /><span><small>Feels like</small><strong>{weather.feels}°</strong></span></span>
      <span className={styles.fact}><DropletIcon /><span><small>Humidity</small><strong>{weather.humidity}%</strong></span></span>
      <span className={styles.fact}><WindIcon /><span><small>Wind</small><strong>{weather.wind} km/h</strong></span></span>
    </div>

    {days.length > 0 && <section className={styles.outlook}>
      <span className={styles.outlookLabel}>Next five days</span>
      <div className={styles.days}>
        {days.map((day) => <div key={day.date} className={styles.day}>
          <span className={styles.dayName}>{day.label}</span>
          <WeatherIcon icon={day.icon} size={21} />
          <span className={styles.dayTemps}><strong>{day.high}°</strong><em>{day.low}°</em></span>
        </div>)}
      </div>
    </section>}
  </div>;
}
