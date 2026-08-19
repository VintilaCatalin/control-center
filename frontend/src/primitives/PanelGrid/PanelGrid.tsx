import { motion, useDragControls, type PanInfo } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { hidePanel, reorderPanels, resizePanel } from '../../api/actions/layout';
import { useSnapshotData } from '../../api/SnapshotProvider';
import { commitReorder, findInsertionPoint } from '../dragReorder/dragGeometry';
import { duration, ease } from '../../tokens/motion';
import { usePublishPanelsControl } from '../../shell/PanelsControlContext';
import styles from './PanelGrid.module.css';

const COLS = 8;
// Was 60 - each height step (1 row = ROW_PX + GAP_PX of real pixels)
// was coarse enough that resizing a panel taller felt like it snapped
// through large jumps, sometimes leaving a visibly oversized gap under
// content that only needed a little more room. Finer rows mean smaller,
// smoother steps for the exact same drag distance. MUST stay in sync
// with PanelGrid.module.css's .grid { grid-auto-rows: ... } - that's a
// separate hardcoded value CSS Grid needs directly, not derived from
// this constant.
const ROW_PX = 44;
const GAP_PX = 20; // matches --space-5, used only for resize px<->unit math

interface Size {
  w: number;
  h: number;
}

export interface PanelDef {
  id: string;
  label: string;
  content: ReactNode;
  // Per-panel resize floor/ceiling, on top of the grid's global 1-8 / 1-20
  // bounds - e.g. a shelf shouldn't be resizable down to where no tile can
  // fit. Omit for a panel that's fine at any size within the global bounds.
  minSize?: Size;
  maxSize?: Size;
  // An optional small control next to the panel's own label (e.g. Games'
  // per-shelf "..." menu) - distinct from the grid-level show/hide
  // toolbar, which manages panels as a set, not any one panel's own
  // content.
  headerAction?: ReactNode;
  // For panels whose content wants the full card surface - e.g. Now
  // Playing's art background - rather than the normal padded
  // label-then-body layout. The drag/resize handles float over the
  // content instead of sitting in a separate header row; the panel's own
  // label text is left to the content to render (or omit) as it sees fit.
  bleed?: boolean;
}

interface PanelGridProps {
  view: string;
  panels: PanelDef[];
  fallbackSize?: Size;
}

function DragIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="6" r="1.7" />
      <circle cx="16" cy="6" r="1.7" />
      <circle cx="8" cy="12" r="1.7" />
      <circle cx="16" cy="12" r="1.7" />
      <circle cx="8" cy="18" r="1.7" />
      <circle cx="16" cy="18" r="1.7" />
    </svg>
  );
}

function ResizeIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
      <path d="M19 13v6h-6M19 19L5 5" />
    </svg>
  );
}

// A movable/resizable/reorderable/hideable panel grid - the same general
// mechanism the old app's Overview/Homelab used (CSS Grid, 8 uniform
// columns, fixed-px row unit, order-in-array determines position, no x/y
// coordinates), generalized to any view. Reuses the exact same backend
// routes (server.py:2894-2926) via one additive DEFAULT_LAYOUTS entry per
// view - no new backend logic.
const LOCK_KEY_PREFIX = 'panelsLocked:';

