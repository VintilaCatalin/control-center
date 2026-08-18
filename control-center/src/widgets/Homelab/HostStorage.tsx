import type { DiskIoMetric, DiskSpaceMetric } from '../../api/types';
import { RadialGauge } from '../../primitives/RadialGauge/RadialGauge';
import { MetricChart } from './MetricChart';
import styles from './HostStorage.module.css';

interface HostStorageProps {
  disks: DiskSpaceMetric[];
  diskIo: DiskIoMetric[];
  driveColors?: string[];
  ioColors?: [string, string];
}

const DEFAULT_DISK_TONES = [
  'var(--accent)',
  'color-mix(in oklab, var(--accent) 70%, white 20%)',
  'color-mix(in oklab, var(--accent) 70%, black 20%)',
  'color-mix(in oklab, var(--accent) 45%, white 40%)',
];

function shortMount(mount: string): string {
  if (mount === '/') return 'root';
  return mount.replace(/^\//, '');
}

function formatGb(gb: number): string {
  return gb >= 1024 ? `${(gb / 1024).toFixed(1)} TB` : `${Math.round(gb)} GB`;
}

function formatKib(kibs: number): string {
  return kibs >= 1024 ? `${(kibs / 1024).toFixed(1)} MiB/s` : `${Math.round(kibs)} KiB/s`;
}

// Its own full panel now, not a strip squeezed under CPU - every real
// mounted drive gets a ring (capacity is what matters for a drive, the
// same reasoning RAM's ring uses), and every device with real read/write
// activity gets a line here instead of only the single busiest one.
export function HostStorage({
  disks,
  diskIo,
  driveColors = DEFAULT_DISK_TONES,
  ioColors = ['var(--accent)', 'color-mix(in oklab, var(--accent) 55%, white 30%)'],
}: HostStorageProps) {
  if (disks.length === 0 && diskIo.length === 0) {
    return (
      <div className={styles.empty}>
        <span>No drives reported by Netdata yet.</span>
      </div>
    );
  }

  const [primaryIo, ...restIo] = diskIo;

  return (
    <div className={styles.panel}>
      {disks.length > 0 && (
        <div className={styles.drives}>
          {disks.map((d, i) => (
            <div className={styles.drive} key={d.mount}>
              <RadialGauge pct={d.pct} color={driveColors[i % driveColors.length]} size={72} strokeWidth={6}>
                <span className={styles.drivePct}>{d.pct != null ? Math.round(d.pct) : '—'}%</span>
              </RadialGauge>
              <span className={styles.driveMount}>{shortMount(d.mount)}</span>
              <span className={styles.driveSize}>{d.used_gb != null ? `${formatGb(d.used_gb)} / ${formatGb(d.total_gb ?? 0)}` : '—'}</span>
            </div>
          ))}
        </div>
      )}

      {primaryIo && (
        <div className={styles.io}>
          <div className={styles.ioHead}>
            <span className={styles.ioLabel}>Disk I/O · {primaryIo.device}</span>
            <span className={styles.ioStats}>
              read {formatKib(primaryIo.read_kibs)} · write {formatKib(primaryIo.write_kibs)}
            </span>
          </div>
          <div className={styles.ioChart}>
            <MetricChart
              series={[
                { points: primaryIo.history.map((p) => ({ t: p.t, v: p.read })), color: ioColors[0], label: 'read' },
                { points: primaryIo.history.map((p) => ({ t: p.t, v: p.write })), color: ioColors[1], label: 'write' },
              ]}
              unit=" KiB/s"
              decimals={0}
              height={100}
            />
          </div>
          {restIo.length > 0 && (
            <div className={styles.ioOthers}>
              {restIo.map((d) => (
                <span key={d.device} className={styles.ioOther}>
                  {d.device}: read {formatKib(d.read_kibs)} · write {formatKib(d.write_kibs)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
