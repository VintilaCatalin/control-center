import { motion, useReducedMotion } from 'framer-motion';
import styles from './StatusPulse.module.css';

interface StatusPulseProps {
  online: boolean;
  size?: number;
}

// Healthy breathes (a slow, quiet scale+glow loop - alive, not urgent);
// down sits flat and red-tinted with no motion at all, so a failure
// reads as "this stopped" the instant you look at it rather than
// blending into everything else that's still gently animating.
export function StatusPulse({ online, size = 8 }: StatusPulseProps) {
  const reduceMotion = useReducedMotion();
  return (
    <span className={styles.wrap} style={{ width: size, height: size }}>
      {online && !reduceMotion && (
        <motion.span
          className={styles.ring}
          animate={{ scale: [1, 2.1], opacity: [0.45, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <span className={[styles.dot, online ? styles.dotOn : styles.dotOff].join(' ')} />
    </span>
  );
}
