import type { ReadingItem } from '../../api/types';
import { VideoCard } from './VideoCard';
import styles from './VideoGridSection.module.css';

interface VideoGridSectionProps {
  heading?: string;
  items: ReadingItem[];
  onOpen: (item: ReadingItem) => void;
  onToggleSave: (item: ReadingItem) => void;
  onDismiss?: (item: ReadingItem) => void;
}

// A video-heavy topic (Games/Travel/Interesting when their only enabled
// source is a YouTube channel) gets the same VideoCard treatment as the
// From YouTube rail - not FeedCard/VisualSection's article-shaped tiles
// with a play badge stapled on. Same card, wrapped into a grid instead
// of a horizontal rail, so every video in the app looks like a video.
export function VideoGridSection({ heading, items, onOpen, onToggleSave, onDismiss }: VideoGridSectionProps) {
  if (items.length === 0) return null;
  return (
    <section className={styles.section}>
      {heading && <h2 className={styles.heading}>{heading}</h2>}
      <div className={styles.grid}>
        {items.map((item) => (
          <VideoCard key={item.id} item={item} onOpen={onOpen} onToggleSave={onToggleSave} onDismiss={onDismiss} />
        ))}
      </div>
    </section>
  );
}
