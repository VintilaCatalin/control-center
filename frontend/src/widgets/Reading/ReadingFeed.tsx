import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toggleRaindropSave } from '../../api/actions/library';
import { hideItem, markRead } from '../../api/actions/reading';
import type { Book, ReadingItem } from '../../api/types';
import { type PanelDef, PanelGrid } from '../../primitives/PanelGrid/PanelGrid';
import { BooksPanel } from './BooksPanel';
import { DesignSection } from './DesignSection';
import { FeedHero } from './FeedHero';
import { FeedSection } from './FeedSection';
import { LinkListSection } from './LinkListSection';
import { ReadingList } from './ReadingList';
import { SavesGlance } from './SavesGlance';
import { SportSection } from './SportSection';
import { TechSection } from './TechSection';
import type { ReadingSection, TopicDef } from './topics';
import { REGULAR_TOPICS, topicLabel } from './topics';
import { VideoCard } from './VideoCard';
import { VideoGridSection } from './VideoGridSection';
import { VisualSection } from './VisualSection';
import { YouTubeRail } from './YouTubeRail';
import styles from './ReadingFeed.module.css';

interface ReadingFeedProps {
  items: ReadingItem[];
  section: ReadingSection;
  books: Book[];
  topics: TopicDef[];
  errors?: Record<string, string>;
  onOpenItem: (item: ReadingItem) => void;
  onSelectBook: (book: Book) => void;
  onSelectSection: (section: ReadingSection) => void;
  onTopicIconChange: (id: string, icon: string) => Promise<void>;
}

interface ActionHandlers {
  onOpen: (item: ReadingItem) => void;
  onToggleSave: (item: ReadingItem) => void;
  onDismiss?: (item: ReadingItem) => void;
}

// Round-robin across topics (each topic's own items stay in the backend's
// recency order) rather than pure chronological - so one prolific source
// doesn't dominate the "curated, not algorithmically stuffed" For You feed.
function forYouOrder(items: ReadingItem[]): ReadingItem[] {
  const byTopic = new Map<string, ReadingItem[]>();
  for (const item of items) {
    const bucket = byTopic.get(item.topic);
    if (bucket) bucket.push(item);
    else byTopic.set(item.topic, [item]);
  }
  const queues = [...byTopic.values()];
  const out: ReadingItem[] = [];
  let index = 0;
  while (out.length < items.length) {
    const queue = queues[index % queues.length];
    if (queue.length) out.push(queue.shift()!);
    index++;
    if (queues.every((q) => q.length === 0)) break;
  }
  return out;
}

// Deterministic, not re-rolled every render (that would make panels
// visibly reshuffle their internal layout on every 2s poll) - a stable
// per-topic hash instead of Math.random(). "visual" only sticks if the
// topic actually has enough photographed items to fill a photo grid;
// otherwise it falls back to the plain card grid rather than rendering
// three photos and a lot of empty space.
//
// 'list' is a pure-text treatment (see LinkListSection) with no
// thumbnail/video affordance at all, so a topic whose items are mostly
// video (a YouTube-heavy source list - travel/games in practice) must
// never land there, or a video ends up looking like a plain article
// link. Route video-heavy topics to 'video' instead - the exact same
// VideoCard the From YouTube rail uses, just wrapped into a grid, so a
// video looks the same everywhere in the app rather than getting a
// different article-shaped treatment (FeedCard/VisualSection) with a
// play badge stapled on depending on which topic it happened to land in.
// Cycled by each topic panel's own position, not hashed from the topic
// name - a hash has no idea which variant its neighbours landed on, so
// nothing stopped e.g. tech/design/games (an entirely plausible hash
// collision) from all landing on 'grid' and reading as the same card
// design repeated three times, exactly what this was meant to avoid.
// Position-based cycling guarantees two ADJACENT panels never share a
// variant; only downgrade below can still occasionally repeat one.
const FREE_VARIANTS = ['grid', 'visual', 'list'] as const;

function pickVariant(topic: string, items: ReadingItem[], index: number): 'grid' | 'list' | 'visual' | 'video' | 'design' | 'sport' | 'tech' {
  const videoHeavy = items.length > 0 && items.filter((i) => i.kind === 'video').length / items.length >= 0.5;
  if (videoHeavy) return 'video';

  // Design, Sport, and Tech each have their own dedicated composition.
  if (topic === 'design') return 'design';
  if (topic === 'sport') return 'sport';
  if (topic === 'tech') return 'tech';

  // "Interesting" is the catch-all bucket by nature (unrelated stuff
  // that doesn't fit a real topic) - a plain link list suits it better
  // than card treatment every time, not just when the cycle happens to
  // land there - as long as it isn't video-heavy (handled above).
  if (topic === 'interesting') return 'list';
  const variant = FREE_VARIANTS[index % FREE_VARIANTS.length];
  if (variant === 'visual' && items.filter((i) => i.thumb).length < 3) return 'grid';
  return variant;
}

