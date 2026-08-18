import { useSnapshotData } from '../api/SnapshotProvider';
import { type PanelDef, PanelGrid } from '../primitives/PanelGrid/PanelGrid';
import { Skeleton } from '../primitives/Skeleton/Skeleton';
import { Downloads } from '../widgets/Homelab/Downloads';
import { HostCpu } from '../widgets/Homelab/HostCpu';
import { HostNetwork } from '../widgets/Homelab/HostNetwork';
import { HostRam } from '../widgets/Homelab/HostRam';
import { HostStorage } from '../widgets/Homelab/HostStorage';
import { Lights } from '../widgets/Homelab/Lights';
import { RandomPhoto } from '../widgets/Homelab/RandomPhoto';
import { ServiceStatus } from '../widgets/Homelab/ServiceStatus';
import { TopWanted } from '../widgets/Homelab/TopWanted';
import { useMetricPalette } from '../widgets/Homelab/useMetricPalette';
import styles from './Homelab.module.css';

// Homelab is entirely panels now - no fixed hero composition of its own.
// Every surface here is independently movable/resizable/hideable through
// the same PanelGrid every other view uses (see server.py's
// DEFAULT_LAYOUTS["homelab"]). Panel sizes/order below are only the
// *defaults* a fresh install sees; PanelGrid persists whatever the user
// actually arranges. Composition is deliberately uneven on purpose - a
// cinematic photo, a chart-forward metrics panel, poster rails, a dense
// compact service field - not a grid of identically-shaped cards. Plex
// itself already has its own full app section, so Homelab doesn't
// duplicate a Now Playing surface here.
export function Homelab() {
  const { snapshot } = useSnapshotData();
  const homelab = snapshot?.homelab;
  const palette = useMetricPalette();

  if (!homelab) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingGrid}>
          <Skeleton height={320} radius={24} />
          <Skeleton height={320} radius={24} />
          <Skeleton height={220} radius={24} />
          <Skeleton height={220} radius={24} />
        </div>
      </div>
    );
  }

  // Homelab is entirely optional and personal - on a fresh install with
  // none of it set up, nine individually-empty panels (each correctly
  // saying "not connected" on its own) still reads as a broken page, not
  // an honest one. One combined "nothing set up yet" screen only shows
  // once every single thing this view could surface is unconfigured; the
  // moment any one of them is real, the normal grid comes back exactly as
  // it always has; still-unconfigured panels within it keep their own
  // per-panel empty states, since choosing to connect one thing doesn't
  // mean you've configured everything else.
  const anyHomelabConfigured =
    Boolean(snapshot?.photo?.configured) ||
    Boolean(snapshot?.popular?.configured) ||
    Boolean(homelab.netdata?.configured) ||
    Boolean(homelab.docker?.configured) ||
    Boolean(snapshot?.downloads?.configured) ||
    Boolean(snapshot?.lights?.configured) ||
    homelab.services.length > 0;

  if (!anyHomelabConfigured) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <h1 className={styles.emptyTitle}>Set up your Homelab</h1>
          <p className={styles.emptyBody}>
            This is entirely optional - Control Center works fine without it. Connect Netdata, Portainer, Plex, Immich,
            Overseerr, qBittorrent, or Home Assistant lighting from Settings → Integrations to start seeing real data here.
          </p>
        </div>
      </div>
    );
  }

  const panels: PanelDef[] = [
    {
      id: 'hl-photo',
      label: 'Random Photo',
      bleed: true,
      content: <RandomPhoto data={snapshot?.photo} />,
    },
    {
      id: 'hl-wanted',
      label: 'Top Wanted',
      content: <TopWanted data={snapshot?.popular} />,
    },
    {
      id: 'hl-cpu',
      label: 'CPU',
      content: (
        <HostCpu
          serverIp={homelab.server_ip}
          sshOnline={homelab.ssh_online}
          sshMs={homelab.ssh_ms}
          up={homelab.up}
          count={homelab.count}
          docker={homelab.docker}
          cpu={homelab.netdata.cpu}
          temp={homelab.netdata.temp}
          color={palette.cpu}
        />
      ),
    },
    {
      id: 'hl-ram',
      label: 'RAM',
      content: <HostRam ram={homelab.netdata.ram} color={palette.ram} />,
    },
    {
      id: 'hl-network',
      label: 'Network',
      content: <HostNetwork net={homelab.netdata.net} colors={palette.network} />,
    },
    {
      id: 'hl-storage',
      label: 'Storage',
      content: (
        <HostStorage
          disks={homelab.netdata.disks ?? []}
          diskIo={homelab.netdata.disk_io ?? []}
          driveColors={palette.disks}
          ioColors={palette.storage}
        />
      ),
    },
    {
      id: 'hl-downloads',
      label: 'Downloads',
      content: <Downloads data={snapshot?.downloads} history={homelab.history} />,
    },
    {
      id: 'hl-lights',
      label: 'Lights',
      content: <Lights data={snapshot?.lights} />,
    },
    {
      id: 'hl-services',
      label: 'Services',
      content: <ServiceStatus services={homelab.services} up={homelab.up} count={homelab.count} />,
    },
  ];

  return (
    <div className={styles.page}>
      <PanelGrid view="homelab" panels={panels} fallbackSize={{ w: 3, h: 5 }} />
    </div>
  );
}
