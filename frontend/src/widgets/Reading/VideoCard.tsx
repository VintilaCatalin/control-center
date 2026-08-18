import type { ReadingItem } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import { DismissIcon, PlayGlyphIcon } from './icons';
import { readingThumbUrl } from './media';
import { SaveButton } from './SaveButton';
import { relativeTime } from './time';
import { formatDuration } from './youtube';
import styles from './VideoCard.module.css';

interface VideoCardProps {
  item: ReadingItem;
  onOpen: (item: ReadingItem) => void;
  onToggleSave: (item: ReadingItem) => void;
  onDismiss?: (item: ReadingItem) => void;
}

// Video's own visual treatment, not an article card with a play badge
// stapled on: full-bleed thumbnail with a duration chip in the corner
// (YouTube's own convention, when duration data exists), a play control
// that grows on hover rather than sitting static, and a channel identity
// row (monogram + name) instead of a plain byline - so a video reads as
// "a video, from this channel" at a glance, not another article card.
export function VideoCard({ item, onOpen, onToggleSave, onDismiss }: VideoCardProps) {
  const duration = formatDuration(item.duration_seconds);
  const initial = item.source_label.trim().charAt(0).toUpperCase() || '?';

  return (
    <article className={styles.card}>
      <button type="button" className={styles.mediaBtn} onClick={() => onOpen(item)}>
        <ArtTile aspect="landscape" src={readingThumbUrl(item.thumb)} alt={item.title} fallback={<PlayGlyphIcon />} className={styles.art} />
        <span className={styles.playCircle}>
          <PlayGlyphIcon />
        </span>
        {duration && <span className={styles.durationBadge}>{duration}</span>}
      </button>

      <div className={styles.actions}>
        <SaveButton saved={item.saved} onToggle={() => onToggleSave(item)} small inline />
        {onDismiss && (
          <button type="button" className={styles.dismissBtn} onClick={() => onDismiss(item)} title="Not interested">
            <DismissIcon />
          </button>
        )}
      </div>

      <button type="button" className={styles.body} onClick={() => onOpen(item)}>
        <span className={styles.title}>{item.title}</span>
        <span className={styles.channelRow}>
          <span className={styles.avatar} aria-hidden="true">
            {initial}
          </span>
          <span className={styles.channelText}>
            <span className={styles.channelName}>{item.source_label}</span>
            <span className={styles.published}>{relativeTime(item.published)}</span>
          </span>
        </span>
      </button>
    </article>
  );
}
