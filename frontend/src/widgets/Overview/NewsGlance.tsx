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
  return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M15 9l-2 6-4 1.5L10.5 9z" strokeLinejoin="round" /></svg>;
}

function curatedMix(items: ReadingItem[], limit: number): ReadingItem[] {
  const byTopic = new Map<string, ReadingItem[]>();
  const order: string[] = [];
  for (const item of items) {
    if (item.topic === 'youtube') continue;
    if (!byTopic.has(item.topic)) { byTopic.set(item.topic, []); order.push(item.topic); }
    byTopic.get(item.topic)!.push(item);
  }
  const queues = order.map((topic) => byTopic.get(topic)!).filter((queue) => queue.length > 0);
  const result: ReadingItem[] = [];
  let index = 0;
  while (result.length < limit && queues.some((queue) => queue.length > 0)) {
    const queue = queues[index % queues.length];
    if (queue.length) result.push(queue.shift()!);
    index++;
  }
  return result;
}

type TopicFilter = 'all' | ReadingItem['topic'];
const EMPTY_ITEMS: ReadingItem[] = [];

export function NewsGlance() {
  const { snapshot } = useSnapshotData();
  const { navigateToApp } = useAppNavigation();
  const items = snapshot?.reading?.items ?? EMPTY_ITEMS;
  const topics = snapshot?.reading?.topics ?? [];
  const [filter, setFilter] = useState<TopicFilter>('all');
  const mix = useMemo(() => filter === 'all' ? curatedMix(items, 6) : items.filter((item) => item.topic === filter).slice(0, 6), [items, filter]);
  const presentTopics = useMemo(() => {
    const seen: string[] = [];
    for (const item of items) if (item.topic !== 'youtube' && !seen.includes(item.topic)) seen.push(item.topic);
    return seen;
  }, [items]);

  return <div className={styles.glance}>
    <div className={styles.head}>
      <span className={styles.heading}><CompassIcon /> For You</span>
      <select className={styles.filter} value={filter} onChange={(event) => setFilter(event.target.value as TopicFilter)} aria-label="Filter For You by topic">
        <option value="all">All topics</option>
        {presentTopics.map((topic) => <option key={topic} value={topic}>{topicLabel(topic, topics)}</option>)}
      </select>
    </div>

    {mix.length === 0 ? <div className={styles.empty}>Nothing new from your sources yet.</div> : <div className={styles.list}>
      {mix.map((item, index) => <button type="button" key={item.id} className={index === 0 ? styles.lead : styles.story} onClick={() => navigateToApp('reading', { readingSection: item.topic })}>
        {item.thumb && <ArtTile aspect="square" src={readingThumbUrl(item.thumb)} alt="" fallback={null} className={index === 0 ? styles.leadThumb : styles.storyThumb} />}
        <span className={styles.text}>
          <span className={styles.topic} style={{ color: topicColor(item.topic) }}><i />{topicLabel(item.topic, topics)}</span>
          <span className={styles.title}>{item.title}</span>
          <span className={styles.meta}>{item.source_label ? `${item.source_label} · ` : ''}{relativeTime(item.published)}</span>
        </span>
      </button>)}
    </div>}
  </div>;
}
