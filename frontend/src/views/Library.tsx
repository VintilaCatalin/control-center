import { AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { fetchLibraryItems } from '../api/actions/library';
import { useSnapshotData } from '../api/SnapshotProvider';
import type { LibraryItem } from '../api/types';
import { usePublishAppSidebar } from '../shell/AppChromeContext';
import { useSidebarCollapsed } from '../shell/SidebarCollapseContext';
import { LibraryDetail } from '../widgets/Library/LibraryDetail';
import { LibraryGrid } from '../widgets/Library/LibraryGrid';
import { LibrarySidebarNav, type LibrarySection } from '../widgets/Library/LibrarySidebarNav';
import styles from './Library.module.css';

export function Library() {
  const { snapshot } = useSnapshotData();
  const data = snapshot?.library;
  const { collapsed } = useSidebarCollapsed();

  const [activeKey, setActiveKey] = useState<LibrarySection>('recent');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<LibraryItem | null>(null);

  const collections = useMemo(() => data?.collections ?? [], [data?.collections]);

  useEffect(() => {
    if (!data?.configured) return;

    if (activeKey === 'recent') {
      setItems(data.recent);
      setLoading(false);
      return;
    }

    if (activeKey === 'favorites') {
      setItems(data.recent.filter((item) => item.important));
      setLoading(false);
      return;
    }

    const collectionId = activeKey === 'unsorted' ? '-1' : activeKey;
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
  }, [activeKey, data?.configured, data?.recent, search]);

  usePublishAppSidebar(
    useMemo(
      () =>
        data ? (
          <LibrarySidebarNav
            collections={collections}
            active={activeKey}
            search={search}
            onSearchChange={setSearch}
            onSelect={setActiveKey}
            collapsed={collapsed}
          />
        ) : null,
      [collections, activeKey, search, collapsed, data],
    ),
  );

  if (!data) {
    return (
      <div className={styles.page}>
        <div className={styles.state}>Loading Library…</div>
      </div>
    );
  }

  if (!data.configured) {
    return (
      <div className={styles.page}>
        <div className={styles.state}>
          <span className={styles.stateTitle}>Raindrop isn&apos;t connected</span>
          <span>Add your Raindrop test token in Settings → Integrations to sync saves from your phone.</span>
        </div>
      </div>
    );
  }

  const displayItems = items;

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        {data.error && (
          <div className={styles.state}>
            <span className={styles.stateTitle}>Sync issue</span>
            <span>{data.error}</span>
          </div>
        )}
        {!data.error && (
          <LibraryGrid
            section={activeKey}
            collections={collections}
            items={displayItems}
            search={activeKey === 'recent' || activeKey === 'favorites' ? search : ''}
            loading={loading}
            onSelect={setDetailItem}
          />
        )}
      </div>

      <AnimatePresence>
        {detailItem && <LibraryDetail item={detailItem} onClose={() => setDetailItem(null)} />}
      </AnimatePresence>
    </div>
  );
}
