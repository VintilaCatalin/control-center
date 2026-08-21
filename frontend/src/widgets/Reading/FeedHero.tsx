import type { CSSProperties } from 'react';
import type { ReadingItem } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import { IconButton } from '../../primitives/IconButton/IconButton';
import { PinIcon, PlayGlyphIcon, ShuffleIcon } from './icons';
import { readingThumbUrl } from './media';
import { SaveButton } from './SaveButton';
import { relativeTime } from './time';
import { topicColor as sharedTopicColor, topicLabel as sharedTopicLabel } from './topics';
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
  return sharedTopicColor(item.topic);
}
function topicLabel(item: ReadingItem): string {
  return sharedTopicLabel(item.topic);
}

// Editorial lead: 50/50 feature + single-column “Also today”.
export function FeedHero({ featured, side, pinned, onOpen, onToggleSave, onReload, onTogglePin }: FeedHeroProps) {
  return (
    <div className={styles.hero}>
      <article className={styles.feature} style={{ '--tile-color': topicColor(featured) } as CSSProperties}>
        <button type="button" className={styles.featureMedia} onClick={() => onOpen(featured)}>
          <ArtTile
            aspect="landscape"
            src={readingThumbUrl(featured.thumb)}
            alt={featured.title}
            fallback={null}
            className={styles.art}
          />
          {featured.kind === 'video' && (
            <span className={styles.playBadge}>
              <PlayGlyphIcon />
            </span>
          )}
          <span className={styles.scrim} />
          <span className={styles.featureCopy}>
            <span className={styles.kicker}>{topicLabel(featured)}</span>
            <span className={styles.featureTitle}>{featured.title}</span>
            <span className={styles.featureMeta}>
              {featured.source_label}
              <span aria-hidden="true"> · </span>
              {relativeTime(featured.published)}
            </span>
            {featured.blurb && <span className={styles.featureBlurb}>{featured.blurb}</span>}
          </span>
        </button>

        <div className={styles.featureActions}>
          <IconButton
            label="Reload featured story"
            size="sm"
            className={styles.actionBtn}
            icon={<ShuffleIcon />}
            onClick={(e) => {
              e.stopPropagation();
              onReload();
            }}
          />
          <IconButton
            label={pinned ? 'Unpin featured story' : 'Pin this story as featured'}
            size="sm"
            className={[styles.actionBtn, pinned ? styles.actionActive : ''].join(' ')}
            icon={<PinIcon filled={pinned} />}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
          />
          <SaveButton saved={featured.saved} onToggle={() => onToggleSave(featured)} inline />
        </div>
      </article>

      {side.length > 0 && (
        <aside className={styles.side}>
          <span className={styles.sideLabel}>Also today</span>
          <div className={styles.sideList}>
            {side.map((item) => (
              <SideRow key={item.id} item={item} onOpen={onOpen} onToggleSave={onToggleSave} />
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}

function SideRow({ item, onOpen, onToggleSave }: { item: ReadingItem } & Pick<FeedHeroProps, 'onOpen' | 'onToggleSave'>) {
  return (
    <div className={styles.sideRow}>
      <button type="button" className={styles.sideBtn} onClick={() => onOpen(item)}>
        {item.thumb ? (
          <span className={styles.sideThumb}>
            <ArtTile aspect="landscape" src={readingThumbUrl(item.thumb)} alt="" fallback={null} className={styles.sideArt} />
          </span>
        ) : (
          <span className={styles.sideThumbEmpty} style={{ background: topicColor(item) }} aria-hidden="true" />
        )}
        <span className={styles.sideCopy}>
          <span className={styles.sideTopic} style={{ color: topicColor(item) }}>
            {topicLabel(item)}
          </span>
          <span className={styles.sideTitle}>{item.title}</span>
          <span className={styles.sideMeta}>
            {item.source_label} · {relativeTime(item.published)}
          </span>
        </span>
      </button>
      <span className={styles.sideSave}>
        <SaveButton saved={item.saved} onToggle={() => onToggleSave(item)} variant="panel" small inline />
      </span>
    </div>
  );
}
