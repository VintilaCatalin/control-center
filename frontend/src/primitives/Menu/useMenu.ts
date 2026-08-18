import { useCallback, useState } from 'react';

interface MenuState {
  open: boolean;
  x: number;
  y: number;
}

// Wires a click or contextmenu event to a <Menu>: openAt(e) positions it
// at the pointer and prevents the browser's own context menu, matching
// the old app's showMenu(event, items) call sites.
export function useMenu() {
  const [state, setState] = useState<MenuState>({ open: false, x: 0, y: 0 });

  const openAt = useCallback((e: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault();
    e.stopPropagation();
    setState({ open: true, x: e.clientX, y: e.clientY });
  }, []);

  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  return { ...state, openAt, close };
}
