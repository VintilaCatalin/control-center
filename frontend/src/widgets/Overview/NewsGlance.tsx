import { useMemo, useState } from 'react';
import { useSnapshotData } from '../../api/SnapshotProvider';
import type { ReadingItem } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import { useAppNavigation } from '../../shell/AppNavigationContext';
import { readingThumbUrl } from '../Reading/media';
import { relativeTime } from '../Reading/time';
import { topicColor, topicLabel } from '../Reading/topics';
import styles from './NewsGlance.module.css';

function CompassIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-2 6-4 1.5L10.5 9z" strokeLinejoin="round" />
    </svg>
  );
}

// Round-robin across whatever topics are actually present in the user's
// real items - not a fixed curated list any more (that used to hardcode
// 5 of Reading's original 9 topics, which silently excluded anything
// else, including every topic a user creates now that Reading's topic
// vocabulary is user-editable - see topics.ts). Interleaved so one
// prolific topic doesn't crowd out the others in six slots.
function curatedMix(items: ReadingItem[], limit: number): ReadingItem[] {
  const byTopic = new Map<string, ReadingItem[]>();
  const order: string[] = [];
  for (const item of items) {
    if (item.topic === 'youtube') continue;
    let bucket = byTopic.get(item.topic);
    if (!bucket) {
      bucket = [];
      byTopic.set(item.topic, bucket);
      order.push(item.topic);
    }
    bucket.push(item);
  }
  const queues = order.map((t) => byTopic.get(t)!).filter((q) => q.length > 0);
  const out: ReadingItem[] = [];
  let index = 0;
  while (out.length < limit && queues.some((q) => q.length > 0)) {
    const queue = queues[index % queues.length];
    if (queue.length) out.push(queue.shift()!);
    index++;
  }
  return out;
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
  const topics = snapshot?.reading?.topics ?? [];
  const [filter, setFilter] = useState<TopicFilter>('all');

  const mix = useMemo(() => {
    const source = items ?? [];
    if (filter === 'all') return curatedMix(source, 6);
    return source.filter((i) => i.topic === filter).slice(0, 6);
  }, [items, filter]);

  // Only topics that actually have items right now, in the order they
  // first appear (recency-ish, since `items` is already recency-sorted) -
  // never the whole configured vocabulary, most of which may be empty at
  // any given moment.
  const presentTopics = useMemo(() => {
    const seen: string[] = [];
    for (const item of items ?? []) {
      if (item.topic !== 'youtube' && !seen.includes(item.topic)) seen.push(item.topic);
    }
    return seen;
  }, [items]);

  return (
    <div className={styles.glance}>
      <div className={styles.head}>
        <span className={styles.heading}>
          <CompassIcon /> For You
        </span>
        <select className={styles.filter} value={filter} onChange={(e) => setFilter(e.target.value as TopicFilter)}>
          <option value="all">All topics</option>
          {presentTopics.map((t) => (
            <option key={t} value={t}>
              {topicLabel(t, topics)}
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
                  <span className={styles.badge} style={{ color: topicColor(item.topic) }}>
                    {topicLabel(item.topic, topics)}
                  </span>
                  <span className={styles.title}>{item.title}</span>
                  <span className={styles.meta}>{relativeTime(item.published)}</span>
                </span>
              </button>
            ) : (
              <button type="button" key={item.id} className={styles.textRow} onClick={() => navigateToApp('reading', { readingSection: item.topic })}>
                <span className={styles.badge} style={{ color: topicColor(item.topic) }}>
                  {topicLabel(item.topic, topics)}
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
