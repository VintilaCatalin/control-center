import type { LibraryCollection, LibraryItem } from '../../api/types';

export type LibrarySection = 'recent' | 'unsorted' | 'favorites' | string;

export function formatSavedDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

export function sectionLabel(key: LibrarySection, collections: LibraryCollection[]): string {
  if (key === 'recent') return 'Recent';
  if (key === 'unsorted') return 'Unsorted';
  if (key === 'favorites') return 'Favorites';
  return collections.find((c) => c.id === key)?.title ?? 'Collection';
}

export function collectionAccent(color?: string | null): string | undefined {
  if (!color) return undefined;
  return color.startsWith('#') ? color : `#${color}`;
}

export function buildCollectionTree(collections: LibraryCollection[]) {
  const roots = collections.filter((c) => !c.parentId).sort((a, b) => a.title.localeCompare(b.title));
  const byParent = new Map<string, LibraryCollection[]>();
  for (const c of collections) {
    if (!c.parentId) continue;
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.title.localeCompare(b.title));
  return { roots, byParent };
}

export function filterItems(items: LibraryItem[], query: string): LibraryItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.domain.toLowerCase().includes(q) ||
      item.excerpt.toLowerCase().includes(q) ||
      item.tags.some((t) => t.toLowerCase().includes(q)),
  );
}
