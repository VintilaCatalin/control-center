import type { ReactNode } from 'react';
import { useState } from 'react';
import { useSnapshotData } from '../../api/SnapshotProvider';
import type { HardwareData, HomelabData } from '../../api/types';
import { LineChart } from '../../primitives/LineChart/LineChart';
import { StatusPulse } from '../Homelab/StatusPulse';
import styles from './SystemGlance.module.css';

type Tab = 'pc' | 'server';

function formatUptime(seconds: number | null): string | null {
  if (seconds == null) return null;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

// Tabbed: "This PC" (this machine's own psutil/pynvml/LHM numbers) and
// "Server" (the homelab box's own Netdata metrics). Both tabs are
// deliberately just temperature cards now - CPU (+ GPU on This PC, the
// homelab box has no GPU sensor) - temperature as the headline number
// (the thing that actually says whether a machine is under strain), a
// thin unfilled line for load history underneath. RAM/VRAM/disks were
// cut, not hidden - too much competing for one small Overview cell.
export function SystemGlance() {
  const { snapshot } = useSnapshotData();
  const [tab, setTab] = useState<Tab>('pc');
  const hw = snapshot?.hardware;
  const homelab = snapshot?.homelab;

  return (
    <div className={styles.glance}>
      <div className={styles.tabs}>
        <button type="button" className={[styles.tab, tab === 'pc' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('pc')}>
          This PC
        </button>
        <button type="button" className={[styles.tab, tab === 'server' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('server')}>
          Server
        </button>
      </div>

      <div className={styles.body}>
        {tab === 'pc' ? (
          hw ? (
            <PcTab hw={hw} />
          ) : (
            <div className={styles.empty}>System info unavailable.</div>
          )
        ) : homelab?.netdata?.configured ? (
          <ServerTab homelab={homelab} />
        ) : (
          <div className={styles.empty}>No homelab server configured (Settings → Integrations → Netdata).</div>
        )}
      </div>
    </div>
  );
}

// Temperature is the headline (the number that actually says "is this
// thing under strain"), the load history underneath is context, not the
// other way around.
function TempCard({ label, temp, load, chart, color, hint }: { label: string; temp: number | null; load: number | null; chart: ReactNode; color: string; hint?: string }) {
  return (
    <div className={styles.tempCard}>
      <div className={styles.tempHead}>
        <span className={styles.tempCardLabel}>{label}</span>
        {load != null && <span className={styles.tempCardLoad}>{Math.round(load)}% load</span>}
      </div>
      <div className={styles.tempReadout}>
        <span className={styles.tempValue} style={{ color }}>
          {temp != null ? Math.round(temp) : '—'}
        </span>
        <span className={styles.tempUnit}>°C</span>
      </div>
      {temp == null && hint && <span className={styles.tempHint}>{hint}</span>}
      <div className={styles.tempChart}>{chart}</div>
    </div>
  );
}

function PcTab({ hw }: { hw: HardwareData }) {
  const uptime = formatUptime(hw.uptime);
  const cpuValues = hw.cpu_history.map((p) => p.v);
  const gpuValues = hw.gpu_history.map((p) => p.v);

  return (
    <div className={styles.pcPanel}>
      <div className={styles.head}>
        <div className={styles.identity}>
          <StatusPulse online />
          <span className={styles.ip}>This machine</span>
          {uptime && <span className={styles.sshLabel}>{uptime} uptime</span>}
        </div>
      </div>

      <div className={styles.tempRow}>
        <TempCard
          label="CPU"
          temp={hw.cpu_temp}
          load={hw.cpu_history.at(-1)?.v ?? null}
          color="var(--accent)"
          chart={<LineChart series={[{ values: cpuValues, color: 'var(--accent)' }]} height={52} min={0} max={100} />}
          hint={hw.lhm === false ? 'Install LibreHardwareMonitor for CPU temp' : undefined}
        />
        <TempCard
          label="GPU"
          temp={hw.gpu_temp}
          load={hw.gpu_load}
          color="#e0a15c"
          chart={<LineChart series={[{ values: gpuValues, color: '#e0a15c' }]} height={52} min={0} max={100} />}
        />
      </div>
    </div>
  );
}

function ServerTab({ homelab }: { homelab: HomelabData }) {
  const netdata = homelab.netdata;
  const cpuValues = (netdata.cpu?.history ?? []).map((p) => p.v);

  return (
    <div className={styles.pcPanel}>
      <div className={styles.head}>
        <div className={styles.identity}>
          <StatusPulse online={homelab.ssh_online} />
          <span className={styles.ip}>{homelab.server_ip}</span>
        </div>
      </div>

      <div className={styles.tempRow}>
        <TempCard
          label="CPU"
          temp={netdata.temp?.c ?? null}
          load={netdata.cpu?.pct ?? null}
          color="var(--accent)"
          chart={<LineChart series={[{ values: cpuValues, color: 'var(--accent)' }]} height={52} min={0} max={100} />}
        />
      </div>
    </div>
  );
}
