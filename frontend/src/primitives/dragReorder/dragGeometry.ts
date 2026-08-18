// Shared math for every pointer-drag reorder surface in the app (game
// tiles within a shelf, panels within PanelGrid, app icons within the
// Launchpad dock). One implementation instead of three, since the
// underlying interaction is identical even though the visual language
// differs per surface.

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// Framer's PanInfo.point is page-relative (document coordinates, fixed
// regardless of scroll); getBoundingClientRect() is viewport-relative
// (shifts as you scroll). Comparing the two directly silently breaks for
// anything below the fold - this was the exact bug that made shelf drag
// only ever work for Steam (the first, tallest shelf) and not Xbox/Other
// games. Every hit-test in this file works in page coordinates.
export function pageRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return {
    left: r.left + window.scrollX,
    right: r.right + window.scrollX,
    top: r.top + window.scrollY,
    bottom: r.bottom + window.scrollY,
  };
}

export interface DragCandidate {
  id: string;
  el: HTMLElement;
}

export interface InsertionPoint {
  id: string;
  edge: 'before' | 'after';
}

// Nearest-center + "whichever axis the pointer is further off-center on
// decides before/after" - correct for a wrapping multi-row grid (a
// neighbor can be above/below, not just side-by-side), and degrades
// gracefully to a plain single-row list.
export function findInsertionPoint(
  point: { x: number; y: number },
  candidates: DragCandidate[],
  excludeId?: string,
): InsertionPoint | null {
  let nearest: InsertionPoint | null = null;
  let bestDist = Infinity;
  for (const { id, el } of candidates) {
    if (id === excludeId) continue;
    const r = pageRect(el);
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    const dist = (point.x - cx) ** 2 + (point.y - cy) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      const dx = Math.abs(point.x - cx);
      const dy = Math.abs(point.y - cy);
      const edge: 'before' | 'after' =
        dx > dy ? (point.x < cx ? 'before' : 'after') : point.y < cy ? 'before' : 'after';
      nearest = { id, edge };
    }
  }
  return nearest;
}

// Which container (shelf, panel grid, etc.) the pointer is currently over
// - only meaningful for surfaces with more than one drop container (Games'
// shelves); a single-list surface like the Launchpad dock never needs
// this.
export function findContainingId<T extends string>(
  point: { x: number; y: number },
  containers: Map<T, HTMLElement>,
): T | null {
  for (const [id, el] of containers) {
    const r = pageRect(el);
    if (point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom) return id;
  }
  return null;
}

// Removes draggedId from order and reinserts it at the resolved
// before/after position - falls back to "append at the end" if there's no
// target (dropped past every item, or into empty space).
export function commitReorder(order: string[], draggedId: string, target: InsertionPoint | null): string[] {
  const current = order.filter((id) => id !== draggedId);
  if (!target) {
    current.push(draggedId);
    return current;
  }
  const idx = current.indexOf(target.id);
  const at = idx < 0 ? current.length : target.edge === 'before' ? idx : idx + 1;
  current.splice(Math.max(0, Math.min(current.length, at)), 0, draggedId);
  return current;
}
