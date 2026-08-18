import { AnimatePresence } from 'framer-motion';
import { useCallback, useMemo, useState } from 'react';
import { useSnapshotData } from '../api/SnapshotProvider';
import type { PlexItem } from '../api/types';
import { usePublishAppSidebar } from '../shell/AppChromeContext';
import { useSidebarCollapsed } from '../shell/SidebarCollapseContext';
import { PlexDetail } from '../widgets/Plex/PlexDetail';
import { PlexHome } from '../widgets/Plex/PlexHome';
import { PlexLibrary } from '../widgets/Plex/PlexLibrary';
import { PlexSidebarNav } from '../widgets/Plex/PlexSidebarNav';
import styles from './Plex.module.css';

// Plex is a cinematic media surface. Its library switcher used to be a
// horizontal pill bar living inside its own content area; now that the
// shell owns the left column for every application (see shell/AppShell),
// that switcher moves into the shared AppSidebar as Plex's own sidebar
// content (see PlexSidebarNav) instead of duplicating a second nav
// inside the page. Detail stays a true full-bleed screen (position:
// fixed, see PlexDetail.module.css), independent of this layout.
export function Plex() {
  const { snapshot } = useSnapshotData();
  const data = snapshot?.plex;
  const { collapsed } = useSidebarCollapsed();

  const [activeKey, setActiveKey] = useState<'home' | string>('home');
  const [detailItem, setDetailItem] = useState<PlexItem | null>(null);

  function handleNavSelect(key: 'home' | string) {
    setDetailItem(null);
    setActiveKey(key);
  }

  const handleSelectItem = useCallback((item: PlexItem) => setDetailItem(item), []);

  usePublishAppSidebar(
    useMemo(
      () =>
        data ? (
          <PlexSidebarNav
            sections={data.sections}
            active={activeKey}
            onSelect={handleNavSelect}
            onSelectItem={handleSelectItem}
            collapsed={collapsed}
          />
        ) : null,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [data?.sections, activeKey, handleSelectItem, collapsed],
    ),
  );

  if (!data) {
    return (
      <div className={styles.page}>
        <div className={styles.state}>Loading Plex…</div>
      </div>
    );
  }

  if (!data.configured) {
    return (
      <div className={styles.page}>
        <div className={styles.state}>
          <span className={styles.stateTitle}>Plex isn't connected</span>
          <span>Add a server URL and token in Settings to bring your library in.</span>
        </div>
      </div>
    );
  }

  const activeSection = data.sections.find((s) => s.key === activeKey);

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        {activeKey === 'home' ? (
          <PlexHome data={data} onSelect={setDetailItem} onNavigate={handleNavSelect} />
        ) : activeSection ? (
          <PlexLibrary section={activeSection} onSelect={setDetailItem} />
        ) : (
          <div className={styles.state}>
            <span className={styles.stateTitle}>Library not found</span>
            <span>This library may have been removed from Plex.</span>
          </div>
        )}
      </div>

      <AnimatePresence>
        {detailItem && <PlexDetail item={detailItem} onClose={() => setDetailItem(null)} />}
      </AnimatePresence>
    </div>
  );
}