// "For You": a bold editorial hero band, a YouTube rail, then one
// resizable/reorderable panel per topic (see PanelGrid) - each panel's
// own internal layout varies (a card grid, a plain link list, or a photo
// masonry), so the page reads as genuinely different sections, not the
// same component repeated eight times. The hero's featured tile is
// always the single most recent article that actually has a photo -
// `items` is already recency-sorted from the backend, so the first
// article with a thumb is genuinely "the latest one with an image", not
// just the latest overall. If literally nothing has a photo, there's no
// hero band at all - just the rail and topic panels below.
//
// Topic panels are built from EVERY item of that topic, articles and
// videos alike - a topic tag and "is this a video" are independent axes
// (see topics.ts), and a topic whose current content happens to be
// entirely video (common for a YouTube-heavy source list) still deserves
// its own panel, not to have all of it silently siphoned into the
// YouTube rail and disappear from its own topic entirely. The rail below
// is just a preview of recent videos across every topic, not the only
// place a video ever appears.
const PINNED_KEY = 'reading:pinnedFeatured';

// The hero's featured story used to be a hard rule (recency-sorted,
// first article with a photo) - fine most of the time, but an ugly or
// off-topic source image would land there with no way to change it
// short of waiting for it to scroll out of the recency window. "Reload
// featured" skips today's pick and reveals the next eligible one;
// "pin" locks a specific story there (persisted in localStorage, not
// the backend - this is a display preference, not reading data) so a
// good pick survives the next poll instead of being silently replaced
// the moment a newer article arrives.
function useFeaturedPick(candidates: ReadingItem[]) {
  const [pinnedId, setPinnedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(PINNED_KEY);
    } catch {
      return null;
    }
  });
  const [skipIds, setSkipIds] = useState<Set<string>>(new Set());

  const pinnedCandidate = pinnedId ? (candidates.find((i) => i.id === pinnedId) ?? null) : null;
  const featured = pinnedCandidate ?? candidates.find((i) => !skipIds.has(i.id)) ?? candidates[0] ?? null;
  const pinned = !!pinnedCandidate;

  function clearPin() {
    setPinnedId(null);
    try {
      localStorage.removeItem(PINNED_KEY);
    } catch {
      /* ignore */
    }
  }

  function reload() {
    if (!featured) return;
    setSkipIds((prev) => new Set(prev).add(featured.id));
    if (pinned) clearPin();
  }

  function togglePin() {
    if (!featured) return;
    if (pinned) {
      clearPin();
      return;
    }
    setPinnedId(featured.id);
    try {
      localStorage.setItem(PINNED_KEY, featured.id);
    } catch {
      /* ignore */
    }
  }

  return { featured, pinned, reload, togglePin };
}

interface ForYouBodyProps extends ActionHandlers {
  items: ReadingItem[];
  books: Book[];
  topics: TopicDef[];
  onSelectBook: (book: Book) => void;
  onSelectSection: (section: ReadingSection) => void;
}

