import type { HomelabService } from '../../api/types';
import { ServiceCard } from './ServiceCard';
import styles from './ServiceStatus.module.css';

interface ServiceStatusProps {
  services: HomelabService[];
  up: number;
  count: number;
}

// Every probed service in one flat, dense field - not grouped rows with
// their own headers (that was Fleet; this is deliberately a different,
// more compact composition). Real TCP-probe status/latency, nothing
// fabricated - just presented as a single field to scan, not a
// categorized report. Offline services sort first - the ones that need
// attention shouldn't be buried below a wall of services that are fine.
export function ServiceStatus({ services, up, count }: ServiceStatusProps) {
  const sorted = [...services].sort((a, b) => Number(a.online) - Number(b.online));
  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.count}>
          {up}/{count} online
        </span>
      </div>
      <div className={styles.grid}>
        {sorted.map((svc) => (
          <ServiceCard key={svc.name} service={svc} />
        ))}
      </div>
    </div>
  );
}
