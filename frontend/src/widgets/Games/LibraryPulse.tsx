import { useEffect, useMemo, useState } from 'react';
import { fetchGameNews, type SteamNewsItem } from '../../api/actions/games';
import type { GameData } from '../../api/types';
import { readingThumbUrl } from '../Reading/media';
import styles from './LibraryPulse.module.css';

interface PulseItem extends SteamNewsItem {
  game: GameData;
}

export function LibraryPulse({ games, favorites, recent }: { games: GameData[]; favorites: GameData[]; recent: GameData[] }) {
  const candidates = useMemo(() => priorityGames(games, favorites, recent), [games, favorites, recent]);
  const [items, setItems] = useState<PulseItem[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let cursor = 0;
    const gathered: PulseItem[] = [];
    const seen = new Set<string>();
    setItems([]);
    setLoading(candidates.length > 0);

    async function worker() {
      while (!cancelled) {
        const game = candidates[cursor++];
        if (!game) return;
        try {
          const result = await fetchGameNews(game);
          if (cancelled || !result.ok) continue;
          for (const item of result.items) {
            const key = item.url || `${game.id}:${item.title}`;
            if (seen.has(key)) continue;
            seen.add(key);
            gathered.push({ ...item, game });
          }
          setItems([...gathered].sort((a, b) => (b.date ?? 0) - (a.date ?? 0)));
        } catch {
          // One unavailable platform/title should not suppress the rest of
          // the installed library. The completed empty state explains when
          // no source produced anything at all.
        }
      }
    }

    Promise.all(Array.from({ length: Math.min(4, candidates.length) }, worker)).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [candidates]);

  useEffect(() => {
    if (filter === 'all' || candidates.some((game) => gameKey(game) === filter)) return;
    const legacyMatch = candidates.find((game) => String(game.id) === filter);
    setFilter(legacyMatch ? gameKey(legacyMatch) : 'all');
  }, [candidates, filter]);

  const safeItems = items.filter(isDisplayablePulseItem);
  const visible = filter === 'all'
    ? diversify(safeItems, 2).slice(0, 12)
    : safeItems.filter((item) => gameKey(item.game) === filter).slice(0, 8);
  const favoriteKeys = new Set(favorites.map(gameKey));
  const featured = pickFeatured(visible, favoriteKeys, filter === 'all' ? 2 : 1);
  const featuredIds = new Set(featured.map(itemKey));
  const compact = visible.filter((item) => !featuredIds.has(itemKey(item)));

  return (
    <div className={styles.pulse}>
      <div className={styles.topline}>
        <div className={styles.intro}>
          <strong>Your installed library</strong>
          <span>{loading ? `Checking ${candidates.length} games…` : `${candidates.length} games checked · ${items.length} recent updates`}</span>
        </div>
        <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter Library Pulse by game">
          <option value="all">All installed games</option>
          {candidates.map((game) => <option key={gameKey(game)} value={gameKey(game)}>{game.name}</option>)}
        </select>
      </div>

      <div className={styles.feed}>
        {!!featured.length && <div className={styles.featuredGrid}>{featured.map((item) => <PulseStory key={itemKey(item)} item={item} featured />)}</div>}
        {!!compact.length && <div className={styles.compactList}>{compact.map((item) => <PulseStory key={itemKey(item)} item={item} />)}</div>}
        {!visible.length && !loading && <div className={styles.empty}>{filter === 'all' ? 'No recent updates found across the installed library.' : 'No recent coverage found for this game.'}</div>}
        {loading && <PulseSkeleton compact={items.length > 0} />}
      </div>
    </div>
  );
}

function priorityGames(games: GameData[], favorites: GameData[], recent: GameData[]): GameData[] {
  const byKey = new Map(games.map((game) => [`${game.source}:${game.id}`, game]));
  const ordered = [...favorites, ...recent, ...games.filter((game) => game.playtime_2wk), ...games];
  const result: GameData[] = [];
  const seen = new Set<string>();
  for (const candidate of ordered) {
    const key = `${candidate.source}:${candidate.id}`;
    const game = byKey.get(key);
    if (!game || seen.has(key)) continue;
    seen.add(key);
    result.push(game);
  }
  return result;
}

