import type { NetdataNet } from '../../api/types';
import { MetricChart } from './MetricChart';
import styles from './HostNetwork.module.css';

interface HostNetworkProps {
  net?: NetdataNet;
  colors?: [string, string];
}

// Down/up as a mirrored pair growing away from a shared centre line - the
// one chart shape in this whole screen that's genuinely bidirectional,
// because throughput genuinely is (traffic in one direction isn't "more
// of the same thing" traffic in the other direction is).
export function HostNetwork({ net, colors = ['var(--accent)', 'color-mix(in oklab, var(--accent) 55%, white 30%)'] }: HostNetworkProps) {
  if (!net) {
    return (
      <div className={styles.empty}>
        <span>Host metrics not connected.</span>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <MetricChart
        series={[
          { points: net.history.map((p) => ({ t: p.t, v: p.in })), color: colors[0], label: 'down' },
          { points: net.history.map((p) => ({ t: p.t, v: p.out })), color: colors[1], label: 'up' },
        ]}
        unit=" Kb/s"
        decimals={0}
      />
    </div>
  );
}
