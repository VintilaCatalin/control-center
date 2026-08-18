import type { CSSProperties } from 'react';
import type { DockerData, NetdataMetric, NetdataTemp } from '../../api/types';
import { MetricChart } from './MetricChart';
import { StatusPulse } from './StatusPulse';
import { formatLatency } from './metrics';
import styles from './HostCpu.module.css';

interface HostCpuProps {
  serverIp: string;
  sshOnline: boolean;
  sshMs: number | null;
  up: number;
  count: number;
  docker: DockerData;
  cpu?: NetdataMetric;
  temp?: NetdataTemp;
  color?: string;
}

// CPU load and CPU temperature are the same physical thing at two angles -
// one panel, not two, with the package sensor reading sitting right next
// to the identity row it actually describes. The bar histogram below is
// this panel's own chart language; RAM/Network/Storage each use a
// different one on purpose, not a shared "line chart" reused everywhere.
export function HostCpu({ serverIp, sshOnline, sshMs, up, count, docker, cpu, temp, color = 'var(--accent)' }: HostCpuProps) {
  return (
    <div className={styles.panel} style={{ '--metric-color': color } as CSSProperties}>
      <div className={styles.head}>
        <div className={styles.identity}>
          <StatusPulse online={sshOnline} size={8} />
          <span className={styles.ip}>{serverIp}</span>
          <span className={styles.sshLabel}>{sshOnline ? formatLatency(sshMs) : 'unreachable'}</span>
        </div>
        <div className={styles.pills}>
          {temp?.c != null && <span className={styles.tempPill}>{Math.round(temp.c)}° CPU</span>}
          <span className={styles.pill}>
            {up}/{count} online
          </span>
          {docker.configured && (
            <span className={styles.pill}>
              {docker.running}/{docker.total} containers
            </span>
          )}
        </div>
      </div>

      <div className={styles.chart}>
        {cpu ? (
          <MetricChart series={[{ points: cpu.history, color }]} unit="%" percent decimals={0} />
        ) : (
          <div className={styles.empty}>Host metrics not connected.</div>
        )}
      </div>
    </div>
  );
}
