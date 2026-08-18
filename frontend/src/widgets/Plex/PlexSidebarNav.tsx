import { useMemo, useState } from 'react';
import type { PlexItem, PlexSection } from '../../api/types';
import { PlexIcon } from '../../shell/icons';
import { HomeIcon, iconForSectionType, MovieIcon, SearchIcon } from './icons';
import styles from './PlexSidebarNav.module.css';

interface PlexSidebarNavProps {
  sections: PlexSection[];
  active: 'home' | string;
  onSelect: (key: 'home' | string) => void;
  onSelectItem: (item: PlexItem) => void;
  collapsed?: boolean;
}

function episodeLabel(item: PlexItem): string | null {
  if (item.type !== 'episode') return null;
  if (item.parentIndex != null && item.index != null) return `S${item.parentIndex} · E${item.index}`;
  return null;
}

// Plex's own sidebar content - branding-led, not a copy of Notes' dense
// text-row list: a small brand mark identifies this as Plex's own
// product chrome, a real (if simple - client-side over whatever's
// already loaded, no new backend route) search sits right under it,
// then Home + every real library with a filled-chip active state,
// closer to how a media app's own library switcher reads.
export function PlexSidebarNav({ sections, active, onSelect, onSelectItem, collapsed }: PlexSidebarNavProps) {
  const [query, setQuery] = useState('');
  const libraries = sections.filter((s) => s.key !== 'continueWatching');
  // Search has no meaningful icon-only form (nothing to type into at
  // 72px) - collapsed mode always shows the plain Home+libraries list,
  // regardless of whatever query was mid-typed before collapsing.
  const showSearch = !collapsed && query.trim();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set<string>();
    const out: PlexItem[] = [];
    for (const section of libraries) {
      for (const item of section.items) {
        const key = item.ratingKey ?? item.title ?? '';
        if (!key || seen.has(key)) continue;
        const haystack = `${item.title ?? ''} ${item.show ?? ''}`.toLowerCase();
        if (haystack.includes(q)) {
          seen.add(key);
          out.push(item);
          if (out.length >= 8) return out;
        }
      }
    }
    return out;
  }, [query, libraries]);

  return (
    <div className={styles.nav} data-collapsed={collapsed ? '' : undefined}>
      <div className={styles.brand}>
        <span className={styles.brandGlyph}>
          <PlexIcon />
        </span>
        <span className={styles.brandLabel}>Plex</span>
      </div>

      {!collapsed && (
        <label className={styles.search}>
          <SearchIcon />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search Plex…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}

      {showSearch ? (
        <div className={styles.results}>
          {results.length === 0 ? (
            <span className={styles.resultsEmpty}>No matches in your loaded libraries.</span>
          ) : (
            results.map((item, i) => {
              const title = item.type === 'episode' ? item.show || item.title : item.title;
              const sub = episodeLabel(item) || (item.year ? String(item.year) : null);
              return (
                <button
                  key={item.ratingKey ?? `${item.title}-${i}`}
                  type="button"
                  className={styles.resultRow}
                  onClick={() => onSelectItem(item)}
                >
                  <span className={styles.resultThumb}>
                    {item.art ? <img src={item.art} alt="" /> : <MovieIcon />}
                  </span>
                  <span className={styles.resultText}>
                    <span className={styles.resultTitle}>{title}</span>
                    {sub && <span className={styles.resultSub}>{sub}</span>}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : (
        <>
          <button
            type="button"
            className={[styles.item, active === 'home' ? styles.itemActive : ''].filter(Boolean).join(' ')}
            onClick={() => onSelect('home')}
            title={collapsed ? 'Home' : undefined}
          >
            <span className={styles.icon}>
              <HomeIcon />
            </span>
            <span className={styles.label}>Home</span>
          </button>

          {libraries.length > 0 && <div className={styles.groupLabel}>Libraries</div>}

          {libraries.map((section) => {
            const Icon = iconForSectionType(section.type);
            return (
              <button
                key={section.key}
                type="button"
                className={[styles.item, active === section.key ? styles.itemActive : ''].filter(Boolean).join(' ')}
                onClick={() => onSelect(section.key)}
                title={collapsed ? section.title : undefined}
              >
                <span className={styles.icon}>
                  <Icon />
                </span>
                <span className={styles.label}>{section.title}</span>
                <span className={styles.count}>{section.count}</span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
