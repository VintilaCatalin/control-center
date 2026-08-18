import type { ReadingItem } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import { readingThumbUrl } from './media';
import { SaveButton } from './SaveButton';
import { relativeTime } from './time';
import styles from './DesignSection.module.css';

interface DesignSectionProps {
  heading?: string;
  items: ReadingItem[];
  onOpen: (item: ReadingItem) => void;
  onToggleSave: (item: ReadingItem) => void;
  onDismiss?: (item: ReadingItem) => void;
}

// Design's own treatment - the generic FeedCard/VisualSection read flat
// next to the rest of Reading because a scrim-and-badge card is a news
// composition, and design writing is itself full of large, considered
// imagery worth showing at real size. Bigger landscape art, the caption
// living in real space below the image instead of scrimmed onto it, and
// no topic badge (every card here already belongs to Design - the badge
// exists elsewhere to disambiguate a mixed grid, not to relabel one that
// already isn't mixed).
export function DesignSection({ heading, items, onOpen, onToggleSave, onDismiss }: DesignSectionProps) {
  if (items.length === 0) return null;
  return (
    <section className={styles.section}>
      {heading && <h2 className={styles.heading}>{heading}</h2>}
      <div className={styles.grid}>
        {items.map((item) => (
          <article key={item.id} className={styles.card}>
            {item.thumb && (
              <button type="button" className={styles.media} onClick={() => onOpen(item)}>
                <ArtTile aspect="landscape" src={readingThumbUrl(item.thumb)} alt={item.title} fallback={null} className={styles.art} />
              </button>
            )}
            <div className={styles.body}>
              <button type="button" className={styles.textBtn} onClick={() => onOpen(item)}>
                <span className={styles.title}>{item.title}</span>
                {item.blurb && <span className={styles.excerpt}>{item.blurb}</span>}
                <span className={styles.meta}>
                  {item.source_label} · {relativeTime(item.published)}
                </span>
              </button>
              <div className={styles.actions}>
                <SaveButton saved={item.saved} onToggle={() => onToggleSave(item)} variant="panel" small inline />
                {onDismiss && (
                  <button type="button" className={styles.dismissBtn} onClick={() => onDismiss(item)} title="Not interested">
                    ×
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
