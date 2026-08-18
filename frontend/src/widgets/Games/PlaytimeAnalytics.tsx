import { useEffect, useMemo, useState } from 'react';
import { fetchSteamNews, type SteamNewsItem } from '../../api/actions/games';
import { launchTarget } from '../../api/actions/launch';
import type { GameData, PlaytimeEntry } from '../../api/types';
import { relativeTime } from './time';
import styles from './PlaytimeAnalytics.module.css';

interface PlaytimeAnalyticsProps {
  playtimeChart: PlaytimeEntry[];
  games: GameData[];
  recent: GameData[];
}

type Tab = '2weeks' | 'alltime' | 'recent' | 'library' | 'news';

const TABS: { key: Tab; label: string }[] = [
  { key: '2weeks', label: '2 Weeks' },
  { key: 'alltime', label: 'All-Time' },
  { key: 'recent', label: 'Recent' },
  { key: 'library', label: 'Library' },
  { key: 'news', label: 'News' },
];

const SOURCE_LABEL: Record<GameData['source'], string> = {
  steam: 'Steam',
  xbox: 'Xbox',
  battlenet: 'Battle.net',
  riot: 'Riot',
  manual: 'Added manually',
};

const MEDALS = ['🥇', '🥈', '🥉'];

function tintRow(value: number, max: number): string {
  const tint = 4 + (value / Math.max(max, 1)) * 18;
  return `color-mix(in oklab, var(--accent) ${tint}%, transparent)`;
}

