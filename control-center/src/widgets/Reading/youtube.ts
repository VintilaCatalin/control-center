// Shared by VideoCard and VideoDetail - the video-specific bits that
// aren't just "a ReadingItem field."

// Handles watch/shorts/youtu.be link shapes - whichever form _feed_items()
// happened to hand back for a given video.
export function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1) || null;
    const v = u.searchParams.get('v');
    if (v) return v;
    const shorts = u.pathname.match(/\/shorts\/([^/?]+)/);
    if (shorts) return shorts[1];
    return null;
  } catch {
    return null;
  }
}

// duration_seconds is reserved but always null today - YouTube's RSS feed
// carries no duration and there's no API key to fetch it (see
// server.py's _normalize_reading_item). This only ever renders once that
// gap is closed; never fabricated in the meantime.
export function formatDuration(seconds?: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const totalMinutes = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
