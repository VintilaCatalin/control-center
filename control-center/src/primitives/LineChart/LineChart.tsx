import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';
import { duration, ease } from '../../tokens/motion';
import styles from './LineChart.module.css';

interface Series {
  values: number[];
  color: string;
  fill?: boolean;
}

interface LineChartProps {
  series: Series[];
  height?: number;
  min?: number;
  max?: number;
}

const VIEW_W = 300;

// The wide history-strip chart (CPU/RAM/network over the last window) -
// same live-tween mechanism as Sparkline (see its own comment for why a
// fixed point count lets Framer Motion glide `d` between polls instead of
// snapping), just bigger and able to layer more than one series for
// paired metrics like network in/out. A filled series gets a soft
// gradient wash under its line - reserved for the "primary" metric in a
// chart so the eye lands on one line first, not a stack of equally loud
// ones.
export function LineChart({ series, height = 120, min, max }: LineChartProps) {
  const reduceMotion = useReducedMotion();
  const bounds = useMemo(() => {
    if (min !== undefined && max !== undefined) return { lo: min, hi: max };
    const all = series.flatMap((s) => s.values);
    if (all.length === 0) return { lo: 0, hi: 1 };
    const lo = Math.min(0, ...all);
    const hi = Math.max(...all) || 1;
    return { lo, hi };
  }, [series, min, max]);

  const hasData = series.some((s) => s.values.length >= 2);

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {!hasData && <line x1={0} y1={height - 1} x2={VIEW_W} y2={height - 1} className={styles.baseline} />}
      {series.map((s, i) => {
        if (s.values.length < 2) return null;
        const linePath = buildPath(s.values, bounds.lo, bounds.hi, height);
        const areaPath = s.fill ? `${linePath} L${VIEW_W},${height} L0,${height} Z` : null;
        return (
          <g key={i}>
            {areaPath && (
              <motion.path
                d={areaPath}
                fill={`url(#lc-fill-${i})`}
                stroke="none"
                initial={false}
                animate={{ d: areaPath }}
                transition={{ duration: reduceMotion ? 0 : duration.base, ease }}
              />
            )}
            <motion.path
              d={linePath}
              fill="none"
              stroke={s.color}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ d: linePath }}
              transition={{ duration: reduceMotion ? 0 : duration.base, ease }}
            />
            {s.fill && (
              <defs>
                <linearGradient id={`lc-fill-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              </defs>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function buildPath(values: number[], lo: number, hi: number, height: number): string {
  const span = hi - lo || 1;
  const stepX = VIEW_W / (values.length - 1 || 1);
  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - lo) / span) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}
