import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react';
import type { LibraryItem } from '../../api/types';
import { InstagramIcon, StarIcon } from './icons';
import {
  collectionAccent,
  coverFallbacks,
  formatSavedDate,
  isInstagramItem,
  resolveCoverUrl,
  type LibraryShowFlags,
} from './utils';
import styles from './LibraryCard.module.css';

interface LibraryCardProps {
  item: LibraryItem;
  accent?: string | null;
  density?: 'compact' | 'comfortable' | 'large';
  show?: LibraryShowFlags;
  moodboard?: boolean;
  onSelect: (item: LibraryItem) => void;
  onToggleFavorite?: (item: LibraryItem) => void;
  onRemove?: (item: LibraryItem) => void;
}

const DEFAULT_SHOW: LibraryShowFlags = {
  cover: true,
  title: true,
  excerpt: true,
  tags: true,
  date: true,
};

function TrashGlyph() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
    </svg>
  );
}

export function LibraryCard({
  item,
  accent,
  density = 'comfortable',
  show = DEFAULT_SHOW,
  moodboard = false,
  onSelect,
  onToggleFavorite,
  onRemove,
}: LibraryCardProps) {
  const initial = (item.domain || item.title || '?').slice(0, 1).toUpperCase();
  const date = formatSavedDate(item.created);
  const accentColor = collectionAccent(accent ?? undefined);
  const [coverSrc, setCoverSrc] = useState(() => resolveCoverUrl(item));
  const [tried, setTried] = useState<string[]>([]);
  const ig = isInstagramItem(item);

  useEffect(() => {
    setCoverSrc(resolveCoverUrl(item));
    setTried([]);
  }, [item.id, item.cover, item.url]);

  function advanceCover(from: string | null) {
    const next = coverFallbacks(item, from).find((url) => url !== from && !tried.includes(url));
    if (next) {
      setTried((prev) => (from ? [...prev, from] : prev));
      setCoverSrc(next);
      return;
    }
    setCoverSrc(null);
  }

  const showMedia = show.cover && (coverSrc || !ig);
  const coverOnly = show.cover && !show.title && !show.excerpt && !show.tags;
  const showBody = show.title || show.excerpt || show.tags || show.date || !showMedia;

  function handleFavorite(e: MouseEvent) {
    e.stopPropagation();
    onToggleFavorite?.(item);
  }

  function handleRemove(e: MouseEvent) {
    e.stopPropagation();
    onRemove?.(item);
  }

  return (
    <article
      className={[
        styles.card,
        styles[density],
        moodboard ? styles.moodboard : '',
        coverOnly && showMedia ? styles.coverOnly : '',
        !showMedia ? styles.textOnly : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={accentColor ? ({ ['--card-accent' as string]: accentColor } as CSSProperties) : undefined}
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
      {(onToggleFavorite || onRemove) && (
        <div className={styles.actions}>
          {onToggleFavorite && (
            <button
              type="button"
              className={[styles.actionBtn, item.important ? styles.actionActive : ''].filter(Boolean).join(' ')}
              onClick={handleFavorite}
              title={item.important ? 'Remove from favorites' : 'Add to favorites'}
              aria-label={item.important ? 'Remove from favorites' : 'Add to favorites'}
            >
              <StarIcon filled={item.important} />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              className={styles.actionBtn}
              onClick={handleRemove}
              title="Remove from Raindrop"
              aria-label="Remove from Raindrop"
            >
              <TrashGlyph />
            </button>
          )}
        </div>
      )}

      {showMedia && (
        <div className={styles.media}>
          {coverSrc ? (
            <img
              src={coverSrc}
              alt=""
              loading="lazy"
              onError={() => advanceCover(coverSrc)}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth < 48 || img.naturalHeight < 48) advanceCover(coverSrc);
              }}
            />
          ) : (
            <div className={styles.mediaFallback}>{initial}</div>
          )}
          {item.important && !onToggleFavorite && (
            <span className={styles.favorite} aria-label="Favorite">
              <StarIcon filled />
            </span>
          )}
          {ig && coverSrc && (
            <span className={styles.igBadge} aria-hidden="true">
              <InstagramIcon />
            </span>
          )}
        </div>
      )}
      {showBody && (
        <div className={styles.body}>
          {show.title && <span className={styles.title}>{item.title}</span>}
          <span className={styles.meta}>
            <span className={styles.domain}>{item.domain || 'Link'}</span>
            {show.date && date && <span>{date}</span>}
          </span>
          {show.excerpt && item.excerpt && !(density === 'compact' && !moodboard) && (
            <span className={styles.excerpt}>{item.excerpt}</span>
          )}
          {show.tags && item.tags.length > 0 && !(density === 'compact' && !moodboard) && (
            <span className={styles.tags}>
              {item.tags.slice(0, 3).map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
    </article>
  );
}