function ForYouBody({ items, books, topics, onOpen, onToggleSave, onDismiss, onSelectBook, onSelectSection }: ForYouBodyProps) {
  const videos = items.filter((i) => i.kind === 'video');
  const candidates = useMemo(() => items.filter((i) => i.kind !== 'video' && i.thumb), [items]);
  const { featured, pinned, reload, togglePin } = useFeaturedPick(candidates);

  const pool = featured ? items.filter((i) => i.id !== featured.id) : items;
  const ordered = forYouOrder(pool);
  // Three, not five - each with its own excerpt now (see FeedHero), so
  // the side column reads as a handful of real "more stories", not a
  // dense list of bare headlines competing with the photo for attention.
  // Video is still excluded here (the hero band is article territory);
  // anything not chosen flows into the topic panels below instead of
  // vanishing.
  // Three → six companions for a 2-column “Also today” beside a 50% hero.
  const heroSide = featured ? ordered.filter((i) => i.kind !== 'video').slice(0, 6) : [];
  const heroSideIds = new Set(heroSide.map((i) => i.id));
  const remaining = featured ? ordered.filter((i) => !heroSideIds.has(i.id)) : ordered;

  // Known topics first (stable order), then any custom ones actually
  // present in this batch - see ReadingSidebarNav's identical ordering,
  // both driven by real content instead of the old fixed 9-topic list.
  const presentTopicIds = Array.from(new Set(remaining.map((i) => i.topic)));
  const orderedTopicIds = [
    ...REGULAR_TOPICS.filter((t) => presentTopicIds.includes(t)),
    ...presentTopicIds.filter((t) => t !== 'youtube' && !REGULAR_TOPICS.includes(t as (typeof REGULAR_TOPICS)[number])),
  ];
  const topicPanels: PanelDef[] = orderedTopicIds.map((topic, index) => {
    const topicItems = remaining.filter((i) => i.topic === topic).slice(0, 8);
    const variant = pickVariant(topic, topicItems, index);
    const heading = topicLabel(topic, topics);
    const content =
      variant === 'video' ? (
        <VideoGridSection items={topicItems} onOpen={onOpen} onToggleSave={onToggleSave} onDismiss={onDismiss} />
      ) : variant === 'list' ? (
        <LinkListSection items={topicItems} onOpen={onOpen} onToggleSave={onToggleSave} onDismiss={onDismiss} />
      ) : variant === 'visual' ? (
        <VisualSection items={topicItems.filter((i) => i.thumb)} onOpen={onOpen} onToggleSave={onToggleSave} onDismiss={onDismiss} />
      ) : variant === 'design' ? (
        <DesignSection items={topicItems} onOpen={onOpen} onToggleSave={onToggleSave} onDismiss={onDismiss} />
      ) : variant === 'sport' ? (
        <SportSection items={topicItems} onOpen={onOpen} onToggleSave={onToggleSave} onDismiss={onDismiss} />
      ) : variant === 'tech' ? (
        <TechSection items={topicItems} onOpen={onOpen} onToggleSave={onToggleSave} onDismiss={onDismiss} />
      ) : (
        <FeedSection items={topicItems} onOpen={onOpen} onToggleSave={onToggleSave} onDismiss={onDismiss} />
      );
    return {
      id: topic,
      label: heading,
      content,
      minSize: { w: 1, h: 1 },
      defaultSize: topic === 'sport' ? { w: 2, h: 8 } : { w: 4, h: 8 },
    };
  });

  const seeAllAction = (section: ReadingSection) => (
    <button type="button" className={styles.seeAllBtn} onClick={() => onSelectSection(section)}>
      See all
    </button>
  );

  const extraPanels: PanelDef[] = [];
  extraPanels.push({
    id: 'saves-glance',
    label: 'Saves',
    minSize: { w: 1, h: 1 },
    defaultSize: { w: 4, h: 11 },
    headerAction: seeAllAction('saves'),
    content: <SavesGlance onOpenSaves={onSelectSection} />,
  });
  if (books.length > 0) {
    extraPanels.push({
      id: 'books',
      label: 'Books',
      minSize: { w: 1, h: 1 },
      defaultSize: { w: 4, h: 8 },
      headerAction: seeAllAction('books'),
      content: <BooksPanel books={books} onSelectBook={onSelectBook} />,
    });
  }

  // The YouTube rail is a panel too now, not a fixed strip above
  // everything else - it can be resized/reordered/hidden exactly like a
  // topic panel, first in the default order but not pinned there. A
  // normal (non-bleed) panel, same as every topic panel - `bleed` is for
  // full-art-background content like Now Playing, not a padded section
  // with a heading, which is exactly what this is.
  const panels: PanelDef[] =
    videos.length > 0
      ? [
          {
            id: 'youtube-rail',
            label: 'From YouTube',
            minSize: { w: 1, h: 1 },
            defaultSize: { w: 8, h: 6 },
            content: <YouTubeRail items={videos.slice(0, 12)} onOpen={onOpen} onToggleSave={onToggleSave} />,
          },
          ...topicPanels,
          ...extraPanels,
        ]
      : [...topicPanels, ...extraPanels];

  return (
    <div className={styles.forYou}>
      {featured && (
        <FeedHero featured={featured} side={heroSide} pinned={pinned} onOpen={onOpen} onToggleSave={onToggleSave} onReload={reload} onTogglePin={togglePin} />
      )}
      {panels.length > 0 && <PanelGrid view="reading-foryou" panels={panels} fallbackSize={{ w: 4, h: 8 }} />}
    </div>
  );
}

