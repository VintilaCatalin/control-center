import { useMemo } from 'react';
import { useSnapshotData } from '../../api/SnapshotProvider';
import type { HardwareData, SettingsFieldSchema, SettingsResponse } from '../../api/types';
import { CityField } from './CityField';
import { ProfilePhotoField } from './ProfilePhotoField';
import { SettingsField } from './SettingsField';
import styles from './SettingsPages.module.css';

interface SystemPageProps {
  data: SettingsResponse;
  getValue: (key: string) => string;
  isSecret: (key: string) => boolean;
  origin: (key: string) => string;
  onChange: (key: string, value: string, opts?: { immediate?: boolean }) => void;
  setLocal: (key: string, value: string) => void;
}

const PROFILE_KEYS = ['_profile_name', 'units', 'calendar_ics'];

// Real polling cadences, straight from server.py's own INTERVALS dict -
// not editable (that dict drives the collector scheduler itself, not a
// per-user preference), but genuinely useful to see rather than a black
// box. Shown, not invented.
const REFRESH_RATES: { label: string; seconds: number }[] = [
  { label: 'Now Playing / media', seconds: 2 },
  { label: 'Hardware sensors', seconds: 4 },
  { label: 'Lights', seconds: 10 },
  { label: 'Homelab dashboard', seconds: 15 },
  { label: 'Downloads', seconds: 8 },
  { label: 'Plex', seconds: 30 },
  { label: 'Games library', seconds: 600 },
  { label: 'Weather', seconds: 900 },
  { label: 'Reading feeds', seconds: 900 },
  { label: 'Reading Saves (Raindrop)', seconds: 120 },
  { label: 'Calendar', seconds: 900 },
  { label: 'Top Wanted (Overseerr)', seconds: 1800 },
];

const APP_LABELS: Record<string, string> = {
  overview: 'Overview',
  games: 'Games',
  scene: 'Scene',
  notes: 'Notes',
  plex: 'Plex',
  reading: 'Reading',
  homelab: 'Homelab',
};

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function SystemPage({ data, getValue, isSecret, origin, onChange, setLocal }: SystemPageProps) {
  const { snapshot } = useSnapshotData();
  const fieldMap = useMemo(() => {
    const map = new Map<string, SettingsFieldSchema>();
    for (const group of data.schema) for (const key of group.keys) map.set(key.key, key);
    return map;
  }, [data.schema]);

  const hardware: HardwareData | undefined = snapshot?.hardware;
  const defaultAppField = fieldMap.get('default_app');
  const photoUrl = getValue('_profile_photo');
  const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <h1 className={styles.pageTitle}>System &amp; Preferences</h1>
        <p className={styles.pageSub}>Your profile, how the app behaves day to day, and where it stands right now.</p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Profile</h2>
        <div className={styles.card}>
          <ProfilePhotoField photoUrl={photoUrl} name={getValue('_profile_name')} onChanged={(url) => setLocal('_profile_photo', url ?? '')} />
          <div className={styles.grid2}>
            {PROFILE_KEYS.map((key) => {
              const field = fieldMap.get(key);
              if (!field) return null;
              return <SettingsField key={key} field={field} value={getValue(key)} isSecret={isSecret(key)} origin={origin(key)} onChange={(v, o) => onChange(key, v, o)} />;
            })}
            <CityField
              place={getValue('place')}
              onChange={(place, lat, lon) => {
                onChange('place', place, { immediate: true });
                onChange('latitude', lat, { immediate: true });
                onChange('longitude', lon, { immediate: true });
              }}
            />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Startup</h2>
        <div className={styles.grid2}>
          <div className={styles.card}>
            {defaultAppField && (
              <SettingsField
                field={{ ...defaultAppField, hint: undefined }}
                value={getValue('default_app') || 'overview'}
                isSecret={false}
                origin={origin('default_app')}
                onChange={(v, o) => onChange('default_app', v, o)}
              />
            )}
            <span className={styles.sectionSub} style={{ margin: 0 }}>
              Which application shows the moment Control Center starts.
            </span>
          </div>
          <div className={styles.noteCard}>
            Control Center doesn't register itself to launch on sign-in automatically. Add a shortcut to <code className={styles.code}>control_center_tray.py</code> in your{' '}
            <code className={styles.code}>shell:startup</code> folder to have it running before you sit down.
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Data refresh</h2>
        <p className={styles.sectionSub}>How often each part of the app polls for fresh data - fixed per-feature, not user-adjustable.</p>
        <div className={styles.card}>
          <div className={styles.infoList}>
            {REFRESH_RATES.map((r) => (
              <div className={styles.infoRow} key={r.label}>
                <span className={styles.infoLabel}>{r.label}</span>
                <span className={styles.infoValue}>every {formatSeconds(r.seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>System information</h2>
        <div className={styles.card}>
          <div className={styles.infoList}>
            {hardware?.cpu_temp != null && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>CPU temperature</span>
                <span className={styles.infoValue}>{hardware.cpu_temp}°C</span>
              </div>
            )}
            {hardware?.gpu_temp != null && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>GPU temperature</span>
                <span className={styles.infoValue}>{hardware.gpu_temp}°C</span>
              </div>
            )}
            {hardware?.cpu_load != null && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>CPU load</span>
                <span className={styles.infoValue}>{hardware.cpu_load}%</span>
              </div>
            )}
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Settings file</span>
              <span className={styles.infoValue} title={data.store_file}>
                {data.store_file}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>config.ini</span>
              <span className={styles.infoValue} title={data.config_file}>
                {data.config_problem ? 'not in use' : data.config_file}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Window size</span>
              <span className={styles.infoValue}>
                {window.innerWidth} × {window.innerHeight}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Screen resolution</span>
              <span className={styles.infoValue}>
                {window.screen.width} × {window.screen.height}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Pixel ratio</span>
              <span className={styles.infoValue}>{window.devicePixelRatio}×</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Platform</span>
              <span className={styles.infoValue}>{navigator.platform || 'unknown'}</span>
            </div>
            {memory && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Renderer memory</span>
                <span className={styles.infoValue}>{formatBytes(memory.usedJSHeapSize)}</span>
              </div>
            )}
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Default app</span>
              <span className={styles.infoValue}>{APP_LABELS[getValue('default_app') || 'overview']}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
