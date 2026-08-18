import type { CSSProperties } from 'react';
import type { ReadingItem } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import { ClockIcon, DismissIcon, PlayGlyphIcon, TrashIcon } from './icons';
import { readingThumbUrl } from './media';
import { SaveButton } from './SaveButton';
import { relativeTime } from './time';
import { TOPIC_COLORS, TOPIC_LABELS } from './topics';
import styles from './FeedCard.module.css';

interface FeedCardProps {
  item: ReadingItem;
  onOpen: (item: ReadingItem) => void;
  onToggleSave: (item: ReadingItem) => void;
  onRemove?: (item: ReadingItem) => void;
  onDismiss?: (item: ReadingItem) => void;
}

function topicColor(item: ReadingItem): string {
  return item.topic in TOPIC_COLORS ? TOPIC_COLORS[item.topic as keyof typeof TOPIC_COLORS] : TOPIC_COLORS.interesting;
}
function topicLabel(item: ReadingItem): string {
  return item.topic in TOPIC_LABELS ? TOPIC_LABELS[item.topic as keyof typeof TOPIC_LABELS] : item.topic;
}

// Two genuinely different cards, not one template with a fallback colour
// swapped in. A real photo gets used, full-width, because it earns its
// place. No photo means no fabricated colour panel standing in for one
// either - just a clean typographic card (colour lives only in the small
// topic badge), the same shape a well-typeset app uses for a text-only
// note: badge, bold title, an actual excerpt, byline. Rendered inside a
// masonry column (see FeedSection), so the two heights can differ
// honestly instead of being forced into equal rows.
export function FeedCard({ item, onOpen, onToggleSave, onRemove, onDismiss }: FeedCardProps) {
  if (!item.thumb) {
    return <TextCard item={item} onOpen={onOpen} onToggleSave={onToggleSave} onRemove={onRemove} onDismiss={onDismiss} />;
  }

  return (
    <article className={styles.card}>
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
        {onRemove ? (
          <button type="button" className={styles.removeBtn} onClick={() => onRemove(item)} title="Remove bookmark">
            <TrashIcon />
          </button>
        ) : (
          <>
            <SaveButton saved={item.saved} onToggle={() => onToggleSave(item)} small inline />
            {onDismiss && (
              <button type="button" className={styles.dismissBtn} onClick={() => onDismiss(item)} title="Not interested">
                <DismissIcon />
              </button>
            )}
          </>
        )}
      </div>

      <button type="button" className={styles.body} onClick={() => onOpen(item)}>
        <span className={styles.title}>{item.title}</span>
        <CardMeta item={item} />
      </button>
    </article>
  );
}

function TextCard({ item, onOpen, onToggleSave, onRemove, onDismiss }: FeedCardProps) {
  return (
    <article className={styles.textCard}>
      <button type="button" className={styles.textBody} onClick={() => onOpen(item)}>
        <span className={styles.textBadge} style={{ '--tile-color': topicColor(item) } as CSSProperties}>
          {topicLabel(item)}
        </span>
        <span className={styles.textTitle}>{item.title}</span>
        {item.blurb && <span className={styles.textExcerpt}>{item.blurb}</span>}
        <CardMeta item={item} />
      </button>

      <div className={styles.actionsPanel}>
        {onRemove ? (
          <button type="button" className={styles.removeBtnPanel} onClick={() => onRemove(item)} title="Remove bookmark">
            <TrashIcon />
          </button>
        ) : (
          <>
            <SaveButton saved={item.saved} onToggle={() => onToggleSave(item)} variant="panel" small inline />
            {onDismiss && (
              <button type="button" className={styles.dismissBtnPanel} onClick={() => onDismiss(item)} title="Not interested">
                <DismissIcon />
              </button>
            )}
          </>
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