function diversify(items: PulseItem[], maxPerGame: number): PulseItem[] {
  const counts = new Map<string, number>();
  return items.filter((item) => {
    const key = `${item.game.source}:${item.game.id}`;
    const count = counts.get(key) ?? 0;
    if (count >= maxPerGame) return false;
    counts.set(key, count + 1);
    return true;
  });
}

const FOREIGN_SCRIPT = /[\u0400-\u052f\u0600-\u06ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;

function isDisplayablePulseItem(item: PulseItem): boolean {
  return !FOREIGN_SCRIPT.test(`${item.title} ${item.summary || ''}`);
}

function gameKey(game: GameData): string {
  return `${game.source}:${game.id}`;
}

function itemKey(item: PulseItem): string {
  return `${gameKey(item.game)}:${item.id}`;
}

function pickFeatured(items: PulseItem[], favoriteKeys: Set<string>, limit: number): PulseItem[] {
  const preferred = [
    ...items.filter((item) => favoriteKeys.has(gameKey(item.game)) && pulseThumb(item)),
    ...items.filter((item) => pulseThumb(item)),
    ...items,
  ];
  const result: PulseItem[] = [];
  const seenItems = new Set<string>();
  const seenGames = new Set<string>();
  for (const item of preferred) {
    const key = itemKey(item);
    const game = gameKey(item.game);
    if (seenItems.has(key) || seenGames.has(game)) continue;
    seenItems.add(key);
    seenGames.add(game);
    result.push(item);
    if (result.length === limit) break;
  }
  return result;
}

function PulseStory({ item, featured = false }: { item: PulseItem; featured?: boolean }) {
  return (
    <a className={`${styles.story} ${featured ? styles.featuredStory : styles.compactStory}`} href={item.url} target="_blank" rel="noopener noreferrer">
      <span className={styles.thumbnail}>
        {pulseThumb(item) ? (
          <img
            src={pulseThumb(item)}
            alt=""
            onError={(event) => {
              if (item.game.art && event.currentTarget.dataset.fallback !== 'true') {
                event.currentTarget.dataset.fallback = 'true';
                event.currentTarget.src = item.game.art;
              } else {
                event.currentTarget.style.display = 'none';
              }
            }}
          />
        ) : <span className={styles.fallbackArt}>{item.game.name.slice(0, 1)}</span>}
        <span className={styles.sourceBadge}>{sourceLabel(item.game.source)}</span>
      </span>
      <span className={styles.storyCopy}>
        <span className={styles.context}>
          <span className={styles.gameName}>{item.game.name}</span>
          {item.date ? <time className={styles.storyDate} dateTime={new Date(item.date * 1000).toISOString()}>{relativeDate(item.date)}</time> : null}
        </span>
        <strong>{item.title}</strong>
        {item.summary && <span className={styles.summary}>{item.summary}</span>}
        <span className={styles.provider}>{item.origin === 'first_party' ? 'Official update' : item.provider || 'Web coverage'}</span>
      </span>
      <span className={styles.arrow} aria-hidden="true">›</span>
    </a>
  );
}

function pulseThumb(item: PulseItem): string | undefined {
  if (item.thumb) return readingThumbUrl(item.thumb);
  return item.game.art || undefined;
}

function sourceLabel(source: GameData['source']): string {
  return source === 'battlenet' ? 'Battle.net' : source === 'xbox' ? 'Xbox' : source === 'riot' ? 'Riot' : source === 'steam' ? 'Steam' : 'Library';
}

function relativeDate(seconds: number): string {
  const days = Math.max(0, Math.floor((Date.now() - seconds * 1000) / 86_400_000));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(seconds * 1000));
}

function PulseSkeleton({ compact }: { compact: boolean }) {
  return <div className={`${styles.skeleton} ${compact ? styles.skeletonCompact : ''}`}>{Array.from({ length: compact ? 1 : 4 }, (_, item) => <span key={item} />)}</div>;
}
