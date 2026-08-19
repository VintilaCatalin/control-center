import { type DragEvent, useEffect, useMemo, useState } from 'react';
import { addTopic, removeTopic, reorderTopics } from '../../api/actions/reading';
import type { Book, ReadingItem } from '../../api/types';
import { Menu, type MenuItem } from '../../primitives/Menu/Menu';
import { useMenu } from '../../primitives/Menu/useMenu';
import { GlyphPicker } from '../../primitives/GlyphPicker/GlyphPicker';
import { Spinner } from '../../primitives/Spinner/Spinner';
import { useToast } from '../../primitives/Toast/ToastProvider';
import { GearIcon, ReadingIcon } from '../../shell/icons';
import { BookIcon, BookmarkIcon, LinkIcon, PlayGlyphIcon, PlusIcon } from './icons';
import { type ReadingSection, type TopicDef, topicLabel } from './topics';
import { TopicIcon } from './topicIcons';
import styles from './ReadingSidebarNav.module.css';

const TOPIC_DRAG_TYPE = 'application/x-control-center-reading-topic';

function GripIcon() { return <svg width="12" height="14" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.2" /><circle cx="9" cy="3" r="1.2" /><circle cx="3" cy="8" r="1.2" /><circle cx="9" cy="8" r="1.2" /><circle cx="3" cy="13" r="1.2" /><circle cx="9" cy="13" r="1.2" /></svg>; }

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
  onTopicIconChange: (id: string, icon: string) => Promise<void>;
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
  onTopicIconChange,
  collapsed,
}: ReadingSidebarNavProps) {
  const { push } = useToast();
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
    const matches = override.length === topics.length && override.every((topic, index) => topic.id === topics[index]?.id && topic.label === topics[index]?.label && topic.icon === topics[index]?.icon);
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
  const [iconPicker, setIconPicker] = useState<{ topic: string; x: number; y: number } | null>(null);
  const [draggingTopic, setDraggingTopic] = useState<string | null>(null);
  const [topicDrop, setTopicDrop] = useState<{ id: string; edge: 'before' | 'after' } | null>(null);

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
    const previous = liveTopics;
    setOverride(liveTopics.map((t) => (t.id === topic ? { ...t, icon } : t)));
    try {
      await onTopicIconChange(topic, icon);
    } catch {
      setOverride(previous);
    }
  }

  async function handleReorderTopic(source: string, target: string, edge: 'before' | 'after') {
    if (source === target) return;
    const nextIds = orderedTopics.filter((id) => id !== source);
    let index = nextIds.indexOf(target);
    if (index < 0) return;
    if (edge === 'after') index += 1;
    nextIds.splice(index, 0, source);
    const previous = liveTopics;
    const byId = new Map(liveTopics.map((topic) => [topic.id, topic]));
    const hidden = liveTopics.filter((topic) => topic.id === 'youtube');
    const next = [...nextIds.map((id) => byId.get(id)).filter((topic): topic is TopicDef => !!topic), ...hidden];
    setOverride(next);
    setDraggingTopic(null);
    setTopicDrop(null);
    try {
      const result = await reorderTopics(next.map((topic) => topic.id));
      if (!result.ok) throw new Error(result.error || 'Could not reorder topics');
    } catch (error) {
      setOverride(previous);
      push(error instanceof Error ? error.message : 'Could not reorder topics', 'error');
    }
  }

  const topicMenuItems = useMemo<MenuItem[]>(() => {
    if (!menuTopic) return [];
    const items: MenuItem[] = [{ heading: topicLabel(menuTopic, liveTopics) }];
    items.push({ label: 'Change icon…', icon: <TopicIcon icon={liveTopics.find((topic) => topic.id === menuTopic)?.icon} />, onClick: () => setIconPicker({ topic: menuTopic, x: topicMenu.x, y: topicMenu.y }) });
    if (menuTopic === 'interesting') {
      items.push({ sep: true }, { heading: "Can't be removed - it's the default" });
    } else {
      items.push({ sep: true }, { label: 'Remove topic', danger: true, onClick: handleRemoveTopic });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuTopic, liveTopics, topicMenu.x, topicMenu.y]);

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
      {orderedTopics.map((topic) => {
        const drop = topicDrop?.id === topic ? topicDrop.edge : null;
        return <div key={topic} className={[styles.topicRow, draggingTopic === topic ? styles.dragging : '', drop === 'before' ? styles.dropBefore : '', drop === 'after' ? styles.dropAfter : ''].filter(Boolean).join(' ')} onDragOver={(event: DragEvent<HTMLDivElement>) => { if (!event.dataTransfer.types.includes(TOPIC_DRAG_TYPE) || draggingTopic === topic) return; event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); setTopicDrop({ id: topic, edge: event.clientY < box.top + box.height / 2 ? 'before' : 'after' }); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setTopicDrop(null); }} onDrop={(event) => { event.preventDefault(); const source = event.dataTransfer.getData(TOPIC_DRAG_TYPE); if (source && topicDrop) void handleReorderTopic(source, topic, topicDrop.edge); }}>
          <button type="button" className={[styles.item, active === topic ? styles.itemActive : ''].filter(Boolean).join(' ')} onClick={() => onSelect(topic)} onContextMenu={(event) => handleTopicContextMenu(event, topic)} title={collapsed ? topicLabel(topic, liveTopics) : undefined}>
            <span className={styles.icon}><TopicIcon icon={liveTopics.find((item) => item.id === topic)?.icon} /></span>
            <span className={styles.label}>{topicLabel(topic, liveTopics)}</span>
            <span className={styles.count}>{counts.byTopic.get(topic) ?? 0}</span>
          </button>
          {!collapsed && <span className={styles.topicDragHandle} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(TOPIC_DRAG_TYPE, topic); setDraggingTopic(topic); }} onDragEnd={() => { setDraggingTopic(null); setTopicDrop(null); }} title={`Move ${topicLabel(topic, liveTopics)}`} aria-label={`Move ${topicLabel(topic, liveTopics)}`}><GripIcon /></span>}
        </div>;
      })}
      <Menu open={topicMenu.open} x={topicMenu.x} y={topicMenu.y} onClose={topicMenu.close} items={topicMenuItems} />
      <GlyphPicker open={!!iconPicker} x={iconPicker?.x ?? 0} y={iconPicker?.y ?? 0} value={liveTopics.find((topic) => topic.id === iconPicker?.topic)?.icon} onChange={(icon) => { if (iconPicker) void handleSetIcon(iconPicker.topic, icon); }} onClose={() => setIconPicker(null)} />

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
            {addBusy ? <Spinner size={12} /> : 'Add'}
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
