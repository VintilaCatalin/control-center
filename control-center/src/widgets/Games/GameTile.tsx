import { motion } from 'framer-motion';
import type { MouseEvent } from 'react';
import { launchTarget } from '../../api/actions/launch';
import { hideGame, moveGame, removeGame, toggleFavorite } from '../../api/actions/games';
import { setGameArt } from '../../api/actions/covers';
import type { GameData, ShelfData } from '../../api/types';
import { Menu, type MenuItem } from '../../primitives/Menu/Menu';
import { useMenu } from '../../primitives/Menu/useMenu';
import { useDraggableTile } from '../../primitives/dragReorder/useDraggableTile';
import { duration, ease } from '../../tokens/motion';
import { useCoverSheet } from './CoverSheetContext';
import { GameCover } from './GameCover';
import styles from './GameTile.module.css';

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.5l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6L12 3.5z" />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

interface GameTileProps {
  game: GameData;
  shelves: ShelfData[];
  currentShelfId?: string;
  draggable?: boolean;
  dropIndicator?: 'before' | 'after' | null;
  dimmed?: boolean;
  registerRef?: (id: string, el: HTMLDivElement | null) => void;
  onDragStart?: (id: string) => void;
  onDragMove?: (id: string, point: { x: number; y: number }) => void;
  onDragEnd?: (id: string) => void;
}

export function GameTile({
  game,
  shelves,
  currentShelfId,
  draggable,
  dropIndicator,
  dimmed,
  registerRef,
  onDragStart,
  onDragMove,
  onDragEnd,
}: GameTileProps) {
  const menu = useMenu();
  const openCoverSheet = useCoverSheet();

  const { handleClick, handleKeyDown, dragMotionProps } = useDraggableTile({
    id: game.id,
    draggable,
    onActivate: () => game.launch && launchTarget(game.launch),
    onDragStart,
    onDragMove,
    onDragEnd,
  });

  const shelfId = currentShelfId ?? shelves.find((s) => s.games.some((g) => g.id === game.id))?.id;
  const otherShelves = shelves.filter((s) => s.id !== shelfId);

  const items: MenuItem[] = [
    {
      label: game.favorite ? 'Remove from favorites' : 'Add to favorites',
      onClick: () => toggleFavorite(game.id, !game.favorite),
    },
    { sep: true },
    { label: 'Change cover…', onClick: () => openCoverSheet(game) },
    { label: 'Reset cover to automatic', onClick: () => setGameArt(game.id, null) },
  ];
  if (otherShelves.length) {
    items.push({ sep: true }, { heading: 'Move to' });
    otherShelves.forEach((s) => items.push({ label: s.label, onClick: () => moveGame(game.id, s.id) }));
  }
  items.push(
    { sep: true },
    {
      label: game.source === 'manual' ? 'Delete' : 'Hide from panel',
      hint: game.source === 'manual' ? undefined : 'rescan-safe',
      danger: true,
      onClick: () => (game.source === 'manual' ? removeGame(game.id) : hideGame(game.id, true)),
    },
  );

  function handleFavorite(e: MouseEvent) {
    e.stopPropagation();
    toggleFavorite(game.id, !game.favorite);
  }

  return (
    <>
      <motion.div
        ref={(el) => registerRef?.(game.id, el)}
        layout
        {...dragMotionProps}
        // These carry their own transition rather than inheriting the
        // root one below (which is tuned for layout/drag-reorder) - the
        // lift should feel like a deliberate, slightly slower settle, not
        // the snap a reorder uses.
        whileHover={{ scale: 1.035, y: -4, transition: { duration: duration.base, ease } }}
        whileTap={{ scale: 0.97, transition: { duration: duration.fast, ease } }}
        whileDrag={{ scale: 1.06, zIndex: 30, boxShadow: '0 24px 48px rgba(0,0,0,0.55)' }}
        className={[
          styles.tile,
          dropIndicator ? styles[`drop-${dropIndicator}`] : '',
          game.launch ? styles.launchable : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ opacity: dimmed ? 0.32 : 1 }}
        transition={{ duration: duration.fast, ease }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onContextMenu={menu.openAt}
        role="button"
        tabIndex={0}
        title={game.name}
      >
        <GameCover game={game} />
        <button
          type="button"
          className={[styles.favBtn, game.favorite ? styles.favActive : ''].filter(Boolean).join(' ')}
          onClick={handleFavorite}
          aria-label={game.favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <StarIcon filled={!!game.favorite} />
        </button>
        <button type="button" className={styles.cogBtn} onClick={(e) => menu.openAt(e)} aria-label="Options">
          <CogIcon />
        </button>
        <div className={styles.nameOverlay}>
          <span className={styles.name}>{game.name}</span>
        </div>
      </motion.div>
      <Menu open={menu.open} x={menu.x} y={menu.y} items={items} onClose={menu.close} />
    </>
  );
}
