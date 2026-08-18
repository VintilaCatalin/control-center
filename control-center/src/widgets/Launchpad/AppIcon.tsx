import { motion } from 'framer-motion';
import { launchTarget } from '../../api/actions/launch';
import { removeApp } from '../../api/actions/apps';
import type { AppData } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import { useDraggableTile } from '../../primitives/dragReorder/useDraggableTile';
import { Menu, type MenuItem } from '../../primitives/Menu/Menu';
import { useMenu } from '../../primitives/Menu/useMenu';
import { duration, ease } from '../../tokens/motion';
import { useIconSheet } from './IconSheetContext';
import styles from './Launchpad.module.css';

function glyph(label: string): string {
  const words = label.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

interface AppIconProps {
  app: AppData;
  dimmed?: boolean;
  dropIndicator?: 'before' | 'after' | null;
  registerRef?: (id: string, el: HTMLDivElement | null) => void;
  onDragStart?: (id: string) => void;
  onDragMove?: (id: string, point: { x: number; y: number }) => void;
  onDragEnd?: (id: string) => void;
}

export function AppIcon({ app, dimmed, dropIndicator, registerRef, onDragStart, onDragMove, onDragEnd }: AppIconProps) {
  const menu = useMenu();
  const openIconSheet = useIconSheet();

  const { handleClick, handleKeyDown, dragMotionProps } = useDraggableTile({
    id: app.id,
    draggable: true,
    onActivate: () => launchTarget(app.target),
    onDragStart,
    onDragMove,
    onDragEnd,
  });

  const items: MenuItem[] = [
    { label: 'Change icon…', onClick: () => openIconSheet(app) },
    { sep: true },
    { label: 'Remove', danger: true, onClick: () => removeApp(app.id) },
  ];

  return (
    <>
      <motion.div
        ref={(el) => registerRef?.(app.id, el)}
        layout
        {...dragMotionProps}
        whileHover={{ y: -6, scale: 1.06 }}
        whileTap={{ scale: 0.92, y: -2 }}
        transition={{ duration: duration.fast, ease }}
        className={[styles.appButton, dropIndicator ? styles[`drop-${dropIndicator}`] : ''].filter(Boolean).join(' ')}
        style={{ opacity: dimmed ? 0.4 : 1 }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onContextMenu={menu.openAt}
        role="button"
        tabIndex={0}
        title={app.label}
      >
        <ArtTile
          aspect="square"
          src={app.icon}
          alt={app.label}
          contain
          className={styles.appTile}
          fallback={<span className={styles.appGlyph}>{glyph(app.label)}</span>}
        />
        <span className={styles.appTooltip}>{app.label}</span>
      </motion.div>
      <Menu open={menu.open} x={menu.x} y={menu.y} items={items} onClose={menu.close} />
    </>
  );
}
