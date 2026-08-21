import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { addTopic, removeTopic, renameTopic, reorderTopics } from '../../api/actions/reading';
import { renameCollection, reorderCollections, setCollectionIcon } from '../../api/actions/library';
import type { Book, LibraryCollection, ReadingItem } from '../../api/types';
import { Menu, type MenuItem } from '../../primitives/Menu/Menu';
import { useMenu } from '../../primitives/Menu/useMenu';
import { GlyphPicker } from '../../primitives/GlyphPicker/GlyphPicker';
import { GlyphIcon } from '../../primitives/GlyphPicker/glyphs';
import { Spinner } from '../../primitives/Spinner/Spinner';
import { useToast } from '../../primitives/Toast/ToastProvider';
import { GearIcon, ReadingIcon, SearchIcon } from '../../shell/icons';
import { CollectionIcon, StarIcon } from '../Library/icons';
import { buildCollectionTree } from '../Library/utils';
import { BookIcon, PlusIcon, PlayGlyphIcon } from './icons';
import {
  readingMode,
  savesSectionKey,
  type ReadingMode,
  type ReadingSection,
  type TopicDef,
  topicLabel,
} from './topics';
import { TopicIcon } from './topicIcons';
import styles from './ReadingSidebarNav.module.css';

const TOPIC_DRAG_TYPE = 'application/x-control-center-reading-topic';
const COLLECTION_DRAG_TYPE = 'application/x-control-center-reading-collection';

type RenameTarget =
  | { kind: 'topic'; id: string; label: string }
  | { kind: 'collection'; id: string; title: string };

function RenameInput({
  value,
  onChange,
  onSave,
  onCancel,
  nested,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  nested?: boolean;
}) {
  return (
    <div className={[styles.renameRow, nested ? styles.itemChild : ''].filter(Boolean).join(' ')}>
      <input
        className={styles.renameInput}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onSave}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSave();
          if (event.key === 'Escape') onCancel();
        }}
        autoFocus
      />
    </div>
  );
}

export type { ReadingSection };

interface ReadingSidebarNavProps {
  items: ReadingItem[];
  books: Book[];
  collections: LibraryCollection[];
  libraryConfigured: boolean;
  savesSearch: string;
  onSavesSearchChange: (value: string) => void;
  topics: TopicDef[];
  active: ReadingSection;
  onSelect: (key: ReadingSection) => void;
  onSelectBook?: (book: Book) => void;
  onManageSources: () => void;
  onTopicIconChange: (id: string, icon: string) => Promise<void>;
  collapsed?: boolean;
}

const MODES: { id: ReadingMode; label: string; title: string }[] = [
  { id: 'feed', label: 'Feed', title: 'Feed' },
  { id: 'saves', label: 'Saves', title: 'Saves' },
  { id: 'books', label: 'Books', title: 'Books' },
];

