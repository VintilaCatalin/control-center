import { useMemo } from 'react';
import type { LibraryCollection } from '../../api/types';
import { LibraryIcon, SearchIcon } from '../../shell/icons';
import { CollectionIcon, StarIcon } from './icons';
import { buildCollectionTree, type LibrarySection } from './utils';
import styles from './LibrarySidebarNav.module.css';

interface LibrarySidebarNavProps {
  collections: LibraryCollection[];
  active: LibrarySection;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (key: LibrarySection) => void;
  collapsed?: boolean;
}

export function LibrarySidebarNav({
  collections,
  active,
  search,
  onSearchChange,
  onSelect,
  collapsed,
}: LibrarySidebarNavProps) {
  const { roots, byParent } = useMemo(() => buildCollectionTree(collections), [collections]);
  const favoritesCount = useMemo(() => collections.reduce((n, c) => n + c.count, 0), [collections]);

  function renderCollection(c: LibraryCollection, child = false) {
    const accent = c.color?.startsWith('#') ? c.color : c.color ? `#${c.color}` : undefined;
    return (
      <button
        key={c.id}
        type="button"
        className={[styles.item, active === c.id ? styles.itemActive : '', child ? styles.itemChild : ''].join(' ')}
        onClick={() => onSelect(c.id)}
        title={c.title}
      >
        {accent ? <span className={styles.swatch} style={{ background: accent }} aria-hidden="true" /> : <span className={styles.icon}><CollectionIcon /></span>}
        <span className={styles.label}>{c.title}</span>
        <span className={styles.count}>{c.count}</span>
      </button>
    );
  }

  return (
    <nav className={styles.nav} data-collapsed={collapsed || undefined}>
      <div className={styles.brand}>
        <span className={styles.brandGlyph}><LibraryIcon /></span>
        <div className={styles.brandCopy}>
          <strong className={styles.brandLabel}>Library</strong>
          <small className={styles.brandHint}>Raindrop.io</small>
        </div>
      </div>

      <label className={styles.search}>
        <SearchIcon />
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search saves…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search library"
        />
      </label>

      <div className={styles.groupLabel}>Inbox</div>
      <button type="button" className={[styles.item, active === 'recent' ? styles.itemActive : ''].join(' ')} onClick={() => onSelect('recent')}>
        <span className={styles.icon}><LibraryIcon /></span>
        <span className={styles.label}>Recent</span>
      </button>
      <button type="button" className={[styles.item, active === 'unsorted' ? styles.itemActive : ''].join(' ')} onClick={() => onSelect('unsorted')}>
        <span className={styles.icon}><CollectionIcon /></span>
        <span className={styles.label}>Unsorted</span>
      </button>
      <button type="button" className={[styles.item, active === 'favorites' ? styles.itemActive : ''].join(' ')} onClick={() => onSelect('favorites')}>
        <span className={styles.icon}><StarIcon /></span>
        <span className={styles.label}>Favorites</span>
      </button>

      {roots.length > 0 && <div className={styles.groupLabel}>Collections</div>}
      {roots.map((root) => (
        <div key={root.id}>
          {renderCollection(root)}
          {(byParent.get(root.id) ?? []).map((child) => renderCollection(child, true))}
        </div>
      ))}

      {favoritesCount === 0 && roots.length === 0 && (
        <p className={styles.groupLabel}>No collections yet</p>
      )}
    </nav>
  );
}

export type { LibrarySection };
