import type { HomelabService, Snapshot } from '../../api/types';

export type IntegrationStatus = 'connected' | 'not_connected' | 'error' | 'unknown';

export interface IntegrationDef {
  id: string;
  name: string;
  blurb: string;
  // Keys into the flattened SETTINGS_SCHEMA (server.py) this card edits -
  // the exact same fields the old app's own settings groups already
  // declare, just presented per-service instead of per-schema-group.
  keys: string[];
  // Real status, derived from whatever this integration's own collector
  // already puts in the snapshot (server.py's collect_* functions) -
  // never a second parallel health-check system.
  status: (snapshot: Snapshot | null | undefined, values: Record<string, string>) => IntegrationStatus;
  errorText?: (snapshot: Snapshot | null | undefined) => string | undefined;
  // Which settings key holds this integration's base URL, if it has one -
  // lets the card offer a real "Test connection" probe (server.py's
  // generic /api/settings/test-connection) instead of only ever trusting
  // the last collector run.
  testUrlKey?: string;
  // Local filesystem scanners (Steam/Xbox/Battle.net/Riot) rather than
  // network services - no URL to test, grouped separately so "Not
  // connected" doesn't read like a failed network call.
  local?: boolean;
}

function has(values: Record<string, string>, ...keys: string[]): boolean {
  return keys.every((k) => (values[k] ?? '').trim() !== '');
}

function gameCount(snapshot: Snapshot | null | undefined, source: string): number {
  return (snapshot?.games?.games ?? []).filter((g) => g.source === source).length;
}

function findService(snapshot: Snapshot | null | undefined, ...names: string[]): HomelabService | undefined {
  const services = snapshot?.homelab?.services ?? [];
  const lower = names.map((n) => n.toLowerCase());
  return services.find((s) => lower.some((n) => s.name.toLowerCase().includes(n)));
}

