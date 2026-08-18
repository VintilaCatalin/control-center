import { useEffect, useRef, useState } from 'react';
import { searchCity, type GeocodeResult } from '../../api/actions/geocode';
import styles from './CityField.module.css';

interface CityFieldProps {
  place: string;
  onChange: (place: string, latitude: string, longitude: string) => void;
}

function label(r: GeocodeResult): string {
  return [r.name, r.admin1, r.country].filter(Boolean).join(', ');
}

// Replaces separately typing place/latitude/longitude by hand - type a
// city, pick the right match, and all three settings keys are set
// together from real geocoded coordinates (see backend/routes/core.py's
// /api/geocode, a thin proxy over the same Open-Meteo API collect_weather()
// already calls). Nobody should ever need to look up their own lat/long.
export function CityField({ place, onChange }: CityFieldProps) {
  const [query, setQuery] = useState(place);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setQuery(place), [place]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleInput(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchCity(q);
        setResults(r.results);
        setOpen(r.results.length > 0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  }

  function handlePick(r: GeocodeResult) {
    const chosen = label(r);
    setQuery(chosen);
    setOpen(false);
    onChange(chosen, String(r.latitude), String(r.longitude));
  }

  return (
    <div className={styles.field} ref={wrapRef}>
      <label className={styles.label}>Location</label>
      <div className={styles.inputWrap}>
        <input
          className={styles.input}
          type="text"
          value={query}
          placeholder="Search for a city…"
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && <span className={styles.spinner} />}
      </div>
      {open && (
        <ul className={styles.results}>
          {results.map((r, i) => (
            <li key={`${r.name}-${r.latitude}-${i}`}>
              <button type="button" className={styles.resultBtn} onClick={() => handlePick(r)}>
                {label(r)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <span className={styles.hint}>Powers Weather on Overview - no need to look up your own coordinates.</span>
    </div>
  );
}
