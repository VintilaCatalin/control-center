import { useMemo } from 'react';
import type { Book, ReadingItem, ReadingSource } from '../../api/types';
import { GearIcon, ReadingIcon } from '../../shell/icons';
import { BookIcon, BookmarkIcon, LinkIcon, PlayGlyphIcon, PlusIcon, TagIcon } from './icons';
import { REGULAR_TOPICS, type ReadingSection, type TopicDef, topicLabel } from './topics';
import styles from './ReadingSidebarNav.module.css';

export type { ReadingSection };

interface ReadingSidebarNavProps {
  sources: ReadingSource[];
  items: ReadingItem[];
  books: Book[];
  bookmarks: ReadingItem[];
  topics: TopicDef[];
  active: ReadingSection;
  onSelect: (key: ReadingSection) => void;
  onManageSources: () => void;
  onAddBookmark: () => void;
  collapsed?: boolean;
}

// Reading's own sidebar content - branding-led like Plex's (see
// PlexSidebarNav), not Notes' dense text-row list. Topic sections only
// appear once an enabled source is actually tagged with them, so an
// unused taxonomy slot ("Interesting" with nothing curated into it yet)
// doesn't sit in the nav as a dead destination.
export function ReadingSidebarNav({
  sources,
  items,
  books,
  bookmarks,
  topics,
  active,
  onSelect,
  onManageSources,
  onAddBookmark,
  collapsed,
}: ReadingSidebarNavProps) {
  const presentTopics = useMemo(
    () => new Set(sources.filter((s) => s.enabled).map((s) => s.topic)),
    [sources],
  );
  // The original 9 first (stable, familiar order), then any custom
  // topics the user's created - both filtered to "actually has an
  // enabled source", same as before, just no longer capped at the fixed
  // set (see topics.ts's ReadingSection comment on why this is possible
  // without special-casing every consumer).
  const orderedTopics = useMemo(() => {
    const known = REGULAR_TOPICS.filter((t) => presentTopics.has(t));
    const extra = topics.map((t) => t.id).filter((id) => id !== 'youtube' && presentTopics.has(id) && !REGULAR_TOPICS.includes(id as (typeof REGULAR_TOPICS)[number]));
    return [...known, ...extra];
  }, [presentTopics, topics]);
  const counts = useMemo(() => {
    const byTopic = new Map<string, number>();
    let videoCount = 0;
    let savedCount = 0;
    for (const item of items) {
      byTopic.set(item.topic, (byTopic.get(item.topic) ?? 0) + 1);
      if (item.kind === 'video') videoCount++;
      if (item.saved) savedCount++;
    }
    return { byTopic, videoCount, savedCount };
  }, [items]);

  return (
    <div className={styles.nav} data-collapsed={collapsed ? '' : undefined}>
      <div className={styles.brand}>
        <span className={styles.brandGlyph}>
          <ReadingIcon />
        </span>
        <span className={styles.brandLabel}>Reading</span>
      </div>

      <button
        type="button"
        className={[styles.item, active === 'foryou' ? styles.itemActive : ''].filter(Boolean).join(' ')}
        onClick={() => onSelect('foryou')}
        title={collapsed ? 'For You' : undefined}
      >
        <span className={styles.icon}>
          <ReadingIcon />
        </span>
        <span className={styles.label}>For You</span>
        <span className={styles.count}>{items.length}</span>
      </button>

      <div className={styles.groupLabel}>Topics</div>
      {orderedTopics.map((topic) => (
        <button
          key={topic}
          type="button"
          className={[styles.item, active === topic ? styles.itemActive : ''].filter(Boolean).join(' ')}
          onClick={() => onSelect(topic)}
          title={collapsed ? topicLabel(topic, topics) : undefined}
        >
          <span className={styles.icon}>
            <TagIcon />
          </span>
          <span className={styles.label}>{topicLabel(topic, topics)}</span>
          <span className={styles.count}>{counts.byTopic.get(topic) ?? 0}</span>
        </button>
      ))}
      {/* Gated on real video content existing, not a topic tag - see
          topics.ts's REGULAR_TOPICS comment. */}
      {counts.videoCount > 0 && (
        <button
          type="button"
          className={[styles.item, active === 'youtube' ? styles.itemActive : ''].filter(Boolean).join(' ')}
          onClick={() => onSelect('youtube')}
          title={collapsed ? 'YouTube' : undefined}
        >
          <span className={styles.icon}>
            <PlayGlyphIcon />
          </span>
          <span className={styles.label}>YouTube</span>
          <span className={styles.count}>{counts.videoCount}</span>
        </button>
      )}

      <div className={styles.groupLabel}>Library</div>
      <button
        type="button"
        className={[styles.item, active === 'saved' ? styles.itemActive : ''].filter(Boolean).join(' ')}
        onClick={() => onSelect('saved')}
        title={collapsed ? 'Saved' : undefined}
      >
        <span className={styles.icon}>
          <BookmarkIcon />
        </span>
        <span className={styles.label}>Saved</span>
        <span className={styles.count}>{counts.savedCount}</span>
      </button>
      <div className={styles.rowWithAction}>
        <button
          type="button"
          className={[styles.item, active === 'bookmarks' ? styles.itemActive : ''].filter(Boolean).join(' ')}
          onClick={() => onSelect('bookmarks')}
          title={collapsed ? 'Bookmarks' : undefined}
        >
          <span className={styles.icon}>
            <LinkIcon />
          </span>
          <span className={styles.label}>Bookmarks</span>
          <span className={styles.count}>{bookmarks.length}</span>
        </button>
        {!collapsed && (
          <button type="button" className={styles.rowAddBtn} onClick={onAddBookmark} title="Add a bookmark">
            <PlusIcon />
          </button>
        )}
      </div>
      <button
        type="button"
        className={[styles.item, active === 'books' ? styles.itemActive : ''].filter(Boolean).join(' ')}
        onClick={() => onSelect('books')}
        title={collapsed ? 'Books' : undefined}
      >
        <span className={styles.icon}>
          <BookIcon />
        </span>
        <span className={styles.label}>Books</span>
        <span className={styles.count}>{books.length}</span>
      </button>

      <button type="button" className={styles.manageBtn} onClick={onManageSources} title="Manage sources">
        <span className={styles.icon}>
          <GearIcon />
        </span>
        <span className={styles.label}>Manage sources</span>
      </button>
    </div>
  );
}
