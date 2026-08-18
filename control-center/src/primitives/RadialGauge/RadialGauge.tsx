import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { duration, ease } from '../../tokens/motion';
import styles from './RadialGauge.module.css';

interface RadialGaugeProps {
  pct: number | null;
  color?: string;
  size?: number;
  strokeWidth?: number;
  children?: ReactNode;
}

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// An animated arc, not a static ring redrawn each poll - strokeDashoffset
// is a plain number, so Framer Motion tweens it natively every time `pct`
// changes, which is what makes the gauge visibly sweep to its new value
// instead of jumping. `null` (not yet connected / no data) renders an
// empty track, never a fabricated value.
export function RadialGauge({ pct, color = 'var(--accent)', size = 96, strokeWidth = 7, children }: RadialGaugeProps) {
  const reduceMotion = useReducedMotion();
  const clamped = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const offset = CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <div className={styles.wrap} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 96 96" className={styles.svg}>
        <circle cx={48} cy={48} r={RADIUS} fill="none" stroke="var(--rim)" strokeWidth={strokeWidth} />
        {pct !== null && (
          <motion.circle
            cx={48}
            cy={48}
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            transform="rotate(-90 48 48)"
            initial={false}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: reduceMotion ? 0 : duration.slow, ease }}
          />
        )}
      </svg>
      <div className={styles.center}>{children}</div>
    </div>
  );
}