export function PanelGrid({ view, panels, fallbackSize = { w: 2, h: 6 } }: PanelGridProps) {
  const { snapshot } = useSnapshotData();
  const saved = snapshot?.ui?.layouts?.[view];

  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [localSizes, setLocalSizes] = useState<Record<string, Size> | null>(null);
  const [localHidden, setLocalHidden] = useState<string[] | null>(null);
  // A display/interaction preference, not reading data - same localStorage
  // treatment FeedHero's own pinned-story preference already uses, not
  // persisted server-side. Per-view key so locking Games doesn't lock
  // Overview too.
  const [locked, setLocked] = useState(() => {
    try {
      return localStorage.getItem(LOCK_KEY_PREFIX + view) === '1';
    } catch {
      return false;
    }
  });

  function toggleLock() {
    setLocked((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LOCK_KEY_PREFIX + view, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  useEffect(() => {
    if (!localOrder && !localSizes && !localHidden) return;
    const t = setTimeout(() => {
      setLocalOrder(null);
      setLocalSizes(null);
      setLocalHidden(null);
    }, 6000);
    return () => clearTimeout(t);
  }, [localOrder, localSizes, localHidden]);

  const knownIds = panels.map((p) => p.id);
  const baseOrder = (saved?.order ?? knownIds).filter((id) => knownIds.includes(id));
  const effectiveOrder = localOrder ?? baseOrder;
  // Resilient to a panel that exists on the frontend but hasn't been
  // registered in the server's layout defaults yet - append it rather
  // than silently dropping it (see the note on this in server.py's new
  // "games" DEFAULT_LAYOUTS entry).
  const order = [...effectiveOrder, ...knownIds.filter((id) => !effectiveOrder.includes(id))];
  const sizes: Record<string, Size> = {
    ...Object.fromEntries(knownIds.map((id) => [id, fallbackSize])),
    ...(saved?.sizes ?? {}),
    ...(localSizes ?? {}),
  };
  const hidden = localHidden ?? saved?.hidden ?? [];

  const byId = new Map(panels.map((p) => [p.id, p]));
  const visible = order.filter((id) => byId.has(id) && !hidden.includes(id));

  const gridRef = useRef<HTMLDivElement | null>(null);
  const panelRefs = useRef(new Map<string, HTMLDivElement>());

  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<{ id: string; edge: 'before' | 'after' } | null>(null);

  function handlePanelDragMove(id: string, point: { x: number; y: number }) {
    const candidates: { id: string; el: HTMLDivElement }[] = [];
    for (const pid of visible) {
      const el = panelRefs.current.get(pid);
      if (el) candidates.push({ id: pid, el });
    }
    const nearest = findInsertionPoint(point, candidates, id);
    setOverId((prev) => (prev?.id === nearest?.id && prev?.edge === nearest?.edge ? prev : nearest));
  }

  function handlePanelDragEnd(id: string) {
    if (overId) {
      const current = commitReorder(order, id, overId);
      setLocalOrder(current);
      reorderPanels(view, current);
    }
    setDragId(null);
    setOverId(null);
  }

  function handleResize(id: string, w: number, h: number) {
    setLocalSizes((prev) => ({ ...(prev ?? sizes), [id]: { w, h } }));
    resizePanel(view, id, w, h);
  }

  function handleHide(id: string, hide: boolean) {
    const next = hide ? [...hidden.filter((x) => x !== id), id] : hidden.filter((x) => x !== id);
    setLocalHidden(next);
    hidePanel(view, id, hide);
  }

  // The show/hide control itself now lives in the global header (a
  // sibling, not part of this grid) - see PanelsControlContext. This grid
  // just publishes what it has and what's hidden; hidden.join/panels
  // keeps the published object referentially stable across renders that
  // don't actually change anything (see usePublishPanelsControl's note on
  // why that matters).
  const hiddenKey = hidden.join(',');
  const panelsControlValue = useMemo(
    () => ({
      items: panels.map((p) => ({ id: p.id, label: p.label, hidden: hidden.includes(p.id) })),
      toggle: (id: string) => handleHide(id, !hidden.includes(id)),
      locked,
      toggleLock,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panels, hiddenKey, locked],
  );
  usePublishPanelsControl(panelsControlValue);

  // The show/hide control used to live here as a floating overlay button
  // - it's the global header's PanelsControlContext consumer now, so
  // there's nothing left for this wrapper to position; a plain fragment
  // reserves no space and floats over nothing.
  return (
    <>
      {visible.length === 0 ? (
        <div className={styles.emptyState}>All panels are hidden - use the Panels control in the header to bring one back.</div>
      ) : (
        <div className={styles.grid} ref={gridRef} data-panel-grid={view}>
          {visible.map((id) => {
            const panel = byId.get(id);
            if (!panel) return null;
            return (
              <Panel
                key={id}
                panel={panel}
                view={view}
                size={sizes[id] ?? fallbackSize}
                minSize={panel.minSize ?? { w: 1, h: 1 }}
                maxSize={panel.maxSize ?? { w: COLS, h: 20 }}
                locked={locked}
                dragging={dragId === id}
                dropEdge={overId?.id === id ? overId.edge : null}
                registerRef={(el) => {
                  if (el) panelRefs.current.set(id, el);
                  else panelRefs.current.delete(id);
                }}
                gridRef={gridRef}
                onDragStart={() => setDragId(id)}
                onDragMove={(pt) => handlePanelDragMove(id, pt)}
                onDragEnd={() => handlePanelDragEnd(id)}
                onResize={(w, h) => handleResize(id, w, h)}
              />
            );
          })}
        </div>
      )}
    </>
  );
}

interface PanelProps {
  panel: PanelDef;
  view: string;
  size: Size;
  minSize: Size;
  maxSize: Size;
  locked: boolean;
  dragging: boolean;
  dropEdge: 'before' | 'after' | null;
  registerRef: (el: HTMLDivElement | null) => void;
  gridRef: React.RefObject<HTMLDivElement | null>;
  onDragStart: () => void;
  onDragMove: (point: { x: number; y: number }) => void;
  onDragEnd: () => void;
  onResize: (w: number, h: number) => void;
}

function Panel({
  panel,
  view,
  size,
  minSize,
  maxSize,
  locked,
  dragging,
  dropEdge,
  registerRef,
  gridRef,
  onDragStart,
  onDragMove,
  onDragEnd,
  onResize,
}: PanelProps) {
  const controls = useDragControls();
  const cardRef = useRef<HTMLDivElement | null>(null);
  // The grid placement (gridColumn/gridRow) always reflects the committed
  // `size`, never a value being live-dragged - changing a grid item's span
  // every pointermove reflows every panel after it in the flow, which is
  // exactly the "jitter/jumps" the rest of the grid showed during a
  // resize. Instead, resizing draws a floating pixel-smooth ghost box on
  // top of the (untouched) grid, and the grid itself only relayouts once,
  // via the existing `layout` FLIP transition, when the final snapped size
  // commits on release.
  const [ghostPx, setGhostPx] = useState<Size | null>(null);
  const [ghostSnap, setGhostSnap] = useState<Size | null>(null);
  // Mirrors ghostSnap so onUp can read the latest value directly, without
  // reaching for setGhostSnap's updater-function form as a side-channel to
  // call onResize (a PARENT setState) from inside it - that ordering is
  // exactly what produced "Cannot update PanelGrid while rendering Panel".
  // Updater functions have to stay pure; the parent update belongs in the
  // event handler body, as a plain statement, after this component's own
  // state settles.
  const ghostRef = useRef<Size | null>(null);

  function handlePan(_: unknown, info: PanInfo) {
    onDragMove({ x: info.point.x, y: info.point.y });
  }

  function startResize(e: ReactPointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const grid = gridRef.current;
    const card = cardRef.current;
    if (!grid || !card) return;
    const gridRect = grid.getBoundingClientRect();
    const startRect = card.getBoundingClientRect();
    const colPx = (gridRect.width - GAP_PX * (COLS - 1)) / COLS;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = startRect.width;
    const startH = startRect.height;
    // Pixel bounds matching minSize/maxSize, so the smooth ghost stops
    // exactly at the real limit instead of visually overshooting it while
    // the snapped value underneath is already clamped.
    const minPxW = minSize.w * colPx + (minSize.w - 1) * GAP_PX;
    const maxPxW = maxSize.w * colPx + (maxSize.w - 1) * GAP_PX;
    const minPxH = minSize.h * ROW_PX + (minSize.h - 1) * GAP_PX;
    const maxPxH = maxSize.h * ROW_PX + (maxSize.h - 1) * GAP_PX;

    function onMove(ev: PointerEvent) {
      const pxW = Math.min(maxPxW, Math.max(minPxW, startW + (ev.clientX - startX)));
      const pxH = Math.min(maxPxH, Math.max(minPxH, startH + (ev.clientY - startY)));
      const rawW = Math.round((pxW + GAP_PX) / (colPx + GAP_PX));
      const rawH = Math.round((pxH + GAP_PX) / (ROW_PX + GAP_PX));
      const w = Math.max(minSize.w, Math.min(maxSize.w, rawW));
      const h = Math.max(minSize.h, Math.min(maxSize.h, rawH));
      ghostRef.current = { w, h };
      setGhostSnap({ w, h });
      setGhostPx({ w: pxW, h: pxH });
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      onMove(ev);
      const final = ghostRef.current;
      ghostRef.current = null;
      setGhostSnap(null);
      setGhostPx(null);
      if (final) onResize(final.w, final.h);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <motion.div
      ref={(el) => {
        cardRef.current = el;
        registerRef(el);
      }}
      layout
      drag={!locked}
      dragControls={controls}
      dragListener={false}
      dragSnapToOrigin
      dragElastic={0}
      dragMomentum={false}
      whileDrag={{ scale: 1.02, zIndex: 40, boxShadow: '0 24px 48px rgba(0,0,0,0.55)' }}
      onDragStart={onDragStart}
      onDrag={handlePan}
      onDragEnd={onDragEnd}
      className={[
        styles.panel,
        panel.bleed ? styles.bleed : '',
        dropEdge ? styles[`drop-${dropEdge}`] : '',
        ghostSnap ? styles.resizing : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        gridColumn: `span ${Math.max(minSize.w, Math.min(maxSize.w, size.w))}`,
        gridRow: `span ${Math.max(minSize.h, Math.min(maxSize.h, size.h))}`,
        opacity: dragging ? 0.4 : 1,
        zIndex: ghostSnap ? 45 : undefined,
      }}
      transition={{ duration: duration.fast, ease }}
      data-panel-view={view}
      data-panel-id={panel.id}
    >
      <div className={styles.panelHead}>
        {!locked && (
          <span className={styles.dragHandle} onPointerDown={(e) => controls.start(e)} title="Drag to rearrange">
            <DragIcon />
          </span>
        )}
        {!panel.bleed && !locked && <span className={styles.panelLabel} data-panel-label>{panel.label}</span>}
        {panel.headerAction && <div className={styles.panelHeaderAction}>{panel.headerAction}</div>}
      </div>
      <div className={styles.panelBody} data-panel-body>{panel.content}</div>
      {!locked && (
        <span className={styles.resizeHandle} onPointerDown={startResize} title="Drag to resize">
          <ResizeIcon />
        </span>
      )}
      {ghostPx && <span className={styles.resizeGhost} style={{ width: ghostPx.w, height: ghostPx.h }} />}
      {ghostSnap && (
        <span className={styles.sizeTag}>
          {ghostSnap.w} × {ghostSnap.h}
        </span>
      )}
    </motion.div>
  );
}
