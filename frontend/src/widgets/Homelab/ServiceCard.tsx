import { motion, useReducedMotion } from 'framer-motion';
import type { HomelabService } from '../../api/types';
import { formatLatency } from './metrics';
import styles from './ServiceCard.module.css';

interface ServiceCardProps {
  service: HomelabService;
}

// A compact status row, not a grid of colored avatar icons - fifteen
// services read faster as a dense list than as a wall of tiles, and the
// only colour doing real work here is --good/--warn (this app's existing
// online/offline semantic, used everywhere else) - no invented per-group
// rainbow that has nothing to do with the wallpaper theme the rest of the
// app reacts to.
export function ServiceCard({ service }: ServiceCardProps) {
  const reduceMotion = useReducedMotion();
  const container = service.container;

  return (
    <button
      type="button"
      className={styles.row}
      onClick={() => window.open(service.url || `http://${service.host}:${service.port}`, '_blank', 'noopener')}
      title={service.online ? `${service.name} - online, ${formatLatency(service.ms)}` : `${service.name} - offline`}
    >
      <span className={styles.dotWrap}>
        {service.online && !reduceMotion && (
          <motion.span
            className={styles.dotRing}
            animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <span className={[styles.dot, service.online ? styles.dotOn : styles.dotOff].join(' ')} />
      </span>
      <span className={styles.name}>{service.name}</span>
      {container && <span className={[styles.tag, container.state === 'running' ? styles.tagRunning : styles.tagStopped].join(' ')}>{container.state}</span>}
      <span className={styles.latency}>{service.online ? formatLatency(service.ms) : 'offline'}</span>
    </button>
  );
}
