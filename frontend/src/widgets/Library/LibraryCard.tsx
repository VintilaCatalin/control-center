import type { CSSProperties } from 'react';
import type { LibraryItem } from '../../api/types';
import { StarIcon } from './icons';
import { collectionAccent, formatSavedDate } from './utils';
import styles from './LibraryCard.module.css';

interface LibraryCardProps {
  item: LibraryItem;
  accent?: string | null;
  onSelect: (item: LibraryItem) => void;
}

export function LibraryCard({ item, accent, onSelect }: LibraryCardProps) {
  const initial = (item.domain || item.title || '?').slice(0, 1).toUpperCase();
  const date = formatSavedDate(item.created);
  const accentColor = collectionAccent(accent ?? undefined);

  return (
    <button
      type="button"
      className={styles.card}
      style={accentColor ? ({ ['--card-accent' as string]: accentColor } as CSSProperties) : undefined}
      onClick={() => onSelect(item)}
    >
      <div className={styles.media}>
        {item.cover ? (
          <img src={item.cover} alt="" loading="lazy" />
        ) : (
          <div className={styles.mediaFallback}>{initial}</div>
        )}
        {item.important && (
          <span className={styles.favorite} aria-label="Favorite">
            <StarIcon filled />
          </span>
        )}
      </div>
      <div className={styles.body}>
        <span className={styles.title}>{item.title}</span>
        <span className={styles.meta}>
          <span className={styles.domain}>{item.domain || 'Link'}</span>
          {date && <span>{date}</span>}
        </span>
        {item.excerpt && <span className={styles.excerpt}>{item.excerpt}</span>}
        {item.tags.length > 0 && (
          <span className={styles.tags}>
            {item.tags.slice(0, 3).map((tag) => (
              <span key={tag} className={styles.tag}>{tag}</span>
            ))}
          </span>
        )}
      </div>
    </button>
  );
}
