import type { CSSProperties } from 'react';
import type { ReadingItem } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import { ClockIcon, DismissIcon, PlayGlyphIcon } from './icons';
import { readingThumbUrl } from './media';
import { SaveButton } from './SaveButton';
import { relativeTime } from './time';
import { topicColor as sharedTopicColor, topicLabel as sharedTopicLabel } from './topics';
import styles from './FeedCard.module.css';

interface FeedCardProps {
  item: ReadingItem;
  onOpen: (item: ReadingItem) => void;
  onToggleSave: (item: ReadingItem) => void;
  onDismiss?: (item: ReadingItem) => void;
  /** Compact magazine cards for narrow panels (Tech) — not list rows. */
  compact?: boolean;
}

function topicColor(item: ReadingItem): string {
  return sharedTopicColor(item.topic);
}
function topicLabel(item: ReadingItem): string {
  return sharedTopicLabel(item.topic);
}

export function FeedCard({ item, onOpen, onToggleSave, onDismiss, compact }: FeedCardProps) {
  if (!item.thumb) {
    return (
      <TextCard
        item={item}
        onOpen={onOpen}
        onToggleSave={onToggleSave}
        onDismiss={onDismiss}
        compact={compact}
      />
    );
  }

  return (
    <article className={[styles.card, compact ? styles.compact : ''].filter(Boolean).join(' ')}>
      <button type="button" className={styles.media} onClick={() => onOpen(item)}>
        <ArtTile aspect="landscape" src={readingThumbUrl(item.thumb)} alt={item.title} fallback={null} className={styles.art} />
        <span className={styles.mediaShade} />
        {item.kind === 'video' && (
          <span className={styles.playBadge}>
            <PlayGlyphIcon />
          </span>
        )}
        <span className={styles.badge} style={{ '--tile-color': topicColor(item) } as CSSProperties}>
          {topicLabel(item)}
        </span>
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
            <DismissIcon />
          </button>
        )}
      </div>

      <button type="button" className={styles.body} onClick={() => onOpen(item)}>
        <span className={styles.title}>{item.title}</span>
        {!compact && <CardMeta item={item} />}
        {compact && (
          <span className={styles.meta}>
            <span className={styles.source}>{item.source_label}</span>
            <span className={styles.dot}>·</span>
            <span>{relativeTime(item.published)}</span>
          </span>
        )}
      </button>
    </article>
  );
}

function TextCard({
  item,
  onOpen,
  onToggleSave,
  onDismiss,
  compact,
}: FeedCardProps) {
  return (
    <article className={[styles.textCard, compact ? styles.compactText : ''].filter(Boolean).join(' ')}>
      <button type="button" className={styles.textBody} onClick={() => onOpen(item)}>
        <span className={styles.textBadge} style={{ '--tile-color': topicColor(item) } as CSSProperties}>
          {topicLabel(item)}
        </span>
        <span className={styles.textTitle}>{item.title}</span>
        {!compact && item.blurb && <span className={styles.textExcerpt}>{item.blurb}</span>}
        <CardMeta item={item} />
      </button>

      <div className={styles.actionsPanel}>
        <SaveButton saved={item.saved} onToggle={() => onToggleSave(item)} variant="panel" small inline />
        {onDismiss && (
          <button
            type="button"
            className={styles.dismissBtnPanel}
            onClick={() => onDismiss(item)}
            aria-label="Not interested"
            title="Not interested"
          >
            <DismissIcon />
          </button>
        )}
      </div>
    </article>
  );
}

function CardMeta({ item }: { item: ReadingItem }) {
  return (
    <span className={styles.meta}>
      <span className={styles.source}>{item.source_label}</span>
      <span className={styles.dot}>·</span>
      <span>{relativeTime(item.published)}</span>
      {item.kind === 'article' && item.read_minutes ? (
        <>
          <span className={styles.dot}>·</span>
          <span className={styles.readTime}>
            <ClockIcon />
            {item.read_minutes} min
          </span>
        </>
      ) : null}
    </span>
  );
}
