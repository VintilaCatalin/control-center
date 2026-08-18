// Small relative-time formatter shared by every Reading card/detail view -
// no existing utility in the codebase does this, and it's used by more
// than one component (ReadingCard now, VideoCard/ArticleDetail later).
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
