import type { LightsData } from '../../api/types';
import styles from './Lights.module.css';

interface LightsProps {
  data?: LightsData;
}

// Home Assistant's real, live device state - the specific panel_lights
// entities this app already controls elsewhere (see lights.py), not a
// fabricated "smart home" dashboard of devices with no backing data. No
// outer Card - PanelGrid's own panel chrome already provides that.
export function Lights({ data }: LightsProps) {
  if (!data || data.lights.length === 0) {
    return (
      <div className={styles.state}>
        <span className={styles.stateBody}>No Home Assistant lights configured.</span>
      </div>
    );
  }
  const onCount = data.lights.filter((l) => l.on).length;

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.sub}>
          {onCount}/{data.lights.length} on
        </span>
      </div>
      <div className={styles.list}>
        {data.lights.map((light) => (
          <div className={styles.row} key={light.entity}>
            <span
              className={styles.swatch}
              style={{
                background: light.on
                  ? `radial-gradient(circle at 38% 35%, color-mix(in oklab, ${light.hex ?? 'var(--accent)'} 85%, white 25%), ${light.hex ?? 'var(--accent)'} 45%, color-mix(in oklab, ${light.hex ?? 'var(--accent)'} 35%, transparent) 78%, transparent 100%)`
                  : undefined,
              }}
            />
            <span className={styles.name}>{light.name}</span>
            {light.on && light.brightness != null && (
              <div className={styles.brightnessTrack}>
                <div className={styles.brightnessFill} style={{ width: `${Math.round((light.brightness / 255) * 100)}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