// Four honest views over what collect_games actually returns - no
// fabricated day-by-day history (the backend only ever knew playtime_2wk
// as one rolling aggregate, never per-session), just every real dimension
// that WAS sitting unused: lifetime hours (playtime_2wk was the only one
// shown before), last_played recency (recent[] was fetched but never
// rendered anywhere), and library composition by source/size (grouped
// counts nobody surfaced). Replaces the old single-purpose PlaytimeList.
export function PlaytimeAnalytics({ playtimeChart, games, recent }: PlaytimeAnalyticsProps) {
  const [tab, setTab] = useState<Tab>('2weeks');
  const [news, setNews] = useState<{ game: GameData; items: SteamNewsItem[] } | 'loading' | 'error' | null>(null);

  // The most recently played Steam game - news is scoped to what you're
  // actually engaged with right now, not a feed for the whole library
  // (that would make this a news reader, which is explicitly not the
  // goal). Falls back to your most-played Steam game by lifetime hours if
  // nothing Steam has been played recently.
  const newsTarget = useMemo(() => {
    const recentSteam = recent.find((g) => g.source === 'steam');
    if (recentSteam) return recentSteam;
    return [...games].filter((g) => g.source === 'steam').sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0))[0] ?? null;
  }, [recent, games]);

  useEffect(() => {
    if (tab !== 'news' || !newsTarget) return;
    if (news !== null && news !== 'loading' && news !== 'error' && news.game.id === newsTarget.id) return;
    setNews('loading');
    fetchSteamNews(newsTarget.id).then(
      (res) => setNews(res.ok ? { game: newsTarget, items: res.items } : 'error'),
      () => setNews('error'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, newsTarget]);

  const allTime = useMemo(
    () =>
      [...games]
        .filter((g) => (g.playtime_forever ?? 0) > 0)
        .sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0))
        .slice(0, 10),
    [games],
  );

  const bySource = useMemo(() => {
    const map = new Map<GameData['source'], { count: number; hours: number; sizeGb: number }>();
    for (const g of games) {
      const entry = map.get(g.source) ?? { count: 0, hours: 0, sizeGb: 0 };
      entry.count++;
      entry.hours += g.playtime_forever ?? 0;
      entry.sizeGb += g.size ?? 0;
      map.set(g.source, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [games]);

  return (
    <div className={styles.panel}>
      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            className={[styles.tab, tab === t.key ? styles.tabActive : ''].join(' ')}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === '2weeks' &&
        (playtimeChart.length === 0 ? (
          <div className={styles.empty}>No playtime recorded in the last 2 weeks.</div>
        ) : (
          <div className={styles.list}>
            {playtimeChart.map((e, i) => (
              <button
                key={e.id}
                type="button"
                className={styles.row}
                style={{ background: tintRow(e.hours, playtimeChart[0].hours) }}
                onClick={() => e.launch && launchTarget(e.launch)}
                disabled={!e.launch}
              >
                <span className={styles.rank}>{MEDALS[i] ?? i + 1}</span>
                <span className={styles.thumb} style={{ backgroundImage: e.art ? `url("${e.art}")` : undefined }} />
                <span className={styles.name}>{e.name}</span>
                <span className={styles.value}>{e.hours}h</span>
              </button>
            ))}
          </div>
        ))}

      {tab === 'alltime' &&
        (allTime.length === 0 ? (
          <div className={styles.empty}>No lifetime playtime data available.</div>
        ) : (
          <div className={styles.list}>
            {allTime.map((g, i) => (
              <button
                key={g.id}
                type="button"
                className={styles.row}
                style={{ background: tintRow(g.playtime_forever ?? 0, allTime[0].playtime_forever ?? 1) }}
                onClick={() => g.launch && launchTarget(g.launch)}
                disabled={!g.launch}
              >
                <span className={styles.rank}>{MEDALS[i] ?? i + 1}</span>
                <span className={styles.thumb} style={{ backgroundImage: g.art ? `url("${g.art}")` : undefined }} />
                <span className={styles.name}>{g.name}</span>
                <span className={styles.value}>{Math.round(g.playtime_forever ?? 0)}h</span>
              </button>
            ))}
          </div>
        ))}

      {tab === 'recent' &&
        (recent.length === 0 ? (
          <div className={styles.empty}>Nothing played recently.</div>
        ) : (
          <div className={styles.list}>
            {recent.slice(0, 10).map((g) => (
              <button
                key={g.id}
                type="button"
                className={styles.row}
                onClick={() => g.launch && launchTarget(g.launch)}
                disabled={!g.launch}
              >
                <span className={styles.thumb} style={{ backgroundImage: g.art ? `url("${g.art}")` : undefined }} />
                <span className={styles.name}>{g.name}</span>
                <span className={styles.meta}>{relativeTime(g.last_played)}</span>
              </button>
            ))}
          </div>
        ))}

      {tab === 'library' && (
        <div className={styles.list}>
          {bySource.map(([source, stats]) => (
            <div key={source} className={styles.libraryRow}>
              <span className={styles.libraryName}>{SOURCE_LABEL[source]}</span>
              <span className={styles.libraryMeta}>
                {stats.count} game{stats.count === 1 ? '' : 's'}
                {stats.hours > 0 ? ` · ${Math.round(stats.hours)}h lifetime` : ''}
                {stats.sizeGb > 0 ? ` · ${stats.sizeGb.toFixed(1)} GB` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'news' &&
        (!newsTarget ? (
          <div className={styles.empty}>No Steam games in your library yet.</div>
        ) : news === 'loading' || news === null ? (
          <div className={styles.empty}>Loading news for {newsTarget.name}…</div>
        ) : news === 'error' ? (
          <div className={styles.empty}>Couldn't reach Steam's news feed.</div>
        ) : news.items.length === 0 ? (
          <div className={styles.empty}>No recent news for {newsTarget.name}.</div>
        ) : (
          <div className={styles.newsList}>
            <span className={styles.newsFor}>For {news.game.name}</span>
            {news.items.map((item) => (
              <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className={styles.newsRow}>
                <span className={styles.newsTitle}>{item.title}</span>
                {item.summary && <span className={styles.newsSummary}>{item.summary}</span>}
                {item.date && <span className={styles.newsDate}>{relativeTime(item.date)}</span>}
              </a>
            ))}
          </div>
        ))}
    </div>
  );
}
