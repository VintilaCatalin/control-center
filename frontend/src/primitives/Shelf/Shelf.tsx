import type { ReactNode } from 'react';
import styles from './Shelf.module.css';

interface ShelfProps {
  empty?: ReactNode;
  children: ReactNode;
  isEmpty?: boolean;
  dropActive?: boolean;
  shelfRef?: (el: HTMLDivElement | null) => void;
}

// Just the tile grid + empty state now - the surrounding card and title
// are the PanelGrid's Panel chrome (each shelf is a panel), so this
// doesn't duplicate that anymore. No count label either - the collection
// itself already communicates size, a redundant "N games" line next to
// the title doesn't earn its space. Hit-testing for game-tile drag/drop
// is entirely pointer-position-based (GamesView's handleDragMove, via
// shelfRef's rect) - no native dragover/drop here, that pattern was
// replaced when the game-tile drag system moved to Framer's pointer drag.
export function Shelf({ empty, children, isEmpty, dropActive, shelfRef }: ShelfProps) {
  return (
    <div className={styles.shelf} ref={shelfRef}>
      <div className={[styles.grid, dropActive ? styles.dropActive : ''].filter(Boolean).join(' ')}>
        {isEmpty ? <div className={styles.empty}>{empty}</div> : children}
      </div>
    </div>
  );
}