// YouTube's own section: all videos, wrapped in a grid, still using
// VideoCard's distinct video composition (unrelated to FeedCard).
function YouTubeBody({ items, onOpen, onToggleSave, onDismiss }: { items: ReadingItem[] } & ActionHandlers) {
  return (
    <div className={styles.videoGrid}>
      {items.map((item) => (
        <VideoCard key={item.id} item={item} onOpen={onOpen} onToggleSave={onToggleSave} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

export function ReadingFeed({ items, section, books, topics, errors, onOpenItem, onSelectBook, onSelectSection, onTopicIconChange }: ReadingFeedProps) {
  // Optimistic save-state overrides, cleared once the polled snapshot
  // itself agrees (or after a safety timeout) - same shape as PanelGrid's
  // own local-state-until-the-server-catches-up pattern. Dismissed ids
  // are simpler - once dismissed, an item is gone for good (the backend
  // filters it out of every future poll too), so there's no need to
  // reconcile it back the way saves do.
  const [pendingSaved, setPendingSaved] = useState<Record<string, boolean>>({});
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const pendingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    setPendingSaved((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const item of items) {
        if (item.id in next && next[item.id] === item.saved) {
          delete next[item.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items]);

  useEffect(() => {
    const timers = pendingTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const resolved = useMemo(
    () =>
      items
        .filter((item) => !dismissedIds.has(item.id))
        .map((item) => (item.id in pendingSaved ? { ...item, saved: pendingSaved[item.id] } : item)),
    [items, pendingSaved, dismissedIds],
  );

  function handleToggleSave(item: ReadingItem) {
    const next = !item.saved;
    setPendingSaved((prev) => ({ ...prev, [item.id]: next }));
    clearTimeout(pendingTimers.current[item.id]);
    pendingTimers.current[item.id] = setTimeout(() => {
      setPendingSaved((prev) => {
        if (!(item.id in prev)) return prev;
        const { [item.id]: _drop, ...rest } = prev;
        return rest;
      });
    }, 8000);
    toggleRaindropSave(
      { url: item.url, title: item.title, excerpt: item.blurb, cover: item.thumb },
      next,
      item.kind === 'video' ? 'youtube' : 'feed',
    ).catch(() => {
      setPendingSaved((prev) => ({ ...prev, [item.id]: item.saved }));
    });
  }

  // "Not interested" - instant, permanent (the backend's reading_hidden
  // list keeps it out of every future poll too, see reading_hide_item()).
  function handleDismiss(item: ReadingItem) {
    setDismissedIds((prev) => new Set(prev).add(item.id));
    hideItem(item.id).catch(() => {});
  }

  // Both articles and videos open an in-app detail overlay - Reading.tsx
  // picks ArticleDetail vs VideoDetail based on the item's own `kind`.
  function handleOpen(item: ReadingItem) {
    if (!item.read) markRead(item.id, true).catch(() => {});
    onOpenItem(item);
  }

  const handlers: ActionHandlers = { onOpen: handleOpen, onToggleSave: handleToggleSave, onDismiss: handleDismiss };

  let sectioned: ReadingItem[];
  let body: ReactNode;
  let activeTopic: TopicDef | undefined;

  if (section === 'foryou') {
    sectioned = resolved;
    body = <ForYouBody items={resolved} books={books} topics={topics} onSelectBook={onSelectBook} onSelectSection={onSelectSection} {...handlers} />;
  } else if (section === 'youtube') {
    sectioned = resolved.filter((i) => i.kind === 'video');
    body = <YouTubeBody items={sectioned} {...handlers} />;
  } else {
    sectioned = resolved.filter((i) => i.topic === section);
    activeTopic = topics.find((topic) => topic.id === section);
    // Keyed by section so switching topics remounts this fresh - the
    // alternative (an effect watching `items` to reset a stale
    // `sourceId`) works too, but this is what actually guarantees it:
    // a source picked in Tech has no reason to silently carry over and
    // empty out Design just because it happens to share no sources.
    body = <ReadingList key={section} heading={topicLabel(section, topics)} items={sectioned} topic={activeTopic} onTopicIconChange={onTopicIconChange} {...handlers} />;
  }

  if (sectioned.length === 0 && !activeTopic) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyTitle}>Nothing here yet</span>
        <span>Nothing from your sources in this section right now.</span>
      </div>
    );
  }

  const errorEntries = Object.entries(errors ?? {});
  return (
    <div className={styles.page}>
      {errorEntries.length > 0 && (
        <div className={styles.errorBanner} role="status">
          <span className={styles.errorTitle}>
            {errorEntries.length === 1 ? '1 source failed to refresh' : `${errorEntries.length} sources failed to refresh`}
          </span>
          <span className={styles.errorDetail}>
            {errorEntries
              .slice(0, 3)
              .map(([id, msg]) => {
                const label = items.find((i) => i.source_id === id)?.source_label ?? id;
                return `${label}: ${msg}`;
              })
              .join(' · ')}
            {errorEntries.length > 3 ? ` · +${errorEntries.length - 3} more` : ''}
          </span>
        </div>
      )}
      {body}
    </div>
  );
}
