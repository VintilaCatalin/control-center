import type { ReadingItem } from '../../api/types';
import { VideoCard } from './VideoCard';
import styles from './YouTubeRail.module.css';

interface YouTubeRailProps {
  heading?: string;
  items: ReadingItem[];
  onOpen: (item: ReadingItem) => void;
  onToggleSave: (item: ReadingItem) => void;
}

// YouTube gets its own horizontal-scroll rail, not a slot in the article
// grid - videos are content you browse sideways through (every media app
// does this), and VideoCard's own treatment (centred play control, no
// scrim title) only reads correctly at a fixed card width like this. As
// a panel, it's a normal padded panel like every topic panel (see
// FeedSection/LinkListSection/VisualSection) - not bleed - so its
// heading/spacing matches them exactly instead of using its own scale.
export function YouTubeRail({ heading, items, onOpen, onToggleSave }: YouTubeRailProps) {
  if (items.length === 0) return null;

  return (
    <section className={styles.section}>
      {heading && <h2 className={styles.heading}>{heading}</h2>}
      <div className={styles.rail}>
        {items.map((item) => (
          <VideoCard key={item.id} item={item} onOpen={onOpen} onToggleSave={onToggleSave} />
        ))}
      </div>
    </section>
  );
}
