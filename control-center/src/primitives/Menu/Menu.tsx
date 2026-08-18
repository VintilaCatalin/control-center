import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { duration, ease } from '../../tokens/motion';
import styles from './Menu.module.css';

export interface MenuItem {
  label?: string;
  hint?: string;
  danger?: boolean;
  sep?: boolean;
  heading?: string;
  // Optional per-item glyph (a small inline SVG, 15-16px) - every
  // existing caller omits this and renders exactly as before; a menu
  // that wants a more product-specific feel (see the profile menu) can
  // opt in without a second menu component.
  icon?: ReactNode;
  onClick?: () => void;
}

interface MenuProps {
  open: boolean;
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  // 'left' (default): x is the menu's left edge, same as every existing
  // caller (context menus opened at a click point). 'right': x is the
  // distance from the *viewport's* right edge (like the CSS `right`
  // property) - for a trigger that already sits near the right edge
  // (header profile/panels buttons) this keeps the menu inside that
  // trigger's own content margin instead of a left-anchor clamp that
  // only guarantees 12px from the raw browser edge.
  align?: 'left' | 'right';
  // Clicks inside this element don't count as "outside" for the
  // close-on-outside-click handler below. Without it, clicking the same
  // toggle button that opened the menu closes it (mousedown fires this
  // handler first) and then immediately reopens it (the button's own
  // onClick fires next) - looks like the menu won't close at all.
  ignoreRef?: RefObject<HTMLElement | null>;
}

// A real reusable context-menu surface, not a one-off - ported from the
// old app's showMenu()/`.menu` (index.html:5556-5589, 1084-1131): fixed
// position clamped to the viewport, glass surface, items/separators/
// headings/danger styling. Portaled to document.body so it isn't clipped
// by an ancestor's overflow:hidden (every Card uses one).
export function Menu({ open, x, y, items, onClose, align = 'left', ignoreRef }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pos, setPos] = useState({ left: x, top: y });

  const actionableIndexes = items.reduce<number[]>((acc, item, i) => {
    if (!item.sep && !item.heading) acc.push(i);
    return acc;
  }, []);

  useEffect(() => {
    if (!open) return;
    setPos(align === 'right' ? { left: window.innerWidth - x - 220, top: y } : { left: x, top: y });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, x, y, align]);

  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const left =
      align === 'right'
        ? Math.max(8, window.innerWidth - x - box.width)
        : Math.max(8, Math.min(x, window.innerWidth - box.width - 12));
    setPos({
      left,
      top: Math.max(8, Math.min(y, window.innerHeight - box.height - 12)),
    });
  }, [open, x, y, align]);

  // Land keyboard focus on the first real item as soon as the menu opens -
  // a menu you can't immediately arrow through isn't keyboard-navigable,
  // it just looks like it is.
  useEffect(() => {
    if (!open) return;
    const first = actionableIndexes[0];
    if (first !== undefined) itemRefs.current[first]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointer(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (ignoreRef?.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener('mousedown', handlePointer);
    return () => document.removeEventListener('mousedown', handlePointer);
  }, [open, onClose, ignoreRef]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const focusedIdx = itemRefs.current.findIndex((el) => el === document.activeElement);
    const pos = actionableIndexes.indexOf(focusedIdx);
    let nextPos: number;
    if (e.key === 'Home') nextPos = 0;
    else if (e.key === 'End') nextPos = actionableIndexes.length - 1;
    else if (e.key === 'ArrowDown') nextPos = pos < 0 ? 0 : (pos + 1) % actionableIndexes.length;
    else nextPos = pos < 0 ? actionableIndexes.length - 1 : (pos - 1 + actionableIndexes.length) % actionableIndexes.length;
    itemRefs.current[actionableIndexes[nextPos]]?.focus();
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          className={styles.menu}
          style={{ left: pos.left, top: pos.top }}
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: duration.fast, ease }}
          role="menu"
          onKeyDown={handleKeyDown}
        >
          {items.map((item, i) => {
            if (item.sep) return <hr key={i} className={styles.sep} />;
            if (item.heading) {
              return (
                <div key={i} className={styles.heading}>
                  {item.heading}
                </div>
              );
            }
            return (
              <button
                key={i}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                className={`${styles.item} ${item.danger ? styles.danger : ''}`}
                onClick={() => {
                  onClose();
                  item.onClick?.();
                }}
              >
                <span className={styles.itemMain}>
                  {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
                  <span>{item.label}</span>
                </span>
                {item.hint && <span className={styles.hint}>{item.hint}</span>}
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
