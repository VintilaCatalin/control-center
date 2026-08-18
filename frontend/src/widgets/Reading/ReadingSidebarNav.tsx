import { useMemo, useState } from 'react';
import { addTopic } from '../../api/actions/reading';
import type { Book, ReadingItem } from '../../api/types';
import { GearIcon, ReadingIcon } from '../../shell/icons';
import { BookIcon, BookmarkIcon, LinkIcon, PlayGlyphIcon, PlusIcon, TagIcon } from './icons';
import { REGULAR_TOPICS, type ReadingSection, type TopicDef, topicLabel } from './topics';
import styles from './ReadingSidebarNav.module.css';

export type { ReadingSection };

interface ReadingSidebarNavProps {
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
// PlexSidebarNav), not Notes' dense text-row list. Every real topic shows
// here now (not just ones an enabled source happens to be tagged with) -
// topics are directly created from the "+ Add topic" row right below the
// list, so a topic you just made needs to appear immediately, with a
// real (possibly zero) count, rather than staying invisible until you
// separately go tag a source with it in Manage Sources.
export function ReadingSidebarNav({
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
  // The original 9 first (stable, familiar order), then any custom
  // topics the user's created - see topics.ts's ReadingSection comment on
  // why arbitrary topic ids can flow through here without special-casing.
  const orderedTopics = useMemo(() => {
    const ids = topics.map((t) => t.id).filter((id) => id !== 'youtube');
    const known = REGULAR_TOPICS.filter((t) => ids.includes(t));
    const extra = ids.filter((id) => !REGULAR_TOPICS.includes(id as (typeof REGULAR_TOPICS)[number]));
    return [...known, ...extra];
  }, [topics]);
  const [addingTopic, setAddingTopic] = useState(false);
  const [newTopicLabel, setNewTopicLabel] = useState('');
  const [addBusy, setAddBusy] = useState(false);

  async function handleCreateTopic() {
    const trimmed = newTopicLabel.trim();
    if (!trimmed) return;
    setAddBusy(true);
    const res = await addTopic(trimmed).catch(() => ({ ok: false as const, id: undefined as string | undefined }));
    setAddBusy(false);
    if (res.ok) {
      setNewTopicLabel('');
      setAddingTopic(false);
      if (res.id) onSelect(res.id);
    }
  }

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

      {addingTopic ? (
        <div className={styles.addTopicRow}>
          <input
            type="text"
            className={styles.addTopicInput}
            placeholder="Topic name"
            value={newTopicLabel}
            onChange={(e) => setNewTopicLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateTopic();
              if (e.key === 'Escape') setAddingTopic(false);
            }}
            autoFocus
          />
          <button type="button" className={styles.addTopicConfirm} onClick={handleCreateTopic} disabled={addBusy || !newTopicLabel.trim()}>
            {addBusy ? '…' : 'Add'}
          </button>
        </div>
      ) : (
        !collapsed && (
          <button type="button" className={styles.item} onClick={() => setAddingTopic(true)}>
            <span className={styles.icon}>
              <PlusIcon />
            </span>
            <span className={styles.label}>Add topic</span>
          </button>
        )
      )}

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
