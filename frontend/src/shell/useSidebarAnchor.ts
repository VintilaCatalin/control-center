import { useCallback, useRef, useState } from 'react';

interface AnchorState {
  open: boolean;
  x: number;
  y: number;
}

// Positions a popover to open adjacent to a trigger living in the left
// sidebar - to the right of the trigger's own right edge, top-aligned
// with it - replacing useAnchoredMenu's top-right-header assumption
// (x measured from the viewport's right edge, y below the trigger),
// which put every sidebar-triggered popover off in the wrong direction
// once Quick Tasks/Weather/Profile moved out of the header. `Menu`'s own
// align="left" clamp (Math.max(8, Math.min(x, innerWidth-width-12)))
// already keeps the result fully on-screen; this hook only supplies the
// initial guess. Hand-rolled popovers that don't use `Menu` (Weather,
// Quick Tasks) re-clamp themselves the same way after measuring their
// own rendered size - see WeatherPopover.tsx.
export function useSidebarAnchor<T extends HTMLElement = HTMLButtonElement>(gap = 10) {
  const ref = useRef<T>(null);
  const [state, setState] = useState<AnchorState>({ open: false, x: 0, y: 0 });

  const toggle = useCallback(() => {
    setState((s) => {
      if (s.open) return { ...s, open: false };
      const r = ref.current?.getBoundingClientRect();
      if (!r) return s;
      return { open: true, x: r.right + gap, y: r.top };
    });
  }, [gap]);

  const close = useCallback(() => setState((s) => (s.open ? { ...s, open: false } : s)), []);

  return { ref, open: state.open, x: state.x, y: state.y, toggle, close };
}
