import type { NetdataMetric } from '../../api/types';
import { RadialGauge } from '../../primitives/RadialGauge/RadialGauge';
import styles from './HostRam.module.css';

interface HostRamProps {
  ram?: NetdataMetric;
  color?: string;
}

// RAM is a capacity question ("how much of the total is used right now"),
// not a load-over-time question the way CPU is - a ring reads that
// instantly. Deliberately no history chart here: memory on a homelab
// mostly sits flat, and a second bar chart next to CPU's would just be
// visual noise repeating the same shape for a metric that doesn't move
// the way CPU does.
export function HostRam({ ram, color = 'var(--accent)' }: HostRamProps) {
  if (!ram) {
    return (
      <div className={styles.empty}>
        <span>Host metrics not connected.</span>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <RadialGauge pct={ram.pct} color={color} size={148} strokeWidth={11}>
        <span className={styles.pct}>{ram.pct != null ? Math.round(ram.pct) : '—'}</span>
        <span className={styles.pctSign}>%</span>
      </RadialGauge>
      <div className={styles.meta}>
        <span className={styles.used}>{ram.used_gb != null ? `${ram.used_gb} GB` : '—'} used</span>
        <span className={styles.total}>of {ram.total_gb != null ? `${ram.total_gb} GB` : '—'}</span>
      </div>
    </div>
  );
}
