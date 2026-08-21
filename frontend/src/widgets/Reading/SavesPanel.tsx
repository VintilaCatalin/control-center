import { AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { fetchLibraryItems } from '../../api/actions/library';
import { useSnapshotData } from '../../api/SnapshotProvider';
import type { LibraryItem } from '../../api/types';
import { useAppNavigation } from '../../shell/AppNavigationContext';
import { LibraryDetail } from '../Library/LibraryDetail';
import { LibraryGrid } from '../Library/LibraryGrid';
import { type LibrarySection } from '../Library/utils';
import styles from '../../views/Library.module.css';

interface SavesPanelProps {
  section: LibrarySection;
  search: string;
}

/** Raindrop Saves surface embedded inside Reading (no own app chrome). */
export function SavesPanel({ section, search }: SavesPanelProps) {
  const { snapshot } = useSnapshotData();
  const data = snapshot?.library;
  const { openSettings } = useAppNavigation();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<LibraryItem | null>(null);
  const collections = useMemo(() => data?.collections ?? [], [data?.collections]);

  useEffect(() => {
    if (!data?.configured) return;

    if (section === 'recent') {
      setItems(data.recent);
      setLoading(false);
      return;
    }

    if (section === 'favorites') {
      setItems(data.favorites?.length ? data.favorites : data.recent.filter((item) => item.important));
      setLoading(false);
      return;
    }

    const collectionId = section === 'unsorted' ? '-1' : section;
    let cancelled = false;
    setLoading(true);
    fetchLibraryItems(collectionId, { search: search.trim() || undefined }).then((res) => {
      if (cancelled) return;
      setItems(res.ok ? res.items ?? [] : []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [section, data?.configured, data?.recent, data?.favorites, search]);

  if (!data) {
    return (
      <div className={styles.state}>
        <span className={styles.stateTitle}>Saves needs a restart</span>
        <span>Restart Control Center so the Raindrop sync can load.</span>
      </div>
    );
  }

  if (!data.configured) {
    return (
      <div className={styles.state}>
        <span className={styles.stateTitle}>Raindrop isn&apos;t connected</span>
        <span>
          Connect Raindrop in Settings → Integrations. Saves from the feed and your phone both land here.
        </span>
        <button type="button" className={styles.setupBtn} onClick={() => openSettings('integrations')}>
          Connect Raindrop
        </button>
      </div>
    );
  }

  return (
    <>
      {data.error && (
        <div className={styles.state}>
          <span className={styles.stateTitle}>Sync issue</span>
          <span>{data.error}</span>
        </div>
      )}
      {!data.error && (
        <LibraryGrid
          section={section}
          collections={collections}
          items={items}
          search={section === 'recent' || section === 'favorites' ? search : ''}
          loading={loading}
          onSelect={setDetailItem}
          onItemsChange={setItems}
        />
      )}
      <AnimatePresence>
        {detailItem && <LibraryDetail item={detailItem} onClose={() => setDetailItem(null)} />}
      </AnimatePresence>
    </>
  );
}
