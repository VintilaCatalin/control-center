import type { MetricPoint } from '../../api/types';

// Every chart in Homelab needs a FIXED point count across renders - see
// Sparkline/LineChart's own comments for why (Framer Motion tweens `d`
// between two paths of matching structure; a length that changes would
// snap instead of glide). Ring buffers grow from empty at backend start,
// so early on there are fewer real samples than `length` - padded by
// repeating the oldest known value, not zero, so a freshly-started graph
// reads as "flat at the current value" rather than a fake crash to zero.
export function padValues(points: MetricPoint[], length: number): number[] {
  if (length <= 0) return [];
  if (points.length === 0) return new Array(length).fill(0);
  const values = points.slice(-length).map((p) => p.v);
  if (values.length >= length) return values;
  return [...new Array(length - values.length).fill(values[0]), ...values];
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function formatKbps(kbps: number): string {
  if (kbps < 1000) return `${kbps.toFixed(0)} Kb/s`;
  return `${(kbps / 1000).toFixed(1)} Mb/s`;
}

export function formatLatency(ms: number | null): string {
  if (ms === null) return '—';
  return `${Math.round(ms)} ms`;
}

// Homelab-local, not Reading's relativeTime: this one also has to handle
// FUTURE timestamps (Sonarr/Radarr's forward-looking calendar), which
// Reading's feed-only formatter never needs to.
export function formatRelative(unixSeconds: number | null): string {
  if (!unixSeconds) return '';
  const deltaMs = unixSeconds * 1000 - Date.now();
  const future = deltaMs > 0;
  const minutes = Math.round(Math.abs(deltaMs) / 60000);
  let text: string;
  if (minutes < 1) return 'now';
  else if (minutes < 60) text = `${minutes}m`;
  else if (minutes < 1440) text = `${Math.round(minutes / 60)}h`;
  else if (minutes < 10080) text = `${Math.round(minutes / 1440)}d`;
  else text = `${Math.round(minutes / 10080)}w`;
  return future ? `in ${text}` : `${text} ago`;
}

export function formatEta(seconds: number | null): string | null {
  if (seconds === null || seconds < 0) return null;
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}