// Three modes, one list at a time. Feed topics and Raindrop collections
// both use names like "Design" / "Games" - showing them stacked in one
// forever-expanded sidebar made the nav unreadable. Mode switcher keeps
// those vocabularies in separate rooms.
export function ReadingSidebarNav({
  items,
  books,
  collections,
  libraryConfigured,
  savesSearch,
  onSavesSearchChange,
  topics,
  active,
  onSelect,
  onSelectBook,
  onManageSources,
  onTopicIconChange,
  collapsed,
}: ReadingSidebarNavProps) {
  const { push } = useToast();
  const mode = readingMode(active);

  // Remember where you were in Feed / Saves so flipping modes doesn't
  // always dump you on For You / Recent.
  const [lastFeed, setLastFeed] = useState<ReadingSection>('foryou');
  const [lastSaves, setLastSaves] = useState<ReadingSection>('saves');

  useEffect(() => {
    if (mode === 'feed') setLastFeed(active);
    if (mode === 'saves') setLastSaves(active);
  }, [active, mode]);

  function selectMode(next: ReadingMode) {
    if (next === mode) return;
    if (next === 'feed') onSelect(lastFeed);
    else if (next === 'saves') onSelect(lastSaves);
    else onSelect('books');
  }

  const [override, setOverride] = useState<TopicDef[] | null>(null);
  const liveTopics = override ?? topics;

  useEffect(() => {
    if (!override) return;
    const matches =
      override.length === topics.length &&
      override.every(
        (topic, index) =>
          topic.id === topics[index]?.id && topic.label === topics[index]?.label && topic.icon === topics[index]?.icon,
      );
    if (matches) setOverride(null);
  }, [topics, override]);

  const orderedTopics = useMemo(
    () => liveTopics.map((t) => t.id).filter((id) => id !== 'youtube'),
    [liveTopics],
  );
  const [addingTopic, setAddingTopic] = useState(false);
  const [newTopicLabel, setNewTopicLabel] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const topicMenu = useMenu();
  const collectionMenu = useMenu();
  const [menuTopic, setMenuTopic] = useState<string | null>(null);
  const [menuCollection, setMenuCollection] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<RenameTarget | null>(null);
  const [collectionOverrides, setCollectionOverrides] = useState<Record<string, { title?: string; icon?: string }>>({});
  const [iconPicker, setIconPicker] = useState<
    { kind: 'topic'; id: string; x: number; y: number } | { kind: 'collection'; id: string; x: number; y: number } | null
  >(null);
  const [draggingTopic, setDraggingTopic] = useState<string | null>(null);
  const topicDragMoved = useRef(false);
  const [draggingCollection, setDraggingCollection] = useState<string | null>(null);
  const collectionDragMoved = useRef(false);
  const [collectionDrop, setCollectionDrop] = useState<{ id: string; edge: 'before' | 'after' } | null>(null);
  const [collectionOrder, setCollectionOrder] = useState<string[] | null>(null);
  const [topicDrop, setTopicDrop] = useState<{ id: string; edge: 'before' | 'after' } | null>(null);

  useEffect(() => {
    setCollectionOverrides((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next: Record<string, { title?: string; icon?: string }> = {};
      for (const [id, override] of Object.entries(prev)) {
        const collection = collections.find((item) => item.id === id);
        if (!collection) continue;
        const patch: { title?: string; icon?: string } = {};
        if (override.title !== undefined && override.title !== collection.title) patch.title = override.title;
        if (override.icon !== undefined && override.icon !== (collection.icon ?? undefined)) patch.icon = override.icon;
        if (Object.keys(patch).length > 0) next[id] = patch;
      }
      return Object.keys(next).length === Object.keys(prev).length &&
        Object.entries(next).every(([id, patch]) => {
          const prevPatch = prev[id];
          return prevPatch?.title === patch.title && prevPatch?.icon === patch.icon;
        })
        ? prev
        : next;
    });
  }, [collections]);

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

  function handleTopicContextMenu(e: React.MouseEvent, topic: string) {
    setMenuTopic(topic);
    setMenuCollection(null);
    topicMenu.openAt(e);
  }

  function handleCollectionContextMenu(e: React.MouseEvent, collectionId: string) {
    setMenuCollection(collectionId);
    setMenuTopic(null);
    collectionMenu.openAt(e);
  }

  function displayCollection(c: LibraryCollection): LibraryCollection {
    const override = collectionOverrides[c.id];
    if (!override) return c;
    return {
      ...c,
      title: override.title ?? c.title,
      icon: override.icon ?? c.icon,
    };
  }

  async function saveRename() {
    if (!renaming) return;
    if (renaming.kind === 'topic') {
      const trimmed = renaming.label.trim();
      if (!trimmed) {
        setRenaming(null);
        return;
      }
      const previous = liveTopics;
      setOverride(liveTopics.map((topic) => (topic.id === renaming.id ? { ...topic, label: trimmed } : topic)));
      setRenaming(null);
      try {
        const result = await renameTopic(renaming.id, trimmed);
        if (!result.ok) throw new Error(result.error || 'Could not rename topic');
      } catch (error) {
        setOverride(previous);
        push(error instanceof Error ? error.message : 'Could not rename topic', 'error');
      }
      return;
    }

    const trimmed = renaming.title.trim();
    if (!trimmed) {
      setRenaming(null);
      return;
    }
    const previous = collectionOverrides;
    setCollectionOverrides((value) => ({
      ...value,
      [renaming.id]: { ...value[renaming.id], title: trimmed },
    }));
    setRenaming(null);
    try {
      const result = await renameCollection(renaming.id, trimmed);
      if (!result.ok) throw new Error(result.error || 'Could not rename collection');
    } catch (error) {
      setCollectionOverrides(previous);
      push(error instanceof Error ? error.message : 'Could not rename collection', 'error');
    }
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

  async function handleSetCollectionIcon(collectionId: string, icon: string) {
    const previous = collectionOverrides;
    setCollectionOverrides((value) => ({
      ...value,
      [collectionId]: { ...value[collectionId], icon },
    }));
    try {
      const result = await setCollectionIcon(collectionId, icon);
      if (!result.ok) throw new Error(result.error || 'Could not change collection icon');
    } catch (error) {
      setCollectionOverrides(previous);
      push(error instanceof Error ? error.message : 'Could not change collection icon', 'error');
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
    const label = topicLabel(menuTopic, liveTopics);
    const items: MenuItem[] = [{ heading: label }];
    items.push({
      label: 'Rename…',
      onClick: () => setRenaming({ kind: 'topic', id: menuTopic, label }),
    });
    items.push({
      label: 'Change icon…',
      icon: <TopicIcon icon={liveTopics.find((topic) => topic.id === menuTopic)?.icon} />,
      onClick: () => setIconPicker({ kind: 'topic', id: menuTopic, x: topicMenu.x, y: topicMenu.y }),
    });
    if (menuTopic === 'interesting') {
      items.push({ sep: true }, { heading: "Can't be removed - it's the default" });
    } else {
      items.push({ sep: true }, { label: 'Remove topic', danger: true, onClick: handleRemoveTopic });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuTopic, liveTopics, topicMenu.x, topicMenu.y]);

  const collectionMenuItems = useMemo<MenuItem[]>(() => {
    if (!menuCollection) return [];
    const collection = collections.find((item) => item.id === menuCollection);
    if (!collection) return [];
    const display = displayCollection(collection);
    return [
      { heading: display.title },
      {
        label: 'Rename…',
        onClick: () => setRenaming({ kind: 'collection', id: menuCollection, title: display.title }),
      },
      {
        label: 'Change icon…',
        icon: display.icon ? <GlyphIcon icon={display.icon} size={15} /> : <CollectionIcon />,
        onClick: () =>
          setIconPicker({ kind: 'collection', id: menuCollection, x: collectionMenu.x, y: collectionMenu.y }),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuCollection, collections, collectionOverrides, collectionMenu.x, collectionMenu.y]);

  const counts = useMemo(() => {
    const byTopic = new Map<string, number>();
    let videoCount = 0;
    for (const item of items) {
      byTopic.set(item.topic, (byTopic.get(item.topic) ?? 0) + 1);
      if (item.kind === 'video') videoCount++;
    }
    return { byTopic, videoCount };
  }, [items]);

  const orderedCollections = useMemo(() => {
    if (!collectionOrder) return collections;
    const rank = new Map(collectionOrder.map((id, i) => [id, i]));
    return [...collections].sort((a, b) => {
      const ar = rank.get(a.id) ?? 10_000;
      const br = rank.get(b.id) ?? 10_000;
      if (ar !== br) return ar - br;
      return a.title.localeCompare(b.title);
    });
  }, [collections, collectionOrder]);

  useEffect(() => {
    if (!collectionOrder) return;
    const ids = new Set(collections.map((c) => c.id));
    if (collectionOrder.every((id) => ids.has(id)) && collectionOrder.length === collections.filter((c) => !c.parentId).length) {
      const serverRoots = collections.filter((c) => !c.parentId).map((c) => c.id);
      if (serverRoots.every((id, i) => id === collectionOrder[i])) setCollectionOrder(null);
    }
  }, [collections, collectionOrder]);

  const { roots, byParent } = useMemo(() => buildCollectionTree(orderedCollections), [orderedCollections]);

  async function handleReorderCollection(source: string, target: string, edge: 'before' | 'after') {
    if (source === target) return;
    const nextIds = roots.map((c) => c.id).filter((id) => id !== source);
    let index = nextIds.indexOf(target);
    if (index < 0) return;
    if (edge === 'after') index += 1;
    nextIds.splice(index, 0, source);
    const previous = collectionOrder;
    setCollectionOrder(nextIds);
    setDraggingCollection(null);
    setCollectionDrop(null);
    try {
      const result = await reorderCollections(nextIds);
      if (!result.ok) throw new Error(result.error || 'Could not reorder collections');
    } catch (error) {
      setCollectionOrder(previous);
      push(error instanceof Error ? error.message : 'Could not reorder collections', 'error');
    }
  }
  const readingCount = books.filter((b) => b.status === 'reading').length;
  const readingNow = useMemo(() => books.filter((b) => b.status === 'reading'), [books]);
  const wantLater = useMemo(() => books.filter((b) => b.status === 'want').slice(0, 8), [books]);
  const finished = useMemo(() => books.filter((b) => b.status === 'finished').slice(0, 4), [books]);

  function renderCollection(c: LibraryCollection, child = false) {
    const display = displayCollection(c);
    const key = savesSectionKey(c.id);
    const accent = display.color?.startsWith('#') ? display.color : display.color ? `#${display.color}` : undefined;
    const isRenaming = renaming?.kind === 'collection' && renaming.id === c.id;

    if (isRenaming && !collapsed) {
      return (
        <RenameInput
          key={c.id}
          value={renaming.title}
          onChange={(title) => setRenaming({ ...renaming, title })}
          onSave={saveRename}
          onCancel={() => setRenaming(null)}
          nested={child}
        />
      );
    }

    return (
      <div key={c.id} className={styles.collectionRow}>
        <button
          type="button"
          className={[styles.item, active === key ? styles.itemActive : '', child ? styles.itemChild : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => {
            if (!child && collectionDragMoved.current) {
              collectionDragMoved.current = false;
              return;
            }
            onSelect(key);
          }}
          onDoubleClick={() => !collapsed && setRenaming({ kind: 'collection', id: c.id, title: display.title })}
          onContextMenu={(event) => handleCollectionContextMenu(event, c.id)}
          title={display.title}
        >
          {display.icon ? (
            <span className={styles.icon}>
              <GlyphIcon icon={display.icon} size={15} />
            </span>
          ) : accent ? (
            <span className={styles.swatch} style={{ background: accent }} aria-hidden="true" />
          ) : (
            <span className={styles.icon}>
              <CollectionIcon />
            </span>
          )}
          <span className={styles.label}>{display.title}</span>
          <span className={styles.count}>{c.count}</span>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.nav} data-collapsed={collapsed ? '' : undefined} data-mode={mode}>
      <div className={styles.brand}>
        <span className={styles.brandGlyph}>
          <ReadingIcon />
        </span>
        <span className={styles.brandLabel}>Reading</span>
      </div>

      <div className={styles.modes} role="tablist" aria-label="Reading areas">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            className={[styles.modeBtn, mode === m.id ? styles.modeBtnActive : ''].filter(Boolean).join(' ')}
            onClick={() => selectMode(m.id)}
            title={m.title}
          >
            <span className={styles.modeIcon}>
              {m.id === 'feed' ? <ReadingIcon /> : m.id === 'saves' ? <CollectionIcon /> : <BookIcon />}
            </span>
            <span className={styles.modeLabel}>{m.label}</span>
          </button>
        ))}
      </div>

      {mode === 'feed' && (
        <div className={styles.modeBody}>
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

          {!collapsed && <div className={styles.groupLabel}>Topics</div>}

          {orderedTopics.map((topic) => {
            const drop = topicDrop?.id === topic ? topicDrop.edge : null;
            const isRenaming = renaming?.kind === 'topic' && renaming.id === topic;

            if (isRenaming && !collapsed) {
              return (
                <RenameInput
                  key={topic}
                  value={renaming.label}
                  onChange={(label) => setRenaming({ ...renaming, label })}
                  onSave={saveRename}
                  onCancel={() => setRenaming(null)}
                />
              );
            }

            return (
              <div
                key={topic}
                className={[
                  styles.topicRow,
                  !collapsed ? styles.topicRowDraggable : '',
                  draggingTopic === topic ? styles.dragging : '',
                  drop === 'before' ? styles.dropBefore : '',
                  drop === 'after' ? styles.dropAfter : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                draggable={!collapsed}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData(TOPIC_DRAG_TYPE, topic);
                  topicDragMoved.current = false;
                  setDraggingTopic(topic);
                }}
                onDrag={() => {
                  topicDragMoved.current = true;
                }}
                onDragEnd={() => {
                  setDraggingTopic(null);
                  setTopicDrop(null);
                }}
                onDragOver={(event: DragEvent<HTMLDivElement>) => {
                  if (!event.dataTransfer.types.includes(TOPIC_DRAG_TYPE) || draggingTopic === topic) return;
                  event.preventDefault();
                  const box = event.currentTarget.getBoundingClientRect();
                  setTopicDrop({
                    id: topic,
                    edge: event.clientY < box.top + box.height / 2 ? 'before' : 'after',
                  });
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) setTopicDrop(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const source = event.dataTransfer.getData(TOPIC_DRAG_TYPE);
                  if (source && topicDrop) void handleReorderTopic(source, topic, topicDrop.edge);
                }}
              >
                <button
                  type="button"
                  className={[styles.item, active === topic ? styles.itemActive : ''].filter(Boolean).join(' ')}
                  onClick={() => {
                    if (topicDragMoved.current) {
                      topicDragMoved.current = false;
                      return;
                    }
                    onSelect(topic);
                  }}
                  onDoubleClick={() =>
                    !collapsed && setRenaming({ kind: 'topic', id: topic, label: topicLabel(topic, liveTopics) })
                  }
                  onContextMenu={(event) => handleTopicContextMenu(event, topic)}
                  title={collapsed ? topicLabel(topic, liveTopics) : undefined}
                >
                  <span className={styles.icon}>
                    <TopicIcon icon={liveTopics.find((item) => item.id === topic)?.icon} />
                  </span>
                  <span className={styles.label}>{topicLabel(topic, liveTopics)}</span>
                  <span className={styles.count}>{counts.byTopic.get(topic) ?? 0}</span>
                </button>
              </div>
            );
          })}

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
              <button
                type="button"
                className={styles.addTopicConfirm}
                onClick={handleCreateTopic}
                disabled={addBusy || !newTopicLabel.trim()}
              >
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

          <button type="button" className={styles.manageBtn} onClick={onManageSources} title="Manage sources">
            <span className={styles.icon}>
              <GearIcon />
            </span>
            <span className={styles.label}>Manage sources</span>
          </button>
        </div>
      )}

      {mode === 'saves' && (
        <div className={styles.modeBody}>
          {libraryConfigured && !collapsed && (
            <label className={styles.search}>
              <SearchIcon />
              <input
                className={styles.searchInput}
                type="search"
                placeholder="Search saves…"
                value={savesSearch}
                onChange={(e) => onSavesSearchChange(e.target.value)}
                aria-label="Search saves"
              />
            </label>
          )}

          <button
            type="button"
            className={[styles.item, active === 'saves' ? styles.itemActive : ''].filter(Boolean).join(' ')}
            onClick={() => onSelect('saves')}
            title={collapsed ? 'Recent' : undefined}
          >
            <span className={styles.icon}>
              <ReadingIcon />
            </span>
            <span className={styles.label}>Recent</span>
          </button>
          <button
            type="button"
            className={[styles.item, active === 'saves-unsorted' ? styles.itemActive : ''].filter(Boolean).join(' ')}
            onClick={() => onSelect('saves-unsorted')}
            title={collapsed ? 'Unsorted' : undefined}
          >
            <span className={styles.icon}>
              <CollectionIcon />
            </span>
            <span className={styles.label}>Unsorted</span>
          </button>
          <button
            type="button"
            className={[styles.item, active === 'saves-favorites' ? styles.itemActive : ''].filter(Boolean).join(' ')}
            onClick={() => onSelect('saves-favorites')}
            title={collapsed ? 'Favorites' : undefined}
          >
            <span className={styles.icon}>
              <StarIcon />
            </span>
            <span className={styles.label}>Favorites</span>
          </button>

          {libraryConfigured && roots.length > 0 && (
            <>
              {!collapsed && <div className={styles.groupLabel}>Collections</div>}
              {roots.map((c) => {
                const drop = collectionDrop?.id === c.id ? collectionDrop.edge : null;
                return (
                  <div
                    key={c.id}
                    className={[
                      styles.collectionGroup,
                      !collapsed ? styles.collectionGroupDraggable : '',
                      draggingCollection === c.id ? styles.dragging : '',
                      drop === 'before' ? styles.dropBefore : '',
                      drop === 'after' ? styles.dropAfter : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    draggable={!collapsed}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData(COLLECTION_DRAG_TYPE, c.id);
                      collectionDragMoved.current = false;
                      setDraggingCollection(c.id);
                    }}
                    onDrag={() => {
                      collectionDragMoved.current = true;
                    }}
                    onDragEnd={() => {
                      setDraggingCollection(null);
                      setCollectionDrop(null);
                    }}
                    onDragOver={(event: DragEvent<HTMLDivElement>) => {
                      if (!event.dataTransfer.types.includes(COLLECTION_DRAG_TYPE) || draggingCollection === c.id) return;
                      event.preventDefault();
                      const box = event.currentTarget.getBoundingClientRect();
                      setCollectionDrop({
                        id: c.id,
                        edge: event.clientY < box.top + box.height / 2 ? 'before' : 'after',
                      });
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node)) setCollectionDrop(null);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const source = event.dataTransfer.getData(COLLECTION_DRAG_TYPE);
                      if (source && collectionDrop) void handleReorderCollection(source, c.id, collectionDrop.edge);
                    }}
                  >
                    {renderCollection(c)}
                    {(byParent.get(c.id) ?? []).map((child) => renderCollection(child, true))}
                  </div>
                );
              })}
            </>
          )}

          {!libraryConfigured && !collapsed && (
            <p className={styles.savesHint}>Connect Raindrop in Settings to sync phone saves here.</p>
          )}
        </div>
      )}

      {mode === 'books' && (
        <div className={styles.modeBody}>
          {!collapsed ? (
            <>
              <div className={styles.booksNote}>
                <span className={styles.booksNoteTitle}>Your shelf</span>
                <span className={styles.booksNoteMeta}>
                  {books.length === 0
                    ? 'Scan your folder or add a book'
                    : readingCount > 0
                      ? `${readingCount} reading · ${books.length} total`
                      : `${books.length} on the shelf`}
                </span>
              </div>
              {readingNow.length > 0 && (
                <div className={styles.booksGroup}>
                  <span className={styles.booksGroupLabel}>Reading now</span>
                  {readingNow.map((book) => (
                    <button
                      key={book.id}
                      type="button"
                      className={styles.booksItem}
                      onClick={() => {
                        onSelect('books');
                        onSelectBook?.(book);
                      }}
                      title={book.title}
                    >
                      <span className={styles.booksItemTitle}>{book.title}</span>
                      {book.progress_pct > 0 && (
                        <span className={styles.booksItemMeta}>{book.progress_pct}%</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {wantLater.length > 0 && (
                <div className={styles.booksGroup}>
                  <span className={styles.booksGroupLabel}>Want to read</span>
                  {wantLater.map((book) => (
                    <button
                      key={book.id}
                      type="button"
                      className={styles.booksItem}
                      onClick={() => {
                        onSelect('books');
                        onSelectBook?.(book);
                      }}
                      title={book.title}
                    >
                      <span className={styles.booksItemTitle}>{book.title}</span>
                    </button>
                  ))}
                </div>
              )}
              {finished.length > 0 && (
                <div className={styles.booksGroup}>
                  <span className={styles.booksGroupLabel}>Finished</span>
                  {finished.map((book) => (
                    <button
                      key={book.id}
                      type="button"
                      className={styles.booksItem}
                      onClick={() => {
                        onSelect('books');
                        onSelectBook?.(book);
                      }}
                      title={book.title}
                    >
                      <span className={styles.booksItemTitle}>{book.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <button
              type="button"
              className={[styles.item, styles.itemActive].join(' ')}
              onClick={() => onSelect('books')}
              title="Books"
            >
              <span className={styles.icon}>
                <BookIcon />
              </span>
            </button>
          )}
        </div>
      )}

      <Menu open={topicMenu.open} x={topicMenu.x} y={topicMenu.y} onClose={topicMenu.close} items={topicMenuItems} />
      <Menu
        open={collectionMenu.open}
        x={collectionMenu.x}
        y={collectionMenu.y}
        onClose={collectionMenu.close}
        items={collectionMenuItems}
      />
      <GlyphPicker
        open={!!iconPicker}
        x={iconPicker?.x ?? 0}
        y={iconPicker?.y ?? 0}
        value={
          iconPicker?.kind === 'topic'
            ? liveTopics.find((topic) => topic.id === iconPicker.id)?.icon
            : iconPicker?.kind === 'collection'
              ? (() => {
                  const collection = collections.find((item) => item.id === iconPicker.id);
                  return collection ? (displayCollection(collection).icon ?? undefined) : undefined;
                })()
              : undefined
        }
        onChange={(icon) => {
          if (!iconPicker) return;
          if (iconPicker.kind === 'topic') void handleSetIcon(iconPicker.id, icon);
          else void handleSetCollectionIcon(iconPicker.id, icon);
        }}
        onClose={() => setIconPicker(null)}
      />
    </div>
  );
}
