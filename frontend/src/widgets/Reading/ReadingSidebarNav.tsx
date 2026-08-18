import { useEffect, useMemo, useState } from 'react';
import { addTopic, removeTopic, reorderTopics, setTopicIcon } from '../../api/actions/reading';
import type { Book, ReadingItem } from '../../api/types';
import { Menu, type MenuItem } from '../../primitives/Menu/Menu';
import { useMenu } from '../../primitives/Menu/useMenu';
import { GearIcon, ReadingIcon } from '../../shell/icons';
import { BookIcon, BookmarkIcon, LinkIcon, PlayGlyphIcon, PlusIcon } from './icons';
import { type ReadingSection, type TopicDef, topicLabel } from './topics';
import { TOPIC_ICON_IDS, TopicIcon } from './topicIcons';
import styles from './ReadingSidebarNav.module.css';

function iconLabel(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

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
  // Create/remove both write through the backend then wait for the next
  // 2s poll to see it reflected in `topics` - which reads as "nothing
  // happened" for a beat. This mirrors the real value locally the instant
  // you act, and drops the override itself once the polled `topics` prop
  // actually contains what we predicted - so it never drifts from truth,
  // it just doesn't make you wait for it (same shape as ReadingFeed's own
  // pendingSaved optimistic-until-reconciled state).
  const [override, setOverride] = useState<TopicDef[] | null>(null);
  const liveTopics = override ?? topics;

  useEffect(() => {
    if (!override) return;
    const overrideIds = new Set(override.map((t) => t.id));
    const propIds = new Set(topics.map((t) => t.id));
    const matches = overrideIds.size === propIds.size && [...overrideIds].every((id) => propIds.has(id));
    if (matches) setOverride(null);
  }, [topics, override]);

  // The backend's own list order now (a plain ordered list, reorderable -
  // see reading_reorder_topics()), not re-sorted through REGULAR_TOPICS
  // on every render - that used to silently undo any custom order among
  // the original 9 the instant this memo recomputed. topics.ts's
  // ReadingSection comment covers why arbitrary topic ids can flow
  // through here without special-casing.
  const orderedTopics = useMemo(() => liveTopics.map((t) => t.id).filter((id) => id !== 'youtube'), [liveTopics]);
  const [addingTopic, setAddingTopic] = useState(false);
  const [newTopicLabel, setNewTopicLabel] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const topicMenu = useMenu();
  const [menuTopic, setMenuTopic] = useState<string | null>(null);

  async function handleCreateTopic() {
    const trimmed = newTopicLabel.trim();
    if (!trimmed) return;
    setAddBusy(true);
    const res = await addTopic(trimmed).catch(() => ({ ok: false as const, id: undefined as string | undefined }));
    setAddBusy(false);
    if (res.ok && res.id) {
      setOverride([...liveTopics, { id: res.id, label: trimmed, icon: 'tag' }]);
      setNewTopicLabel('');
      setAddingTopic(false);
      onSelect(res.id);
    }
  }

  // Opens for every topic now, including "interesting" - it just offers
  // fewer actions (no Remove) instead of not opening at all, so a
  // right-click always does *something* predictable rather than silently
  // no-op'ing on the one topic that happens to be protected.
  function handleTopicContextMenu(e: React.MouseEvent, topic: string) {
    setMenuTopic(topic);
    topicMenu.openAt(e);
  }

  async function handleRemoveTopic() {
    const topic = menuTopic;
    if (!topic) return;
    setOverride(liveTopics.filter((t) => t.id !== topic));
    if (active === topic) onSelect('foryou');
    await removeTopic(topic).catch(() => {});
  }

  async function handleSetIcon(topic: string, icon: string) {
    setOverride(liveTopics.map((t) => (t.id === topic ? { ...t, icon } : t)));
    await setTopicIcon(topic, icon).catch(() => {});
  }

  async function handleMoveTopic(topic: string, dir: -1 | 1) {
    const ids = orderedTopics;
    const from = ids.indexOf(topic);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const nextIds = [...ids];
    [nextIds[from], nextIds[to]] = [nextIds[to], nextIds[from]];
    const byId = new Map(liveTopics.map((t) => [t.id, t]));
    setOverride(nextIds.map((id) => byId.get(id)).filter((t): t is TopicDef => !!t));
    await reorderTopics(nextIds).catch(() => {});
  }

  const topicMenuItems = useMemo<MenuItem[]>(() => {
    if (!menuTopic) return [];
    const idx = orderedTopics.indexOf(menuTopic);
    const items: MenuItem[] = [{ heading: topicLabel(menuTopic, liveTopics) }];
    if (idx > 0) items.push({ label: 'Move up', onClick: () => handleMoveTopic(menuTopic, -1) });
    if (idx >= 0 && idx < orderedTopics.length - 1) items.push({ label: 'Move down', onClick: () => handleMoveTopic(menuTopic, 1) });
    items.push({ sep: true }, { heading: 'Icon' });
    for (const iconId of TOPIC_ICON_IDS) {
      items.push({ label: iconLabel(iconId), icon: <TopicIcon icon={iconId} />, onClick: () => handleSetIcon(menuTopic, iconId) });
    }
    if (menuTopic === 'interesting') {
      items.push({ sep: true }, { heading: "Can't be removed - it's the default" });
    } else {
      items.push({ sep: true }, { label: 'Remove topic', danger: true, onClick: handleRemoveTopic });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuTopic, orderedTopics, liveTopics]);

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
          onContextMenu={(e) => handleTopicContextMenu(e, topic)}
          title={collapsed ? topicLabel(topic, liveTopics) : undefined}
        >
          <span className={styles.icon}>
            <TopicIcon icon={liveTopics.find((t) => t.id === topic)?.icon} />
          </span>
          <span className={styles.label}>{topicLabel(topic, liveTopics)}</span>
          <span className={styles.count}>{counts.byTopic.get(topic) ?? 0}</span>
        </button>
      ))}
      <Menu open={topicMenu.open} x={topicMenu.x} y={topicMenu.y} onClose={topicMenu.close} items={topicMenuItems} />

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
