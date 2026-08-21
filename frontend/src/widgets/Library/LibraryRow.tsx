import { useEffect, useState, type MouseEvent } from 'react';
import type { LibraryItem } from '../../api/types';
import { StarIcon } from './icons';
import {
  coverFallbacks,
  formatSavedDate,
  isInstagramItem,
  resolveCoverUrl,
  type LibraryShowFlags,
} from './utils';
import styles from './LibraryRow.module.css';

interface LibraryRowProps {
  item: LibraryItem;
  variant: 'list' | 'headlines';
  show?: LibraryShowFlags;
  coverSize?: 's' | 'm' | 'l';
  onSelect: (item: LibraryItem) => void;
  onToggleFavorite?: (item: LibraryItem) => void;
  onRemove?: (item: LibraryItem) => void;
}

function TrashGlyph() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
    </svg>
  );
}

export function LibraryRow({
  item,
  variant,
  show,
  coverSize = 'm',
  onSelect,
  onToggleFavorite,
  onRemove,
}: LibraryRowProps) {
  const wantCover = variant === 'list' && (show?.cover ?? true);
  const showExcerpt = show?.excerpt ?? true;
  const showDate = show?.date ?? true;
  const showTags = show?.tags ?? true;
  const showTitle = show?.title ?? true;
  const [src, setSrc] = useState(() => (wantCover ? resolveCoverUrl(item) : null));
  const [tried, setTried] = useState<string[]>([]);
  const date = formatSavedDate(item.created);
  const ig = isInstagramItem(item);

  useEffect(() => {
    setSrc(wantCover ? resolveCoverUrl(item) : null);
    setTried([]);
  }, [item.id, item.cover, item.url, wantCover]);

  function advanceCover(from: string | null) {
    const next = coverFallbacks(item, from).find((url) => url !== from && !tried.includes(url));
    if (next) {
      setTried((prev) => (from ? [...prev, from] : prev));
      setSrc(next);
      return;
    }
    setSrc(null);
  }

  const showCover = wantCover && (src || !ig);
  const thumbSizeClass = coverSize === 's' ? styles.thumbS : coverSize === 'l' ? styles.thumbL : '';
  const layoutClass =
    variant === 'headlines' ? styles.headlines : showCover ? styles.list : styles.listNoCover;

  function handleFavorite(e: MouseEvent) {
    e.stopPropagation();
    onToggleFavorite?.(item);
  }

  function handleRemove(e: MouseEvent) {
    e.stopPropagation();
    onRemove?.(item);
  }

  return (
    <div
      className={[styles.row, layoutClass].join(' ')}
      onClick={() => onSelect(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(item);
        }
      }}
      role="button"
      tabIndex={0}
    >
      {showCover && (
        <span className={[styles.thumb, thumbSizeClass].filter(Boolean).join(' ')}>
          {src ? (
            <img
              src={src}
              alt=""
              loading="lazy"
              onError={() => advanceCover(src)}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth < 48 || img.naturalHeight < 48) advanceCover(src);
              }}
            />
          ) : (
            <span className={styles.thumbFallback}>{(item.domain || '?').slice(0, 1).toUpperCase()}</span>
          )}
        </span>
      )}
      <span className={styles.copy}>
        {showTitle && (
          <span className={variant === 'headlines' ? styles.headlinesTitle : styles.title}>{item.title}</span>
        )}
        {variant === 'headlines' && showExcerpt && item.excerpt && (
          <span className={styles.excerpt}>{item.excerpt}</span>
        )}
        <span className={styles.meta}>
          <span>{item.domain || 'Link'}</span>
          {showDate && date && <span>{date}</span>}
          {showTags &&
            item.tags.slice(0, 2).map((tag) => (
              <span key={tag} className={styles.tag}>
                {tag}
              </span>
            ))}
        </span>
      </span>
      {(onToggleFavorite || onRemove) && (
        <span className={styles.rowActions}>
          {onToggleFavorite && (
            <button
              type="button"
              className={[styles.rowAction, item.important ? styles.rowActionActive : ''].filter(Boolean).join(' ')}
              onClick={handleFavorite}
              title={item.important ? 'Remove from favorites' : 'Add to favorites'}
              aria-label={item.important ? 'Remove from favorites' : 'Add to favorites'}
            >
              <StarIcon filled={item.important} />
            </button>
          )}
          {onRemove && (
            <button type="button" className={styles.rowAction} onClick={handleRemove} title="Remove from Raindrop" aria-label="Remove from Raindrop">
              <TrashGlyph />
            </button>
          )}
        </span>
      )}
    </div>
  );
}
