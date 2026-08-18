import type { PanInfo } from 'framer-motion';
import { useRef, type KeyboardEvent } from 'react';

interface UseDraggableTileOptions {
  id: string;
  draggable?: boolean;
  onActivate?: () => void;
  onDragStart?: (id: string) => void;
  onDragMove?: (id: string, point: { x: number; y: number }) => void;
  onDragEnd?: (id: string) => void;
}

// The shared interaction model behind every draggable tile in the app
// (game tiles, app icons): pointer drag follows the cursor and reorders on
// drop, a plain click/tap launches, and the two are mutually exclusive via
// an explicit ref flag - not event-timing - so a completed drag never
// launches and a cancelled one never does either. Keyboard activation
// (Enter/Space) always launches, independent of drag state entirely.
export function useDraggableTile({
  id,
  draggable,
  onActivate,
  onDragStart,
  onDragMove,
  onDragEnd,
}: UseDraggableTileOptions) {
  const hasDraggedRef = useRef(false);

  function handleClick() {
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }
    onActivate?.();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate?.();
    }
  }

  function handleDragStart() {
    hasDraggedRef.current = true;
    onDragStart?.(id);
  }

  function handlePan(_: unknown, info: PanInfo) {
    onDragMove?.(id, { x: info.point.x, y: info.point.y });
  }

  function handleDragEnd() {
    onDragEnd?.(id);
  }

  return {
    handleClick,
    handleKeyDown,
    dragMotionProps: {
      drag: draggable,
      dragSnapToOrigin: true,
      dragElastic: 0,
      dragMomentum: false,
      onDragStart: handleDragStart,
      onDrag: handlePan,
      onDragEnd: handleDragEnd,
    },
  };
}
