// Same small relative-time formatter Reading uses (widgets/Reading/time.ts) -
// duplicated rather than imported cross-widget, since it's a tiny
// self-contained utility and each widget owning its own copy avoids a
// dependency edge that doesn't otherwise exist between Games and Reading.
export function relativeTime(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return '';
  const deltaMs = Date.now() - unixSeconds * 1000;
  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}