export const INTEGRATIONS: IntegrationDef[] = [
  {
    id: 'home-assistant',
    name: 'Home Assistant',
    blurb: 'Real light state and control for the Lights panel.',
    keys: ['ha_url', 'panel_lights'],
    status: (s) => (!s?.lights?.configured ? 'not_connected' : s.lights.error ? 'error' : 'connected'),
    errorText: (s) => s?.lights?.error,
    testUrlKey: 'ha_url',
  },
  {
    id: 'plex',
    name: 'Plex',
    blurb: 'Now playing, recently added and library browsing.',
    keys: ['plex_url', 'plex_token', 'plex_open', 'plex_limit'],
    status: (s) => (!s?.plex?.configured ? 'not_connected' : s.plex.error ? 'error' : 'connected'),
    errorText: (s) => s?.plex?.error ?? undefined,
    testUrlKey: 'plex_url',
  },
  {
    id: 'netdata',
    name: 'Netdata',
    blurb: 'Live host CPU, RAM, disk and network graphs on Homelab.',
    keys: ['netdata_url'],
    status: (s) => {
      const nd = s?.homelab?.netdata;
      if (!nd?.configured) return 'not_connected';
      return nd.error ? 'error' : 'connected';
    },
    errorText: (s) => s?.homelab?.netdata?.error ?? undefined,
    testUrlKey: 'netdata_url',
  },
  {
    id: 'portainer',
    name: 'Portainer',
    blurb: 'Real Docker container state for the Homelab dashboard.',
    keys: ['portainer_url', 'portainer_token', 'portainer_endpoint_id'],
    status: (s) => {
      const d = s?.homelab?.docker;
      if (!d?.configured) return 'not_connected';
      return d.error ? 'error' : 'connected';
    },
    errorText: (s) => s?.homelab?.docker?.error ?? undefined,
    testUrlKey: 'portainer_url',
  },
  {
    id: 'qbittorrent',
    name: 'qBittorrent',
    blurb: 'Active torrents and throughput on the Downloads panel.',
    keys: ['qbit_url', 'qbit_user', 'qbit_pass'],
    status: (s) => {
      const d = s?.downloads;
      if (!d?.configured) return 'not_connected';
      return d.error ? 'error' : 'connected';
    },
    errorText: (s) => s?.downloads?.error ?? undefined,
    testUrlKey: 'qbit_url',
  },
  {
    id: 'sonarr',
    name: 'Sonarr',
    blurb: 'Upcoming TV episodes for the Homelab calendar.',
    keys: ['sonarr_url', 'sonarr_key'],
    status: (_s, v) => (has(v, 'sonarr_url', 'sonarr_key') ? 'connected' : 'not_connected'),
    testUrlKey: 'sonarr_url',
  },
  {
    id: 'radarr',
    name: 'Radarr',
    blurb: 'Upcoming movie releases for the Homelab calendar.',
    keys: ['radarr_url', 'radarr_key'],
    status: (_s, v) => (has(v, 'radarr_url', 'radarr_key') ? 'connected' : 'not_connected'),
    testUrlKey: 'radarr_url',
  },
  {
    id: 'overseerr',
    name: 'Overseerr',
    blurb: 'Top Wanted movies and shows on Homelab.',
    keys: ['overseerr_url', 'overseerr_key'],
    status: (s) => (!s?.popular?.configured ? 'not_connected' : s.popular.error ? 'error' : 'connected'),
    errorText: (s) => s?.popular?.error ?? undefined,
    testUrlKey: 'overseerr_url',
  },
  {
    id: 'immich',
    name: 'Immich',
    blurb: 'The rotating Random Photo panel on Homelab.',
    keys: ['immich_url', 'immich_key', 'immich_album'],
    status: (s) => (!s?.photo?.configured ? 'not_connected' : s.photo.error ? 'error' : 'connected'),
    errorText: (s) => s?.photo?.error ?? undefined,
    testUrlKey: 'immich_url',
  },
  {
    id: 'steamgriddb',
    name: 'SteamGridDB',
    blurb: 'Cover art for Diablo, League and VALORANT in Games.',
    keys: ['griddb_key'],
    status: (_s, v) => (has(v, 'griddb_key') ? 'connected' : 'not_connected'),
  },
  {
    id: 'wallhaven',
    name: 'Wallhaven',
    blurb: 'Wallpaper search on Scene - only needed for NSFW results.',
    keys: ['wallhaven_key'],
    status: (_s, v) => (has(v, 'wallhaven_key') ? 'connected' : 'not_connected'),
  },
  {
    id: 'calendar',
    name: 'Calendar (ICS)',
    blurb: 'Your calendar feed on Overview.',
    keys: ['calendar_ics'],
    status: (s, v) => {
      if (!has(v, 'calendar_ics')) return 'not_connected';
      const cal = s?.calendar as { error?: string } | undefined;
      return cal?.error ? 'error' : 'connected';
    },
    errorText: (s) => (s?.calendar as { error?: string } | undefined)?.error,
    testUrlKey: 'calendar_ics',
  },
  {
    id: 'lhm',
    name: 'LibreHardwareMonitor',
    blurb: 'The only way this app can read real CPU temperature on Windows.',
    keys: ['lhm_url'],
    status: (s) => {
      const hw = s?.hardware as { cpu_temp?: number | null; lhm?: string } | undefined;
      if (!hw) return 'unknown';
      return hw.cpu_temp != null ? 'connected' : 'not_connected';
    },
    testUrlKey: 'lhm_url',
  },
  {
    id: 'steam',
    name: 'Steam',
    blurb: 'Installed Steam library, playtime and cover art in Games.',
    keys: ['steam_path'],
    status: (s, v) => {
      if (!has(v, 'steam_path')) return 'not_connected';
      return gameCount(s, 'steam') > 0 ? 'connected' : 'error';
    },
    errorText: (s) => (gameCount(s, 'steam') === 0 ? 'No games found in that folder.' : undefined),
    local: true,
  },
  {
    id: 'xbox',
    name: 'Xbox app games',
    blurb: 'Games installed through the Xbox app, in Games.',
    keys: ['xbox_enabled'],
    status: (s, v) => {
      if (v.xbox_enabled !== 'true') return 'not_connected';
      return gameCount(s, 'xbox') > 0 ? 'connected' : 'error';
    },
    errorText: (s) => (gameCount(s, 'xbox') === 0 ? 'Enabled, but no Xbox app games were found.' : undefined),
    local: true,
  },
  {
    id: 'battlenet',
    name: 'Battle.net',
    blurb: 'Battle.net library games, in Games.',
    keys: ['battlenet_enabled', 'battlenet_paths'],
    status: (s, v) => {
      if (v.battlenet_enabled !== 'true') return 'not_connected';
      return gameCount(s, 'battlenet') > 0 ? 'connected' : 'error';
    },
    errorText: (s) => (gameCount(s, 'battlenet') === 0 ? 'Enabled, but no Battle.net games were found in that folder.' : undefined),
    local: true,
  },
  {
    id: 'riot',
    name: 'Riot Games',
    blurb: 'League of Legends, VALORANT and other Riot titles, in Games.',
    keys: ['riot_enabled', 'riot_paths'],
    status: (s, v) => {
      if (v.riot_enabled !== 'true') return 'not_connected';
      return gameCount(s, 'riot') > 0 ? 'connected' : 'error';
    },
    errorText: (s) => (gameCount(s, 'riot') === 0 ? 'Enabled, but no Riot games were found in that folder.' : undefined),
    local: true,
  },
  {
    id: 'notes-folder',
    name: 'Notes',
    blurb: 'The folder of Markdown files Notes reads and writes.',
    keys: ['notes_dir'],
    status: (s) => (!s?.notes?.configured ? 'not_connected' : s.notes.error ? 'error' : 'connected'),
    errorText: (s) => s?.notes?.error,
    local: true,
  },
  {
    id: 'wallpapers-folder',
    name: 'Wallpapers',
    blurb: 'The folder Scene\'s Yours library browses and applies from.',
    keys: ['wallpaper_dir'],
    status: (s) => (!s?.wallpapers?.configured ? 'not_connected' : s.wallpapers.error ? 'error' : 'connected'),
    errorText: (s) => s?.wallpapers?.error,
    local: true,
  },
];

// AdGuard Home / Nginx Proxy Manager have no dedicated API integration in
// this app (server.py never authenticates to either - see the Homelab
// session notes on why: AdGuard needs a session login, NPM needs a JWT,
// neither has stored credentials here). They only ever show up as a plain
// TCP-probed row in the Services list, same as any other homelab box - so
// their "status" is real, just sourced from that probe instead of a
// dedicated collector.
export const PROBE_ONLY_INTEGRATIONS = [
  { id: 'adguard', name: 'AdGuard Home', match: ['adguard'] },
  { id: 'npm', name: 'Nginx Proxy Manager', match: ['nginx proxy', 'npm'] },
];

export function probeStatus(snapshot: Snapshot | null | undefined, match: string[]): { status: IntegrationStatus; ms: number | null } {
  const svc = findService(snapshot, ...match);
  if (!svc) return { status: 'unknown', ms: null };
  return { status: svc.online ? 'connected' : 'error', ms: svc.ms };
}
