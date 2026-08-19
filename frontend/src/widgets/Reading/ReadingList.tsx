import { useMemo, useState, type CSSProperties } from 'react';
import type { ReadingItem } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import { EditableGlyph } from '../../primitives/GlyphPicker/EditableGlyph';
import { ClockIcon, DismissIcon, PlayGlyphIcon, TrashIcon } from './icons';
import { readingThumbUrl } from './media';
import { SaveButton } from './SaveButton';
import { relativeTime } from './time';
import { TOPIC_COLORS, TOPIC_LABELS } from './topics';
import type { TopicDef } from './topics';
import styles from './ReadingList.module.css';

interface ReadingListProps {
  heading?: string;
  items: ReadingItem[];
  onOpen: (item: ReadingItem) => void;
  onToggleSave: (item: ReadingItem) => void;
  onRemove?: (item: ReadingItem) => void;
  onDismiss?: (item: ReadingItem) => void;
  topic?: TopicDef;
  onTopicIconChange?: (id: string, icon: string) => Promise<void>;
}

function topicColor(item: ReadingItem): string {
  return item.topic in TOPIC_COLORS ? TOPIC_COLORS[item.topic as keyof typeof TOPIC_COLORS] : TOPIC_COLORS.interesting;
}
function topicLabel(item: ReadingItem): string {
  return item.topic in TOPIC_LABELS ? TOPIC_LABELS[item.topic as keyof typeof TOPIC_LABELS] : item.topic;
}

// The single-topic/Saved/Bookmarks treatment - a real reading list, not
// the multi-column masonry ForYouBody's topic panels use. A wide masonry
// grid is fine as one panel among several on a dashboard-shaped page, but
// as the ONLY thing on screen it forces the eye to jump between columns
// out of chronological order, at a width that never suits actual body
// text. This is a single centred column instead, capped at a comfortable
// reading measure, one story per row - the same shape a real "reading
// list" product uses, because that's what this page now is.
// A source filter down the left, derived from whatever's actually in
// `items` - no new backend call, this list already has every field it
// needs. Picking a source narrows the list client-side; it never refetches.
function sourcesIn(items: ReadingItem[]): { id: string; label: string; count: number }[] {
  const byId = new Map<string, { id: string; label: string; count: number }>();
  for (const item of items) {
    const existing = byId.get(item.source_id);
    if (existing) existing.count++;
    else byId.set(item.source_id, { id: item.source_id, label: item.source_label, count: 1 });
  }
  return [...byId.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function ReadingList({ heading, items, onOpen, onToggleSave, onRemove, onDismiss, topic, onTopicIconChange }: ReadingListProps) {
  const [sourceId, setSourceId] = useState<string | null>(null);
  const sources = useMemo(() => sourcesIn(items), [items]);
  const filtered = sourceId ? items.filter((i) => i.source_id === sourceId) : items;

  return (
    <div className={styles.layout}>
      {sources.length > 1 && (
        <aside className={styles.sourceRail}>
          <span className={styles.railHeading}>Sources</span>
          <button type="button" className={[styles.sourceRow, sourceId === null ? styles.sourceRowActive : ''].join(' ')} onClick={() => setSourceId(null)}>
            <span className={styles.sourceLabel}>All sources</span>
            <span className={styles.sourceCount}>{items.length}</span>
          </button>
          {sources.map((s) => (
            <button
              key={s.id}
              type="button"
              className={[styles.sourceRow, sourceId === s.id ? styles.sourceRowActive : ''].join(' ')}
              onClick={() => setSourceId(s.id === sourceId ? null : s.id)}
            >
              <span className={styles.sourceLabel}>{s.label}</span>
              <span className={styles.sourceCount}>{s.count}</span>
            </button>
          ))}
        </aside>
      )}

      <div className={styles.content}>
        <div className={styles.wrap}>
          {heading && topic && onTopicIconChange ? <div className={styles.topicHeader}><EditableGlyph value={topic.icon} onChange={(icon) => onTopicIconChange(topic.id, icon)} label={`Change ${topic.label} icon`} /><h1 className={styles.heading}>{heading}</h1></div> : heading && <h1 className={styles.heading}>{heading}</h1>}
          {filtered.length === 0 && <div className={styles.empty}>Nothing from your sources in this topic right now.</div>}
          {filtered.map((item) => (
            <Row key={item.id} item={item} onOpen={onOpen} onToggleSave={onToggleSave} onRemove={onRemove} onDismiss={onDismiss} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ item, onOpen, onToggleSave, onRemove, onDismiss }: { item: ReadingItem } & Omit<ReadingListProps, 'heading' | 'items' | 'topic' | 'onTopicIconChange'>) {
  return (
    <article className={styles.row}>
      <button type="button" className={styles.body} onClick={() => onOpen(item)}>
        {item.thumb && (
          <span className={styles.thumbWrap}>
            <ArtTile aspect="square" src={readingThumbUrl(item.thumb)} alt="" fallback={null} className={styles.thumb} />
            {item.kind === 'video' && (
              <span className={styles.playBadge}>
                <PlayGlyphIcon />
              </span>
            )}
          </span>
        )}
        <span className={styles.text}>
          <span className={styles.topRow}>
            <span className={styles.badge} style={{ color: topicColor(item) }}>
              {topicLabel(item)}
            </span>
          </span>
          <span className={styles.title}>{item.title}</span>
          {item.blurb && <span className={styles.excerpt}>{item.blurb}</span>}
          <span className={styles.meta}>
            <span className={styles.source}>{item.source_label}</span>
            <span className={styles.dot}>·</span>
            <span>{relativeTime(item.published)}</span>
            {item.kind === 'article' && item.read_minutes ? (
              <>
                <span className={styles.dot}>·</span>
                <span className={styles.readTime}>
                  <ClockIcon />
                  {item.read_minutes} min
                </span>
              </>
            ) : null}
          </span>
        </span>
      </button>

      <div className={styles.actions} style={{ '--tile-color': topicColor(item) } as CSSProperties}>
        {onRemove ? (
          <button type="button" className={styles.actionBtn} onClick={() => onRemove(item)} title="Remove bookmark">
            <TrashIcon />
          </button>
        ) : (
          <>
            <SaveButton saved={item.saved} onToggle={() => onToggleSave(item)} variant="panel" small inline />
            {onDismiss && (
              <button type="button" className={styles.actionBtn} onClick={() => onDismiss(item)} title="Not interested">
                <DismissIcon />
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
