import type { ReadingItem } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import { LinkIcon } from './icons';
import { readingThumbUrl } from './media';
import { relativeTime } from './time';
import styles from './BookmarksPanel.module.css';

interface BookmarksPanelProps {
  items: ReadingItem[];
  onOpen: (item: ReadingItem) => void;
}

// A slim row list, not ReadingList's rail+column layout - that's built
// for a full page (source filter rail, 640px reading measure) and would
// break down at panel width. This is just "your last few saved links",
// small enough to sit next to the topic panels.
export function BookmarksPanel({ items, onOpen }: BookmarksPanelProps) {
  const shown = items.slice(0, 6);

  if (shown.length === 0) {
    return <div className={styles.empty}>No bookmarks saved yet.</div>;
  }

  return (
    <div className={styles.list}>
      {shown.map((item) => (
        <button type="button" key={item.id} className={styles.row} onClick={() => onOpen(item)}>
          {item.thumb ? (
            <ArtTile aspect="square" src={readingThumbUrl(item.thumb)} alt="" fallback={null} className={styles.thumb} />
          ) : (
            <span className={styles.thumbFallback}>
              <LinkIcon />
            </span>
          )}
          <span className={styles.text}>
            <span className={styles.title}>{item.title}</span>
            <span className={styles.meta}>
              {item.domain || item.source_label}
              {item.published ? ` · ${relativeTime(item.published)}` : ''}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
