import styles from './StatusPulse.module.css';

interface StatusPulseProps {
  online: boolean;
  size?: number;
}

// Keep this status indicator static. It appears on the default Overview
// screen, which also contains several large glass/backdrop-filter surfaces.
// An infinite Framer Motion animation here kept Chromium's compositor awake
// at display-frame rate, even while the dashboard was otherwise idle.
export function StatusPulse({ online, size = 8 }: StatusPulseProps) {
  return (
    <span className={styles.wrap} style={{ width: size, height: size }}>
      <span className={[styles.dot, online ? styles.dotOn : styles.dotOff].join(' ')} />
    </span>
  );
}
