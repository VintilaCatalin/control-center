import type { ReadingItem } from '../../api/types';
import { SaveButton } from './SaveButton';
import { relativeTime } from './time';
import { TOPIC_COLORS } from './topics';
import styles from './LinkListSection.module.css';

interface LinkListSectionProps {
  heading?: string;
  items: ReadingItem[];
  onOpen: (item: ReadingItem) => void;
  onToggleSave: (item: ReadingItem) => void;
  onDismiss?: (item: ReadingItem) => void;
}

// One of the "For You" page's alternate section treatments (see
// ReadingFeed's pickVariant) - a plain list of links, no imagery at all.
// Only ever fed article items - pickVariant keeps video-heavy topics on
// a thumbnail-based variant instead, so this component never has to
// special-case video content itself.
export function LinkListSection({ heading, items, onOpen, onToggleSave, onDismiss }: LinkListSectionProps) {
  if (items.length === 0) return null;
  return (
    <section className={styles.section}>
      {heading && <h2 className={styles.heading}>{heading}</h2>}
      <div className={styles.list}>
        {items.map((item) => {
          const color = item.topic in TOPIC_COLORS ? TOPIC_COLORS[item.topic as keyof typeof TOPIC_COLORS] : TOPIC_COLORS.interesting;
          return (
            <div key={item.id} className={styles.row}>
              <button type="button" className={styles.rowBody} onClick={() => onOpen(item)}>
                <span className={styles.dot} style={{ background: color }} aria-hidden="true" />
                <span className={styles.text}>
                  <span className={styles.title}>{item.title}</span>
                  <span className={styles.meta}>
                    {item.source_label} · {relativeTime(item.published)}
                  </span>
                </span>
              </button>
              <div className={styles.rowActions}>
                <SaveButton saved={item.saved} onToggle={() => onToggleSave(item)} variant="panel" small inline />
                {onDismiss && (
                  <button type="button" className={styles.dismissBtn} onClick={() => onDismiss(item)} title="Not interested">
                    ×
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
