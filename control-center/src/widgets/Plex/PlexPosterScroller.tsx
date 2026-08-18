import { motion } from 'framer-motion';
import type { PlexItem } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import { duration, ease } from '../../tokens/motion';
import { CheckIcon, MovieIcon, PlayIcon } from './icons';
import styles from './PlexPosterScroller.module.css';

interface PlexPosterScrollerProps {
  items: PlexItem[];
  onSelect: (item: PlexItem) => void;
}

// The bare poster-rail content for a Plex library panel - title/See all
// chrome comes from PanelGrid's own panel header now (see PlexHome.tsx),
// not duplicated here. Same "one horizontally-scrolling row inside a
// PanelGrid panel" pattern Favorites already uses (panelBody itself is
// overflow-x: hidden; the scroller handles its own horizontal overflow).
//
// Deliberately doesn't reuse PlexTile - Home's rails want the artwork
// itself to be the information (no title/year caption, no permanent
// bottom gradient holding text), larger and denser than the full
// library grid's own tiles, which still show captions. Hover still
// reveals the play affordance; nothing textual ever appears below the
// cover, on hover or at rest.
export function PlexPosterScroller({ items, onSelect }: PlexPosterScrollerProps) {
  return (
    <div className={styles.scroller}>
      {items.map((item, i) => (
        <div className={styles.posterSlot} key={item.ratingKey ?? `${item.title}-${i}`}>
          <PlexCover item={item} onSelect={onSelect} />
        </div>
      ))}
    </div>
  );
}

function PlexCover({ item, onSelect }: { item: PlexItem; onSelect: (item: PlexItem) => void }) {
  const title = item.type === 'episode' ? item.show || item.title : item.title;
  const progress =
    item.duration && item.duration > 0 && item.viewOffset
      ? Math.min(100, Math.max(0, (item.viewOffset / item.duration) * 100))
      : 0;
  const watched = !!item.viewCount && !item.viewOffset;

  return (
    <motion.div
      className={styles.cover}
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
      <div className={styles.playOverlay}>
        <PlayIcon />
      </div>
      {progress > 0 && (
        <div className={styles.progress}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
      )}
    </motion.div>
  );
}
