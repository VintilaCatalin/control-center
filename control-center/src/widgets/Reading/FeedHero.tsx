import type { CSSProperties } from 'react';
import type { ReadingItem } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import { PinIcon, PlayGlyphIcon, ShuffleIcon } from './icons';
import { readingThumbUrl } from './media';
import { SaveButton } from './SaveButton';
import { relativeTime } from './time';
import { TOPIC_COLORS, TOPIC_LABELS } from './topics';
import styles from './FeedHero.module.css';

interface FeedHeroProps {
  featured: ReadingItem;
  side: ReadingItem[];
  pinned: boolean;
  onOpen: (item: ReadingItem) => void;
  onToggleSave: (item: ReadingItem) => void;
  onReload: () => void;
  onTogglePin: () => void;
}

function topicColor(item: ReadingItem): string {
  return item.topic in TOPIC_COLORS ? TOPIC_COLORS[item.topic as keyof typeof TOPIC_COLORS] : TOPIC_COLORS.interesting;
}
function topicLabel(item: ReadingItem): string {
  return item.topic in TOPIC_LABELS ? TOPIC_LABELS[item.topic as keyof typeof TOPIC_LABELS] : item.topic;
}

// The hero band: one photo tile (always has an image - see ReadingFeed's
// featured-selection rule) sized to be a genuine accent, not a page
// dominator, beside three companion stories - deliberately few, each
// with real weight (an excerpt, not just a bare headline), rather than a
// longer list of terse title-only rows competing with the photo.
export function FeedHero({ featured, side, pinned, onOpen, onToggleSave, onReload, onTogglePin }: FeedHeroProps) {
  return (
    <div className={styles.hero}>
      <div className={styles.tileWrap} style={{ '--tile-color': topicColor(featured) } as CSSProperties}>
        <span className={styles.glow} aria-hidden="true" />
        <article className={styles.tile}>
          <button type="button" className={styles.tileMedia} onClick={() => onOpen(featured)}>
            <ArtTile aspect="landscape" src={readingThumbUrl(featured.thumb)} alt={featured.title} fallback={null} className={styles.art} />
            {featured.kind === 'video' && (
              <span className={styles.playBadge}>
                <PlayGlyphIcon />
              </span>
            )}
            <span className={styles.scrim} />
            <span className={styles.badge} style={{ '--tile-color': topicColor(featured) } as CSSProperties}>
              {topicLabel(featured)}
            </span>
            <span className={styles.tileText}>
              <span className={styles.tileTitle}>{featured.title}</span>
              <span className={styles.tileMeta}>
                {featured.source_label} · {relativeTime(featured.published)}
              </span>
            </span>
          </button>

          <div className={styles.tileActions}>
            <button
              type="button"
              className={styles.tileActionBtn}
              onClick={(e) => {
                e.stopPropagation();
                onReload();
              }}
              title="Reload featured story"
            >
              <ShuffleIcon />
            </button>
            <button
              type="button"
              className={[styles.tileActionBtn, pinned ? styles.tileActionActive : ''].join(' ')}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin();
              }}
              title={pinned ? 'Unpin featured story' : 'Pin this story as featured'}
            >
              <PinIcon filled={pinned} />
            </button>
            <SaveButton saved={featured.saved} onToggle={() => onToggleSave(featured)} inline />
          </div>
        </article>
      </div>

      {side.length > 0 && (
        <div className={styles.sideList}>
          {side.map((item) => (
            <SideRow key={item.id} item={item} onOpen={onOpen} onToggleSave={onToggleSave} />
          ))}
        </div>
      )}
    </div>
  );
}

function SideRow({ item, onOpen, onToggleSave }: { item: ReadingItem } & Pick<FeedHeroProps, 'onOpen' | 'onToggleSave'>) {
  return (
    <div className={styles.sideRow}>
      <button type="button" className={styles.sideRowBody} onClick={() => onOpen(item)}>
        <span className={styles.sideTopRow}>
          <span className={styles.sideTopic} style={{ color: topicColor(item) }}>
            {topicLabel(item)}
          </span>
          <span className={styles.sideDot} aria-hidden="true">
            ·
          </span>
          <span className={styles.sideSource}>{item.source_label}</span>
          <span className={styles.sideDot} aria-hidden="true">
            ·
          </span>
          <span>{relativeTime(item.published)}</span>
        </span>
        <span className={styles.sideTitle}>{item.title}</span>
        {item.blurb && <span className={styles.sideExcerpt}>{item.blurb}</span>}
      </button>
      <SaveButton saved={item.saved} onToggle={() => onToggleSave(item)} variant="panel" small inline />
    </div>
  );
}
