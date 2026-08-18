import { motion } from 'framer-motion';
import type { PlexItem } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import { duration, ease } from '../../tokens/motion';
import { CheckIcon, MovieIcon, PlayIcon } from './icons';
import styles from './PlexTile.module.css';

interface PlexTileProps {
  item: PlexItem;
  onSelect: (item: PlexItem) => void;
}

function episodeLabel(item: PlexItem): string | null {
  if (item.type !== 'episode') return null;
  if (item.parentIndex != null && item.index != null) return `S${item.parentIndex} · E${item.index}`;
  if (item.index != null) return `E${item.index}`;
  return null;
}

// The poster grid tile - library rails and the full library grid both
// use this. Portrait art, primary click opens the detail surface (per
// the product spec: selecting a poster never launches directly).
// Continue Watching's own cards (featured + supporting) live in
// ContinueWatchingRow now, not here - they needed a fixed-height,
// non-16:9 composition this component's aspect-locked model doesn't fit.
export function PlexTile({ item, onSelect }: PlexTileProps) {
  const title = item.type === 'episode' ? item.show || item.title : item.title;
  const sub = item.type === 'episode' ? episodeLabel(item) || item.title : item.year ? String(item.year) : null;

  const progress =
    item.duration && item.duration > 0 && item.viewOffset
      ? Math.min(100, Math.max(0, (item.viewOffset / item.duration) * 100))
      : 0;
  const watched = !!item.viewCount && !item.viewOffset;

  return (
    <motion.div
      className={styles.tile}
      whileHover={{ y: -4, transition: { duration: duration.base, ease } }}
      whileTap={{ scale: 0.97, transition: { duration: duration.fast, ease } }}
      onClick={() => onSelect(item)}
      role="button"
      tabIndex={0}
      title={title ?? undefined}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(item)}
    >
      <ArtTile
        aspect="portrait"
        src={item.art}
        alt={title ?? 'Untitled'}
        fallback={<MovieIcon />}
        badge={
          watched ? (
            <span className={styles.watchedBadge}>
              <CheckIcon />
            </span>
          ) : undefined
        }
      />
      <div className={styles.shade} />
      <div className={styles.playOverlay}>
        <PlayIcon />
      </div>
      <div className={styles.meta}>
        <span className={styles.title}>{title}</span>
        {sub && <span className={styles.sub}>{sub}</span>}
      </div>
      {progress > 0 && (
        <div className={styles.progress}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
      )}
    </motion.div>
  );
}
