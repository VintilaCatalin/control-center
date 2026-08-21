import type { CSSProperties } from 'react';
import type { ReadingItem } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import { readingThumbUrl } from './media';
import { SaveButton } from './SaveButton';
import { relativeTime } from './time';
import { TOPIC_COLORS } from './topics';
import styles from './TechSection.module.css';

interface TechSectionProps {
  heading?: string;
  items: ReadingItem[];
  onOpen: (item: ReadingItem) => void;
  onToggleSave: (item: ReadingItem) => void;
  onDismiss?: (item: ReadingItem) => void;
}

// Tech's own briefing layout — not FeedCard. Image stays a small fixed
// tile beside the copy so a narrow panel never turns into a stack of
// giant thumbnails with one line of text underneath.
export function TechSection({ heading, items, onOpen, onToggleSave, onDismiss }: TechSectionProps) {
  if (items.length === 0) return null;
  const [lead, ...rest] = items;

  return (
    <section className={styles.section} style={{ '--tile-color': TOPIC_COLORS.tech } as CSSProperties}>
      {heading && (
        <h2 className={styles.heading}>
          <span className={styles.signal} aria-hidden="true" />
          {heading}
        </h2>
      )}

      <article className={styles.lead}>
        <button type="button" className={styles.leadHit} onClick={() => onOpen(lead)}>
          {lead.thumb ? (
            <span className={styles.leadThumb}>
              <ArtTile aspect="landscape" src={readingThumbUrl(lead.thumb)} alt="" fallback={null} className={styles.thumbArt} />
            </span>
          ) : (
            <span className={styles.leadThumbEmpty} aria-hidden="true" />
          )}
          <span className={styles.leadCopy}>
            <span className={styles.kicker}>
              {lead.source_label}
              <span aria-hidden="true"> · </span>
              {relativeTime(lead.published)}
              {lead.read_minutes ? (
                <>
                  <span aria-hidden="true"> · </span>
                  {lead.read_minutes} min
                </>
              ) : null}
            </span>
            <span className={styles.leadTitle}>{lead.title}</span>
            {lead.blurb && <span className={styles.leadBlurb}>{lead.blurb}</span>}
          </span>
        </button>
        <div className={styles.actions}>
          <SaveButton saved={lead.saved} onToggle={() => onToggleSave(lead)} variant="panel" small inline />
          {onDismiss && (
            <button type="button" className={styles.dismiss} onClick={() => onDismiss(lead)} aria-label="Not interested" title="Not interested">
              ×
            </button>
          )}
        </div>
      </article>

      <div className={styles.list}>
        {rest.map((item, index) => (
          <div key={item.id} className={styles.row}>
            <button type="button" className={styles.rowHit} onClick={() => onOpen(item)}>
              <span className={styles.index}>{String(index + 2).padStart(2, '0')}</span>
              {item.thumb ? (
                <span className={styles.rowThumb}>
                  <ArtTile aspect="square" src={readingThumbUrl(item.thumb)} alt="" fallback={null} className={styles.thumbArt} />
                </span>
              ) : (
                <span className={styles.rowThumbEmpty} aria-hidden="true" />
              )}
              <span className={styles.rowCopy}>
                <span className={styles.rowTitle}>{item.title}</span>
                <span className={styles.rowMeta}>
                  {item.source_label} · {relativeTime(item.published)}
                </span>
              </span>
            </button>
            <div className={styles.actions}>
              <SaveButton saved={item.saved} onToggle={() => onToggleSave(item)} variant="panel" small inline />
              {onDismiss && (
                <button type="button" className={styles.dismiss} onClick={() => onDismiss(item)} aria-label="Not interested" title="Not interested">
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
