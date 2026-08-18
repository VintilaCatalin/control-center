import { useMemo, useState } from 'react';
import { useSnapshotData } from '../../api/SnapshotProvider';
import type { ReadingItem } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import { useAppNavigation } from '../../shell/AppNavigationContext';
import { readingThumbUrl } from '../Reading/media';
import { relativeTime } from '../Reading/time';
import { TOPIC_COLORS, TOPIC_LABELS } from '../Reading/topics';
import styles from './NewsGlance.module.css';

function CompassIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-2 6-4 1.5L10.5 9z" strokeLinejoin="round" />
    </svg>
  );
}

// Curated topics only, not the whole Reading firehose - a fixed, honest
// set (real topics that already exist in Reading's own vocabulary, see
// widgets/Reading/topics.ts), not a per-user preference this panel would
// need its own settings for. Interleaved round-robin so one prolific
// topic doesn't crowd out the others in six slots.
const CURATED_TOPICS: ReadingItem['topic'][] = ['tech', 'ai', 'design', 'sport', 'interesting'];

function curatedMix(items: ReadingItem[], limit: number): ReadingItem[] {
  const byTopic = new Map<string, ReadingItem[]>();
  for (const item of items) {
    if (!CURATED_TOPICS.includes(item.topic)) continue;
    const bucket = byTopic.get(item.topic);
    if (bucket) bucket.push(item);
    else byTopic.set(item.topic, [item]);
  }
  const queues = CURATED_TOPICS.map((t) => byTopic.get(t) ?? []).filter((q) => q.length > 0);
  const out: ReadingItem[] = [];
  let index = 0;
  while (out.length < limit && queues.some((q) => q.length > 0)) {
    const queue = queues[index % queues.length];
    if (queue.length) out.push(queue.shift()!);
    index++;
  }
  return out;
}

function topicColor(item: ReadingItem): string {
  return item.topic in TOPIC_COLORS ? TOPIC_COLORS[item.topic as keyof typeof TOPIC_COLORS] : TOPIC_COLORS.interesting;
}
function topicLabel(item: ReadingItem): string {
  return item.topic in TOPIC_LABELS ? TOPIC_LABELS[item.topic as keyof typeof TOPIC_LABELS] : item.topic;
}

// "What interesting things happened recently" - a compact editorial
// digest, not another Reading feed. Two row treatments in the same list
// (image vs. text-only), not a uniform template, so a mixed batch of
// topics/thumb-availability still reads as a considered digest rather
// than a repeated card stamped out N times.
type TopicFilter = 'all' | ReadingItem['topic'];

export function NewsGlance() {
  const { snapshot } = useSnapshotData();
  const { navigateToApp } = useAppNavigation();
  const items = snapshot?.reading?.items;
  const [filter, setFilter] = useState<TopicFilter>('all');

  const mix = useMemo(() => {
    const source = items ?? [];
    if (filter === 'all') return curatedMix(source, 6);
    return source.filter((i) => i.topic === filter).slice(0, 6);
  }, [items, filter]);

  return (
    <div className={styles.glance}>
      <div className={styles.head}>
        <span className={styles.heading}>
          <CompassIcon /> For You
        </span>
        <select className={styles.filter} value={filter} onChange={(e) => setFilter(e.target.value as TopicFilter)}>
          <option value="all">All topics</option>
          {CURATED_TOPICS.map((t) => (
            <option key={t} value={t}>
              {TOPIC_LABELS[t as keyof typeof TOPIC_LABELS] ?? t}
            </option>
          ))}
        </select>
      </div>

      {mix.length === 0 ? (
        <div className={styles.empty}>Nothing new from your sources yet.</div>
      ) : (
        <div className={styles.list}>
          {mix.map((item) =>
            item.thumb ? (
              <button type="button" key={item.id} className={styles.imageRow} onClick={() => navigateToApp('reading', { readingSection: item.topic })}>
                <ArtTile aspect="square" src={readingThumbUrl(item.thumb)} alt="" fallback={null} className={styles.imageThumb} />
                <span className={styles.text}>
                  <span className={styles.badge} style={{ color: topicColor(item) }}>
                    {topicLabel(item)}
                  </span>
                  <span className={styles.title}>{item.title}</span>
                  <span className={styles.meta}>{relativeTime(item.published)}</span>
                </span>
              </button>
            ) : (
              <button type="button" key={item.id} className={styles.textRow} onClick={() => navigateToApp('reading', { readingSection: item.topic })}>
                <span className={styles.badge} style={{ color: topicColor(item) }}>
                  {topicLabel(item)}
                </span>
                <span className={styles.title}>{item.title}</span>
                <span className={styles.meta}>
                  {item.source_label} · {relativeTime(item.published)}
                </span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
