import { useCallback, useEffect, useRef, useState } from 'react';

// The full self-contained behaviour a hand-rolled (non-Menu) sidebar
// popover needs: open state, a trigger ref, a panel ref, position
// (opens to the right of the trigger, top-aligned - see
// useSidebarAnchor's identical rationale for Menu-based popovers),
// re-clamped to the viewport once the panel's real rendered size is
// known (a sidebar trigger can sit anywhere in a tall column, including
// near the very bottom), and close-on-outside-click/Escape. Weather and
// the Quick Tasks popover both need exactly this, so it lives here once
// instead of each hand-rolling its own copy.
export function useSidebarPopover<T extends HTMLElement = HTMLButtonElement>(gap = 10) {
  const triggerRef = useRef<T>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const openPopover = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ left: r.right + gap, top: r.top });
    setOpen(true);
  }, [gap]);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => (open ? close() : openPopover()), [open, close, openPopover]);

  useEffect(() => {
    if (!open) return;
    const el = panelRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    setPos((p) => ({
      left: Math.max(8, Math.min(p.left, window.innerWidth - box.width - 12)),
      top: Math.max(8, Math.min(p.top, window.innerHeight - box.height - 12)),
    }));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointer(e: MouseEvent) {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return { triggerRef, panelRef, open, pos, toggle, close };
}
