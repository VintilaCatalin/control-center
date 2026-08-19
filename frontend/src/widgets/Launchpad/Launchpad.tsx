import { AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { detectAllAppIcons, reorderApps } from '../../api/actions/apps';
import { useSnapshotData } from '../../api/SnapshotProvider';
import type { AppData } from '../../api/types';
import { commitReorder, findInsertionPoint } from '../../primitives/dragReorder/dragGeometry';
import { Skeleton } from '../../primitives/Skeleton/Skeleton';
import { AddAppSheet } from './AddAppSheet';
import { AppIcon } from './AppIcon';
import styles from './Launchpad.module.css';

function PlusIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function DetectIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </svg>
  );
}

// The panel's own header already supplies the "Launchpad" label and card
// surface (PanelGrid) - this is the small self-contained control set that
// sits in the panel's headerAction slot, independent of the tile content
// below so a resize/drag on the panel never touches this.
export function LaunchpadHeaderActions() {
  const { snapshot } = useSnapshotData();
  const [addOpen, setAddOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const count = snapshot?.apps?.apps?.length ?? 0;

  async function handleDetectAll() {
    if (detecting) return;
    setDetecting(true);
    try {
      await detectAllAppIcons(false);
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div className={styles.headActions}>
      <span className={styles.count}>{count} {count === 1 ? 'app' : 'apps'}</span>
      <button
        type="button"
        className={styles.iconBtn}
        onClick={handleDetectAll}
        disabled={detecting}
        title="Detect missing icons"
        aria-label="Detect missing icons"
      >
        <DetectIcon />
      </button>
      <button
        type="button"
        className={styles.iconBtn}
        onClick={() => setAddOpen(true)}
        title="Add an app"
        aria-label="Add an app"
      >
        <PlusIcon />
      </button>
      <AddAppSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

export function Launchpad() {
  const { snapshot, loading, error } = useSnapshotData();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<{ id: string; edge: 'before' | 'after' } | null>(null);
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);

  const tileRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!localOrder) return;
    const t = setTimeout(() => setLocalOrder(null), 3000);
    return () => clearTimeout(t);
  }, [localOrder]);

  if (!snapshot && loading) return <LaunchpadSkeleton />;

  if (!snapshot && error) {
    return <LaunchpadMessage tone="error">Can't reach the panel backend</LaunchpadMessage>;
  }

  if (snapshot?.errors?.apps) {
    return <LaunchpadMessage tone="error">Launchpad unavailable</LaunchpadMessage>;
  }

  const apps = snapshot?.apps?.apps ?? [];
  const displayApps: AppData[] = localOrder
    ? (localOrder.map((id) => apps.find((a) => a.id === id)).filter(Boolean) as AppData[])
    : apps;

  function registerRef(id: string, el: HTMLDivElement | null) {
    if (el) tileRefs.current.set(id, el);
    else tileRefs.current.delete(id);
  }

  function handleDragMove(id: string, point: { x: number; y: number }) {
    const displayIds = new Set(displayApps.map((a) => a.id));
    const candidates: { id: string; el: HTMLDivElement }[] = [];
    for (const [aid, el] of tileRefs.current) {
      if (displayIds.has(aid)) candidates.push({ id: aid, el });
    }
    const nearest = findInsertionPoint(point, candidates, id);
    setOverId((prev) => (prev?.id === nearest?.id && prev?.edge === nearest?.edge ? prev : nearest));
  }

  function handleDragEnd(id: string) {
    if (overId) {
      const ids = commitReorder(
        displayApps.map((a) => a.id),
        id,
        overId,
      );
      setLocalOrder(ids);
      reorderApps(ids);
    }
    setDragId(null);
    setOverId(null);
  }

  if (displayApps.length === 0) {
    return <div className={styles.empty}>Nothing pinned yet</div>;
  }

  return (
    <div className={styles.dock}>
      <AnimatePresence initial={false}>
        {displayApps.map((app) => (
          <AppIcon
            key={app.id}
            app={app}
            dimmed={dragId === app.id}
            dropIndicator={overId?.id === app.id ? overId.edge : null}
            registerRef={registerRef}
            onDragStart={setDragId}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function LaunchpadSkeleton() {
  return (
    <div className={styles.dock} aria-busy="true" aria-label="Loading launchpad">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={styles.skeletonSlot}>
          <Skeleton width={56} height={56} radius={15} />
        </div>
      ))}
    </div>
  );
}

function LaunchpadMessage({ tone, children }: { tone: 'error' | 'quiet'; children: React.ReactNode }) {
  return <div className={`${styles.empty} ${tone === 'error' ? styles.emptyError : ''}`}>{children}</div>;
}
