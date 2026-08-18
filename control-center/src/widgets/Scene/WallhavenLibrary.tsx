import { useEffect, useState } from 'react';
import { applyWallhavenWallpaper, matchLightsToWallpaper, searchWallhaven } from '../../api/actions/scene';
import type { WallhavenItem } from '../../api/types';
import { Skeleton } from '../../primitives/Skeleton/Skeleton';
import { WallpaperTile } from './WallpaperTile';
import styles from './WallpaperLibrary.module.css';

const SORT_OPTIONS = [
  { value: 'toplist', label: 'Toplist' },
  { value: 'favorites', label: 'Most favourited' },
  { value: 'views', label: 'Most viewed' },
  { value: 'date_added', label: 'Latest' },
  { value: 'random', label: 'Random' },
];
const RANGE_OPTIONS = [
  { value: '1d', label: 'Day' },
  { value: '1w', label: 'Week' },
  { value: '1M', label: 'Month' },
  { value: '1y', label: 'Year' },
];
const PURITY_OPTIONS = [
  { value: '100', label: 'SFW' },
  { value: '110', label: 'Sketchy' },
  { value: '111', label: 'NSFW' },
];
const CATEGORY_OPTIONS = [
  { value: '111', label: 'All types' },
  { value: '100', label: 'General' },
  { value: '010', label: 'Anime' },
  { value: '001', label: 'People' },
];

export function WallhavenLibrary() {
  const [sorting, setSorting] = useState('toplist');
  const [range, setRange] = useState('1M');
  const [purity, setPurity] = useState('100');
  const [categories, setCategories] = useState('111');
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<WallhavenItem[] | null>(null);
  const [lastPage, setLastPage] = useState<number | undefined>(undefined);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);

  async function runSearch(nextPage: number) {
    setSearching(true);
    setSearchError(null);
    try {
      const r = await searchWallhaven({ sorting, page: nextPage, query, range, purity, categories });
      if (r.error) {
        setSearchError(r.error);
        setItems([]);
      } else {
        setItems(r.items);
        setLastPage(r.last_page);
        setPage(nextPage);
      }
    } catch {
      setSearchError("Couldn't reach Wallhaven.");
      setItems([]);
    } finally {
      setSearching(false);
    }
  }

  // Loads on mount, then re-searches from page 1 whenever a filter
  // changes rather than staying on a now-stale page.
  useEffect(() => {
    runSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorting, range, purity, categories, query]);

  async function handleApply(item: WallhavenItem, matchLights: boolean) {
    setApplyingKey(item.id);
    try {
      await applyWallhavenWallpaper(item.full, item.id);
      if (matchLights) matchLightsToWallpaper();
    } finally {
      setApplyingKey(null);
    }
  }

  return (
    <div className={styles.library}>
      <div className={styles.filterBar}>
        <select className={styles.select} value={sorting} onChange={(e) => setSorting(e.target.value)}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {sorting === 'toplist' && (
          <select className={styles.select} value={range} onChange={(e) => setRange(e.target.value)}>
            {RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        <select className={styles.select} value={purity} onChange={(e) => setPurity(e.target.value)}>
          {PURITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select className={styles.select} value={categories} onChange={(e) => setCategories(e.target.value)}>
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          className={styles.search}
          placeholder="Search Wallhaven…"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setQuery(queryInput)}
        />
        <button type="button" className={styles.smallBtn} onClick={() => setQuery(queryInput)}>
          Search
        </button>
        <div className={styles.pager}>
          <button type="button" className={styles.smallBtn} onClick={() => runSearch(page - 1)} disabled={page <= 1 || searching}>
            ← Prev
          </button>
          <span className={styles.pageNote}>{lastPage ? `${page} / ${lastPage}` : page}</span>
          <button
            type="button"
            className={styles.smallBtn}
            onClick={() => runSearch(page + 1)}
            disabled={searching || (lastPage !== undefined && page >= lastPage)}
          >
            Next →
          </button>
        </div>
      </div>

      {searching && items === null ? (
        <SkeletonGrid />
      ) : searchError ? (
        <div className={styles.message}>{searchError}</div>
      ) : (items?.length ?? 0) === 0 ? (
        <div className={styles.message}>Nothing matched. Try different filters.</div>
      ) : (
        <div className={styles.grid}>
          {items!.map((item) => (
            <WallpaperTile
              key={item.id}
              thumbUrl={item.thumb ?? item.full}
              name={`${item.w}×${item.h}`}
              applying={applyingKey === item.id}
              onApply={() => handleApply(item, false)}
              onApplyMatchLights={() => handleApply(item, true)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className={styles.grid} aria-busy="true" aria-label="Loading wallpapers">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} width="100%" className={styles.skeletonTile} radius={16} />
      ))}
    </div>
  );
}
