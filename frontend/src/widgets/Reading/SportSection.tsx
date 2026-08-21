import type { CSSProperties } from 'react';
import type { ReadingItem } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import { readingThumbUrl } from './media';
import { SaveButton } from './SaveButton';
import { relativeTime } from './time';
import { TOPIC_COLORS } from './topics';
import styles from './SportSection.module.css';

interface SportSectionProps {
  heading?: string;
  items: ReadingItem[];
  onOpen: (item: ReadingItem) => void;
  onToggleSave: (item: ReadingItem) => void;
  onDismiss?: (item: ReadingItem) => void;
}

const FRESH_WINDOW_SECONDS = 2 * 60 * 60;

function isFresh(published: number | null): boolean {
  return !!published && Date.now() / 1000 - published < FRESH_WINDOW_SECONDS;
}

function categoryLabel(item: ReadingItem): string {
  try {
    const segments = new URL(item.url).pathname.split('/').filter(Boolean);
    const words = segments
      .slice(0, 2)
      .map((s) => s.replace(/-/g, ' '))
      .map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase()));
    if (words.length >= 2) return words.join(' · ');
    if (words.length === 1) return words[0];
  } catch {
    /* ignore */
  }
  return item.domain || item.source_label;
}

/** Dense vertical stack for a 2×8 panel — lead image + compact rows. */
export function SportSection({ heading, items, onOpen, onToggleSave, onDismiss }: SportSectionProps) {
  if (items.length === 0) return null;
  const [lead, ...rest] = items;

  return (
    <section className={styles.section} style={{ '--tile-color': TOPIC_COLORS.sport } as CSSProperties}>
      {heading && (
        <h2 className={styles.heading}>
          <span className={styles.dot} aria-hidden="true" />
          {heading}
        </h2>
      )}

      <div className={styles.stack}>
        <article className={styles.lead}>
          <button type="button" className={styles.leadHit} onClick={() => onOpen(lead)}>
            {lead.thumb ? (
              <ArtTile aspect="landscape" src={readingThumbUrl(lead.thumb)} alt={lead.title} fallback={null} className={styles.leadArt} />
            ) : (
              <span className={styles.fallback} />
            )}
            <span className={styles.scrim} />
            <span className={styles.leadCopy}>
              <span className={styles.tag}>{categoryLabel(lead)}</span>
              <span className={styles.leadTitle}>{lead.title}</span>
              <span className={styles.meta}>
                {isFresh(lead.published) && <span className={styles.freshDot} />}
                {relativeTime(lead.published)}
              </span>
            </span>
          </button>
          <div className={styles.actions}>
            <SaveButton saved={lead.saved} onToggle={() => onToggleSave(lead)} small inline />
            {onDismiss && (
              <button type="button" className={styles.dismissBtn} onClick={() => onDismiss(lead)} aria-label="Not interested" title="Not interested">
                ×
              </button>
            )}
          </div>
        </article>

        {rest.map((item) => (
          <div key={item.id} className={styles.row}>
            <button type="button" className={styles.rowHit} onClick={() => onOpen(item)}>
              {item.thumb ? (
                <span className={styles.rowThumb}>
                  <ArtTile aspect="square" src={readingThumbUrl(item.thumb)} alt="" fallback={null} className={styles.rowArt} />
                </span>
              ) : (
                <span className={styles.rowThumbEmpty} aria-hidden="true" />
              )}
              <span className={styles.rowCopy}>
                <span className={styles.rowTag}>{categoryLabel(item)}</span>
                <span className={styles.rowTitle}>{item.title}</span>
                <span className={styles.rowMeta}>
                  {isFresh(item.published) && <span className={styles.freshDot} />}
                  {relativeTime(item.published)}
                </span>
              </span>
            </button>
            <SaveButton saved={item.saved} onToggle={() => onToggleSave(item)} variant="panel" small inline />
          </div>
        ))}
      </div>
    </section>
  );
}
