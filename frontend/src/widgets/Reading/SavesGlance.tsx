import { AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { fetchLibraryItems, removeRaindrop, setRaindropFavorite } from '../../api/actions/library';
import { useSnapshotData } from '../../api/SnapshotProvider';
import type { LibraryCollection, LibraryItem } from '../../api/types';
import { useAppNavigation } from '../../shell/AppNavigationContext';
import { useToast } from '../../primitives/Toast/ToastProvider';
import { LibraryDetail } from '../Library/LibraryDetail';
import { StarIcon } from '../Library/icons';
import { coverFallbacks, resolveCoverUrl } from '../Library/utils';
import { savesSectionKey, type ReadingSection } from './topics';
import styles from './SavesGlance.module.css';

interface SavesGlanceProps {
  onOpenSaves: (section: ReadingSection) => void;
}

type GlanceSource = 'recent' | 'favorites' | string;

const PREF_KEY = 'control-center.reading.saves-glance';
const VISIBLE = 8;

function loadPref(): GlanceSource {
  try {
    return (localStorage.getItem(PREF_KEY) as GlanceSource) || 'recent';
  } catch {
    return 'recent';
  }
}

function savePref(value: GlanceSource) {
  try {
    localStorage.setItem(PREF_KEY, value);
  } catch {
    /* ignore */
  }
}

function Cover({ item }: { item: LibraryItem }) {
  const [src, setSrc] = useState(() => resolveCoverUrl(item));
  const [tried, setTried] = useState<string[]>([]);

  useEffect(() => {
    setSrc(resolveCoverUrl(item));
    setTried([]);
  }, [item.id, item.cover, item.url]);

  if (!src) {
    return <span className={styles.coverEmpty}>{(item.domain || item.title || '?').slice(0, 1)}</span>;
  }

  return (
    <img
      className={styles.coverImg}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => {
        const next = coverFallbacks(item, src).find((url) => url !== src && !tried.includes(url));
        if (next) {
          setTried((prev) => [...prev, src]);
          setSrc(next);
        } else {
          setSrc(null);
        }
      }}
    />
  );
}

/** Raindrop preview for For You — sized for a 4×11 panel. */
export function SavesGlance({ onOpenSaves }: SavesGlanceProps) {
  const { snapshot } = useSnapshotData();
  const { openSettings } = useAppNavigation();
  const { push } = useToast();
  const library = snapshot?.library;
  const collections = useMemo(() => library?.collections ?? [], [library?.collections]);
  const [source, setSource] = useState<GlanceSource>(loadPref);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<LibraryItem | null>(null);

  useEffect(() => {
    if (!library?.configured) {
      setItems([]);
      return;
    }

    if (source === 'recent') {
      setItems((library.recent ?? []).slice(0, VISIBLE));
      setLoading(false);
      return;
    }

    if (source === 'favorites') {
      const favs = library.favorites?.length
        ? library.favorites
        : (library.recent ?? []).filter((i) => i.important);
      setItems(favs.slice(0, VISIBLE));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchLibraryItems(source, { perpage: VISIBLE }).then((res) => {
      if (cancelled) return;
      setItems(res.ok ? (res.items ?? []).slice(0, VISIBLE) : []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [source, library?.configured, library?.recent, library?.favorites]);

  function handleSourceChange(next: GlanceSource) {
    setSource(next);
    savePref(next);
  }

  function sectionForSource(src: GlanceSource): ReadingSection {
    if (src === 'recent') return 'saves';
    if (src === 'favorites') return 'saves-favorites';
    return savesSectionKey(src);
  }

  function toggleFavorite(item: LibraryItem) {
    const next = !item.important;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, important: next } : i)));
    setRaindropFavorite(item.id, next).then((res) => {
      if (!res.ok) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, important: !next } : i)));
        push(res.error || 'Could not update favorite', 'error');
      }
    });
  }

  function removeItem(item: LibraryItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    removeRaindrop(item.id, item.url).then((res) => {
      if (!res.ok) {
        setItems((prev) => [...prev, item]);
        push(res.error || 'Could not remove', 'error');
      }
    });
  }

  if (!library?.configured) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyTitle}>Raindrop</span>
        <span>Connect to preview saves on For You.</span>
        <button type="button" className={styles.linkBtn} onClick={() => openSettings('integrations')}>
          Open Settings
        </button>
      </div>
    );
  }

  return (
    <>
      <div className={styles.panel}>
        <div className={styles.toolbar}>
          <select
            className={styles.select}
            value={source}
            onChange={(e) => handleSourceChange(e.target.value)}
            aria-label="Raindrop collection"
          >
            <option value="recent">Recent</option>
            <option value="favorites">Favorites</option>
            {collections.map((c: LibraryCollection) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <button type="button" className={styles.openBtn} onClick={() => onOpenSaves(sectionForSource(source))}>
            Open
          </button>
        </div>

        {loading ? (
          <div className={styles.status}>Loading…</div>
        ) : items.length === 0 ? (
          <div className={styles.status}>Nothing in this collection yet.</div>
        ) : (
          <div className={styles.list}>
            {items.map((item) => (
              <article key={item.id} className={styles.card}>
                <button type="button" className={styles.cardMain} onClick={() => setDetail(item)}>
                  <span className={styles.thumb}>
                    <Cover item={item} />
                  </span>
                  <span className={styles.copy}>
                    <strong className={styles.title}>{item.title}</strong>
                    <span className={styles.meta}>{item.domain || 'Link'}</span>
                  </span>
                </button>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={[styles.action, item.important ? styles.actionOn : ''].filter(Boolean).join(' ')}
                    onClick={() => toggleFavorite(item)}
                    title={item.important ? 'Unfavorite' : 'Favorite'}
                    aria-label={item.important ? 'Unfavorite' : 'Favorite'}
                  >
                    <StarIcon filled={item.important} />
                  </button>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => removeItem(item)}
                    title="Remove"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <AnimatePresence>
        {detail && <LibraryDetail item={detail} onClose={() => setDetail(null)} />}
      </AnimatePresence>
    </>
  );
}
