import type { CSSProperties } from 'react';
import type { ReadingItem } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import { PlayGlyphIcon } from './icons';
import { readingThumbUrl } from './media';
import { SaveButton } from './SaveButton';
import { topicColor as sharedTopicColor, topicLabel as sharedTopicLabel } from './topics';
import styles from './VisualSection.module.css';

interface VisualSectionProps {
  heading?: string;
  items: ReadingItem[];
  onOpen: (item: ReadingItem) => void;
  onToggleSave: (item: ReadingItem) => void;
  onDismiss?: (item: ReadingItem) => void;
}

// The other alternate treatment: a pure image masonry, title fused onto
// the photo via a scrim - only items that actually have a photo are
// eligible (see ReadingFeed's pickVariant, which only picks this variant
// when a topic has enough of them). Genuinely different rhythm from
// FeedCard's badge-then-text-panel composition, not a resize of it.
export function VisualSection({ heading, items, onOpen, onToggleSave, onDismiss }: VisualSectionProps) {
  if (items.length === 0) return null;
  return (
    <section className={styles.section}>
      {heading && <h2 className={styles.heading}>{heading}</h2>}
      <div className={styles.grid}>
        {items.map((item) => {
          const color = sharedTopicColor(item.topic);
          const label = sharedTopicLabel(item.topic);
          return (
            <article key={item.id} className={styles.tile}>
              <button type="button" className={styles.media} onClick={() => onOpen(item)}>
                <ArtTile aspect="portrait" src={readingThumbUrl(item.thumb)} alt={item.title} fallback={null} className={styles.art} />
                {item.kind === 'video' && (
                  <span className={styles.playBadge}>
                    <PlayGlyphIcon />
                  </span>
                )}
                <span className={styles.scrim} />
                <span className={styles.badge} style={{ '--tile-color': color } as CSSProperties}>
                  {label}
                </span>
                <span className={styles.title}>{item.title}</span>
              </button>

              <div className={styles.actions}>
                <SaveButton saved={item.saved} onToggle={() => onToggleSave(item)} small inline />
                {onDismiss && (
                  <button
                    type="button"
                    className={styles.dismissBtn}
                    onClick={() => onDismiss(item)}
                    aria-label="Not interested"
                    title="Not interested"
                  >
                    ×
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
