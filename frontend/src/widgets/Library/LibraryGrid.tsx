import type { LibraryCollection, LibraryItem } from '../../api/types';
import { LibraryCard } from './LibraryCard';
import { filterItems, formatSavedDate, sectionLabel } from './utils';
import styles from './LibraryGrid.module.css';

interface LibraryGridProps {
  section: string;
  collections: LibraryCollection[];
  items: LibraryItem[];
  search: string;
  loading?: boolean;
  onSelect: (item: LibraryItem) => void;
}

export function LibraryGrid({ section, collections, items, search, loading, onSelect }: LibraryGridProps) {
  const filtered = filterItems(items, search);
  const hero = filtered[0];
  const rest = filtered.slice(1);
  const accent = collections.find((c) => c.id === section)?.color;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>{sectionLabel(section, collections)}</h1>
          <p className={styles.sub}>Saved from your phone — synced from Raindrop.io</p>
        </div>
        <span className={styles.count}>{filtered.length} links</span>
      </header>

      {loading && <p className={styles.loading}>Loading…</p>}

      {!loading && filtered.length === 0 && (
        <div className={styles.empty}>
          <span>{search.trim() ? 'No matches for that search.' : 'Nothing here yet.'}</span>
          <span>Save links in Raindrop on your phone — they’ll show up here.</span>
        </div>
      )}

      {!loading && hero && (
        <button type="button" className={styles.hero} onClick={() => onSelect(hero)}>
          <div className={styles.heroCopy}>
            <span className={styles.heroEyebrow}>
              {hero.important ? 'Favorite' : 'Latest save'}
              {formatSavedDate(hero.created) ? ` · ${formatSavedDate(hero.created)}` : ''}
            </span>
            <span className={styles.heroTitle}>{hero.title}</span>
            {hero.excerpt && <span className={styles.heroExcerpt}>{hero.excerpt}</span>}
          </div>
          {hero.cover && (
            <div className={styles.heroArt}>
              <img src={hero.cover} alt="" />
            </div>
          )}
        </button>
      )}

      {!loading && rest.length > 0 && (
        <div className={styles.grid}>
          {rest.map((item) => (
            <LibraryCard
              key={item.id}
              item={item}
              accent={item.collectionId === section ? accent : collections.find((c) => c.id === item.collectionId)?.color}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
