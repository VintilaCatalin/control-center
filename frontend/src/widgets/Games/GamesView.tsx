import { useEffect, useRef, useState } from 'react';
import { reorderShelf } from '../../api/actions/games';
import { useSnapshotData } from '../../api/SnapshotProvider';
import type { GameData, ShelfData } from '../../api/types';
import { commitReorder, findContainingId, findInsertionPoint } from '../../primitives/dragReorder/dragGeometry';
import { type PanelDef, PanelGrid } from '../../primitives/PanelGrid/PanelGrid';
import { Shelf } from '../../primitives/Shelf/Shelf';
import { Skeleton } from '../../primitives/Skeleton/Skeleton';
import { AddGameSheet } from './AddGameSheet';
import { FavoritesStrip } from './FavoritesStrip';
import { GameTile } from './GameTile';
import styles from './GamesView.module.css';
import { PlaytimeAnalytics } from './PlaytimeAnalytics';
import { RenameShelfSheet } from './RenameShelfSheet';
import { ShelfMenu } from './ShelfMenu';

interface OverTile {
  shelfId: string;
  gameId: string;
  edge: 'before' | 'after';
}

// Games is single-view - no sidebar content published; MainSidebar
// keeps showing the root app list while it's active (see
// shell/MainSidebar). Panels show/hide is a sidebar utility now (see
// shell/GlobalUtilities).
export function GamesView() {
  const { snapshot, loading, error } = useSnapshotData();

  const [dragId, setDragId] = useState<string | null>(null);
  const [overTile, setOverTile] = useState<OverTile | null>(null);
  const [overShelfId, setOverShelfId] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<Record<string, string[]> | null>(null);
  const [addGameShelf, setAddGameShelf] = useState<ShelfData | null>(null);
  // undefined = closed, null = creating a new shelf, ShelfData = renaming that one.
  const [renameTarget, setRenameTarget] = useState<ShelfData | null | undefined>(undefined);

  const tileRefs = useRef(new Map<string, HTMLDivElement>());
  const shelfRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!localOrder) return;
    const t = setTimeout(() => setLocalOrder(null), 3000);
    return () => clearTimeout(t);
  }, [localOrder]);

  if (!snapshot && loading) return <GamesSkeleton />;
  if (!snapshot && error) return <GamesMessage tone="error">Can't reach the panel backend</GamesMessage>;
  if (snapshot?.errors?.games) return <GamesMessage tone="error">Games unavailable</GamesMessage>;

  const data = snapshot?.games;
  const shelves = data?.shelves ?? [];

  function displayGamesForShelf(shelf: ShelfData): GameData[] {
    const ids = localOrder?.[shelf.id];
    if (!ids) return shelf.games;
    const byId = new Map(shelf.games.map((g) => [g.id, g]));
    // Cross-shelf moves land here too - the moved game may not be in this
    // shelf's own list yet, so fall back to the full games list.
    const allById = new Map((data?.games ?? []).map((g) => [g.id, g]));
    return ids.map((id) => byId.get(id) ?? allById.get(id)).filter((g): g is GameData => !!g);
  }

  function registerTileRef(id: string, el: HTMLDivElement | null) {
    if (el) tileRefs.current.set(id, el);
    else tileRefs.current.delete(id);
  }

  function registerShelfRef(id: string, el: HTMLDivElement | null) {
    if (el) shelfRefs.current.set(id, el);
    else shelfRefs.current.delete(id);
  }

  function handleDragStart(id: string) {
    setDragId(id);
  }

  function handleDragMove(id: string, point: { x: number; y: number }) {
    const targetShelfId = findContainingId(point, shelfRefs.current);
    if (!targetShelfId) return;

    const shelf = shelves.find((s) => s.id === targetShelfId);
    if (!shelf) return;
    const shelfGameIds = new Set(displayGamesForShelf(shelf).map((g) => g.id));
    const candidates = Array.from(tileRefs.current.entries())
      .filter(([gid]) => shelfGameIds.has(gid))
      .map(([gid, el]) => ({ id: gid, el }));
    const nearest = findInsertionPoint(point, candidates, id);

    if (nearest) {
      const next: OverTile = { shelfId: targetShelfId, gameId: nearest.id, edge: nearest.edge };
      setOverTile((prev) =>
        prev?.shelfId === next.shelfId && prev?.gameId === next.gameId && prev?.edge === next.edge
          ? prev
          : next,
      );
      setOverShelfId((prev) => (prev === null ? prev : null));
    } else {
      setOverTile((prev) => (prev === null ? prev : null));
      setOverShelfId((prev) => (prev === targetShelfId ? prev : targetShelfId));
    }
  }

  function handleDragEnd(id: string) {
    const targetShelfId = overTile?.shelfId ?? overShelfId;
    const shelf = shelves.find((s) => s.id === targetShelfId);
    if (shelf) {
      const target = overTile && overTile.shelfId === shelf.id ? { id: overTile.gameId, edge: overTile.edge } : null;
      const ids = commitReorder(
        shelf.games.map((g) => g.id),
        id,
        target,
      );

      const originShelf = shelves.find((s) => s.id !== shelf.id && s.games.some((g) => g.id === id));
      setLocalOrder((prev) => {
        const next = { ...(prev ?? {}), [shelf.id]: ids };
        if (originShelf) next[originShelf.id] = originShelf.games.map((g) => g.id).filter((gid) => gid !== id);
        return next;
      });
      reorderShelf(shelf.id, ids);
    }
    setDragId(null);
    setOverTile(null);
    setOverShelfId(null);
  }

  const panels: PanelDef[] = [
    {
      id: 'playtime',
      label: 'Activity',
      minSize: { w: 1, h: 1 },
      content: <PlaytimeAnalytics playtimeChart={data?.playtime_chart ?? []} games={data?.games ?? []} recent={data?.recent ?? []} />,
    },
    {
      id: 'favorites',
      label: 'Favorites',
      minSize: { w: 1, h: 1 },
      content: <FavoritesStrip games={data?.favorites ?? []} />,
    },
    ...shelves.map((shelf) => {
      const games = displayGamesForShelf(shelf);
      return {
        id: `shelf-${shelf.id}`,
        label: shelf.label,
        // Below this a shelf can't show even one tile plus its label
        // comfortably - min, not max, so a library with many games can
        // still be grown as tall/wide as the grid allows.
        minSize: { w: 1, h: 1 },
        headerAction: (
          <ShelfMenu
            shelf={shelf}
            shelves={shelves}
            onAddGame={setAddGameShelf}
            onRename={setRenameTarget}
            onNewShelf={() => setRenameTarget(null)}
          />
        ),
        content: (
          <Shelf
            isEmpty={games.length === 0}
            empty="Empty. Drag a game here to move it in."
            dropActive={dragId !== null && (overShelfId === shelf.id || overTile?.shelfId === shelf.id)}
            shelfRef={(el) => registerShelfRef(shelf.id, el)}
          >
            {games.map((g) => (
              <GameTile
                key={g.id}
                game={g}
                shelves={shelves}
                currentShelfId={shelf.id}
                draggable
                dimmed={dragId === g.id}
                dropIndicator={overTile?.shelfId === shelf.id && overTile.gameId === g.id ? overTile.edge : null}
                registerRef={registerTileRef}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
              />
            ))}
          </Shelf>
        ),
      };
    }),
  ];

  return (
    <div className={styles.view}>
      <PanelGrid view="games" panels={panels} />
      <AddGameSheet
        open={!!addGameShelf}
        onClose={() => setAddGameShelf(null)}
        shelves={shelves}
        defaultShelfId={addGameShelf?.id}
      />
      <RenameShelfSheet
        open={renameTarget !== undefined}
        onClose={() => setRenameTarget(undefined)}
        shelves={shelves}
        editingShelf={renameTarget ?? null}
      />
    </div>
  );
}

function GamesSkeleton() {
  return (
    <div className={styles.view} aria-busy="true" aria-label="Loading games">
      <div className={styles.skeletonGrid}>
        {[0, 1].map((s) => (
          <div key={s} className={styles.skeletonPanel}>
            <Skeleton width={140} height={22} />
            <div className={styles.skeletonTiles}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} width="100%" className={styles.skeletonTile} radius={16} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GamesMessage({ tone, children }: { tone: 'error' | 'quiet'; children: React.ReactNode }) {
  return (
    <div className={styles.view}>
      <div className={`${styles.message} ${tone === 'error' ? styles.messageError : ''}`}>{children}</div>
    </div>
  );
}
