import type { DownloadsData, HomelabHistory } from '../../api/types';
import { formatEta, formatSpeed } from './metrics';
import { MetricChart } from './MetricChart';
import styles from './Downloads.module.css';

interface DownloadsProps {
  data?: DownloadsData;
  history: HomelabHistory;
}

// The full qBittorrent picture - every active torrent, plus a real
// throughput history chart (server.py's own ring buffer). No outer Card
// here - PanelGrid's own panel chrome already provides the card surface
// and the "Downloads" label, so this only ever renders its own content.
export function Downloads({ data, history }: DownloadsProps) {
  if (!data?.configured) {
    return (
      <div className={styles.state}>
        <span className={styles.stateTitle}>qBittorrent isn't connected</span>
        <span className={styles.stateBody}>Add a Web UI URL in Settings to see active downloads here.</span>
      </div>
    );
  }

  const hasThroughput = history.qbit_dl.some((p) => p.v > 0) || history.qbit_up.some((p) => p.v > 0);

  return (
    <div className={styles.panel}>
      <div className={styles.chart}>
        {hasThroughput ? (
          <MetricChart
            series={[
              { points: history.qbit_dl.map((p) => ({ t: p.t, v: p.v / 1024 })), color: 'var(--accent)', fill: true, label: 'down' },
              { points: history.qbit_up.map((p) => ({ t: p.t, v: p.v / 1024 })), color: 'color-mix(in oklab, var(--accent) 55%, white 30%)', label: 'up' },
            ]}
            unit=" KB/s"
            decimals={0}
          />
        ) : (
          <div className={styles.chartEmpty}>
            <span>No throughput yet</span>
            <span className={styles.chartEmptySub}>
              ↓ {formatSpeed(data.dl ?? 0)} · ↑ {formatSpeed(data.up ?? 0)}
            </span>
          </div>
        )}
      </div>

      {data.torrents.length === 0 ? (
        <div className={styles.empty}>Nothing downloading right now.</div>
      ) : (
        <div className={styles.list}>
          {data.torrents.map((t, i) => (
            <div className={styles.row} key={i}>
              <div className={styles.rowHead}>
                <span className={styles.name}>{t.name}</span>
                <span className={styles.pct}>{t.progress.toFixed(0)}%</span>
              </div>
              <div className={styles.bar}>
                <div className={styles.barFill} style={{ width: `${t.progress}%` }} />
              </div>
              <div className={styles.rowStats}>
                <span>↓ {formatSpeed(t.dl)}</span>
                <span>↑ {formatSpeed(t.up)}</span>
                {formatEta(t.eta) && <span>{formatEta(t.eta)} left</span>}
                {t.category && <span className={styles.category}>{t.category}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
