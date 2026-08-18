import type { ReadingItem } from '../../api/types';
import { FeedCard } from './FeedCard';
import styles from './FeedSection.module.css';

interface FeedSectionProps {
  heading?: string;
  items: ReadingItem[];
  onOpen: (item: ReadingItem) => void;
  onToggleSave: (item: ReadingItem) => void;
  onRemove?: (item: ReadingItem) => void;
  onDismiss?: (item: ReadingItem) => void;
}

// A plain vertical list under an optional heading - deliberately not an
// asymmetric "1 big + rest small" split (that fell apart visually
// whenever a section had few items, and forced whatever landed in the
// big slot - including videos - into an oversized treatment it never
// suited). Every item gets the same FeedCard; the only variation is
// which of its two compositions (image vs. typographic) it falls into
// on its own.
export function FeedSection({ heading, items, onOpen, onToggleSave, onRemove, onDismiss }: FeedSectionProps) {
  if (items.length === 0) return null;
  return (
    <section className={styles.section}>
      {heading && <h2 className={styles.heading}>{heading}</h2>}
      <div className={styles.list}>
        {items.map((item) => (
          <FeedCard key={item.id} item={item} onOpen={onOpen} onToggleSave={onToggleSave} onRemove={onRemove} onDismiss={onDismiss} />
        ))}
      </div>
    </section>
  );
}
