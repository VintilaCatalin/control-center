import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';
import { duration, ease } from '../../tokens/motion';
import styles from './Sparkline.module.css';

interface SparklineProps {
  values: number[];
  color?: string;
  min?: number;
  max?: number;
  className?: string;
}

const VIEW_W = 100;
const VIEW_H = 28;

// A live-updating inline trend line - not a static image redrawn from
// scratch each poll. The path's point COUNT never changes (the caller
// pads to a fixed length), so passing a new `d` string to the same
// <motion.path> is structurally the same curve with different
// coordinates - Framer Motion tweens between the two smoothly instead of
// snapping, which is what makes the line visibly glide as data arrives
// rather than flicker.
export function Sparkline({ values, color = 'var(--accent)', min, max, className }: SparklineProps) {
  const reduceMotion = useReducedMotion();
  const path = useMemo(() => buildPath(values, min, max), [values, min, max]);

  if (values.length < 2) return <div className={[styles.empty, className].filter(Boolean).join(' ')} />;

  return (
    <svg
      className={[styles.svg, className].filter(Boolean).join(' ')}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <motion.path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ d: path }}
        transition={{ duration: reduceMotion ? 0 : duration.base, ease }}
      />
    </svg>
  );
}

function buildPath(values: number[], min?: number, max?: number): string {
  if (values.length === 0) return '';
  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const span = hi - lo || 1;
  const stepX = VIEW_W / (values.length - 1 || 1);
  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = VIEW_H - ((v - lo) / span) * VIEW_H;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}
