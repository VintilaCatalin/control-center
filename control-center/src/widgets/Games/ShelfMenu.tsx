import { saveShelves, shelfPayload } from '../../api/actions/shelves';
import type { ShelfData } from '../../api/types';
import { Menu, type MenuItem } from '../../primitives/Menu/Menu';
import { useMenu } from '../../primitives/Menu/useMenu';
import styles from './ShelfMenu.module.css';

function CogIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

interface ShelfMenuProps {
  shelf: ShelfData;
  shelves: ShelfData[];
  onAddGame: (shelf: ShelfData) => void;
  onRename: (shelf: ShelfData) => void;
  onNewShelf: () => void;
}

// Restores the old app's shelfMenu() (index.html:5649-5673). "Remove
// shelf" keeps the games in it - they fall through to shelf_for()'s
// catch-all placement on the next collect, same as the old app.
export function ShelfMenu({ shelf, shelves, onAddGame, onRename, onNewShelf }: ShelfMenuProps) {
  const menu = useMenu();

  const items: MenuItem[] = [
    { label: 'Add a game…', onClick: () => onAddGame(shelf) },
    { label: 'Rename shelf…', onClick: () => onRename(shelf) },
    { label: 'New shelf…', onClick: onNewShelf },
    { sep: true },
    {
      label: 'Remove shelf',
      hint: 'keeps games',
      danger: true,
      onClick: async () => {
        if (shelves.length < 2) return;
        const rest = shelves.filter((s) => s.id !== shelf.id).map(shelfPayload);
        await saveShelves(rest);
      },
    },
  ];

  return (
    <>
      <button type="button" className={styles.btn} onClick={menu.openAt} aria-label="Shelf options" title="Shelf options">
        <CogIcon />
      </button>
      <Menu open={menu.open} x={menu.x} y={menu.y} items={items} onClose={menu.close} />
    </>
  );
}
