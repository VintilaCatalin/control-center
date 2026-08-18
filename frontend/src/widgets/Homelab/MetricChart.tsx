import { animate, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MetricPoint } from '../../api/types';
import { formatRelative } from './metrics';
import styles from './MetricChart.module.css';

export interface MetricSeries {
  points: MetricPoint[];
  color: string;
  fill?: boolean;
  label?: string;
}

interface MetricChartProps {
  series: MetricSeries[];
  unit?: string;
  percent?: boolean;
  decimals?: number;
  height?: number;
}

// A fixed number of bars regardless of how many raw samples Netdata
// returned (60-90) - every chart in this panel animates the same number
// of bars, which is what makes them read as one consistent instrument
// instead of a wall of hairline detail.
const BAR_COUNT = 26;
const SPRING = { type: 'spring', stiffness: 170, damping: 20 } as const;

function useAnimatedNumber(value: number) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration: 0.6,
      ease: [0.22, 0.68, 0.18, 1],
      onUpdate: setDisplay,
    });
    prev.current = value;
    return () => controls.stop();
  }, [value]);
  return display;
}

// Average a raw sample array down into BAR_COUNT buckets - real history
// (60-90 points) collapses to fewer, more legible bars rather than a
// hairline per sample. Short histories are left-padded with their first
// value so a chart never looks like it's missing bars.
function bucketize(values: (number | null)[], n: number): number[] {
  const clean = values.map((v) => v ?? 0);
  if (clean.length === 0) return new Array(n).fill(0);
  if (clean.length <= n) return new Array(n - clean.length).fill(clean[0]).concat(clean);
  const out: number[] = [];
  const bucketSize = clean.length / n;
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
    const slice = clean.slice(start, end);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}

// A bar histogram, not a line - each bar springs to its new height
// independently on every poll, which is what makes this read as smooth,
// continuous motion instead of a whole path re-drawing itself every few
// seconds. Two series render as a mirrored pair growing away from a
// shared centre line (down/up, read/write) instead of two overlapping
// lines fighting for the same space.
export function MetricChart({ series, unit = '', percent = false, decimals = 0, height = 180 }: MetricChartProps) {
  const reduceMotion = useReducedMotion();

  const chart = useMemo(() => {
    const lines = series
      .map((s) => ({ ...s, values: s.points.map((p) => p.v) }))
      .filter((s) => s.values.some((v) => v != null && !Number.isNaN(v)));
    if (lines.length === 0) return null;

    const allValues = lines.flatMap((l) => l.values).filter((v): v is number => v != null && !Number.isNaN(v));
    if (allValues.length === 0) return null;
    const dataMax = Math.max(...allValues, 0);
    const ceiling = percent ? 100 : dataMax * 1.2 || 1;

    const built = lines.map((l) => ({
      bars: bucketize(l.values, BAR_COUNT).map((v) => Math.max(3, Math.min(100, (v / ceiling) * 100))),
      color: l.color,
      label: l.label,
      current: l.values[l.values.length - 1] ?? 0,
    }));

    const oldestT = series.find((s) => s.points.length > 0)?.points[0]?.t;
    return { built, oldestT };
  }, [series, percent]);

  const primary = chart?.built[0]?.current ?? 0;
  const animatedPrimary = useAnimatedNumber(primary);

  if (!chart) {
    return <div className={styles.empty}>Collecting…</div>;
  }

  const dual = chart.built.length > 1;

  return (
    <div className={styles.wrap}>
      <div className={styles.readout}>
        <span className={styles.readoutValue} style={{ color: chart.built[0].color }}>
          {animatedPrimary.toFixed(decimals)}
          <span className={styles.readoutUnit}>{unit}</span>
        </span>
        {dual && (
          <div className={styles.legend}>
            {chart.built.map((l, i) => (
              <span key={i} className={styles.legendItem} style={{ color: l.color }}>
                <span className={styles.legendDot} style={{ background: l.color }} />
                {l.label ?? ''} {l.current.toFixed(decimals)}
                {unit}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className={styles.bars} style={{ height }}>
        <div className={[styles.barsHalf, styles.barsUp].join(' ')}>
          {chart.built[0].bars.map((pct, i) => (
            <motion.div
              key={i}
              className={styles.bar}
              style={{ background: chart.built[0].color }}
              initial={false}
              animate={{ height: `${pct}%` }}
              transition={reduceMotion ? { duration: 0 } : SPRING}
            />
          ))}
        </div>
        {dual && (
          <>
            <div className={styles.centerLine} />
            <div className={[styles.barsHalf, styles.barsDown].join(' ')}>
              {chart.built[1].bars.map((pct, i) => (
                <motion.div
                  key={i}
                  className={styles.bar}
                  style={{ background: chart.built[1].color }}
                  initial={false}
                  animate={{ height: `${pct}%` }}
                  transition={reduceMotion ? { duration: 0 } : SPRING}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className={styles.xLabels}>
        <span>{formatRelative(chart.oldestT ?? null)}</span>
        <span>now</span>
      </div>
    </div>
  );
}
