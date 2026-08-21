import type { LibraryCollection, LibraryItem } from '../../api/types';

export type LibrarySection = 'recent' | 'unsorted' | 'favorites' | string;

export type LibraryViewMode = 'cards' | 'list' | 'headlines' | 'moodboard';
export type LibraryCoverSize = 's' | 'm' | 'l';

export interface LibraryShowFlags {
  cover: boolean;
  title: boolean;
  excerpt: boolean;
  tags: boolean;
  date: boolean;
}

export interface LibraryViewPrefs {
  mode: LibraryViewMode;
  coverSize: LibraryCoverSize;
  show: LibraryShowFlags;
}

const VIEW_STORAGE_KEY = 'control-center.library.view.v2';
const VIEW_STORAGE_KEY_LEGACY = 'control-center.library.view.v1';

export const DEFAULT_VIEW_PREFS: LibraryViewPrefs = {
  mode: 'cards',
  coverSize: 'm',
  show: { cover: true, title: true, excerpt: true, tags: true, date: true },
};

function normalizePrefs(parsed: Partial<LibraryViewPrefs> | null | undefined): LibraryViewPrefs {
  if (!parsed) return DEFAULT_VIEW_PREFS;
  return {
    mode: parsed.mode && ['cards', 'list', 'headlines', 'moodboard'].includes(parsed.mode)
      ? parsed.mode
      : DEFAULT_VIEW_PREFS.mode,
    coverSize: parsed.coverSize && ['s', 'm', 'l'].includes(parsed.coverSize)
      ? parsed.coverSize
      : DEFAULT_VIEW_PREFS.coverSize,
    show: { ...DEFAULT_VIEW_PREFS.show, ...(parsed.show ?? {}) },
  };
}

function readViewStore(): Record<string, LibraryViewPrefs> {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { bySection?: Record<string, Partial<LibraryViewPrefs>> };
      const out: Record<string, LibraryViewPrefs> = {};
      for (const [key, value] of Object.entries(parsed.bySection ?? {})) {
        out[key] = normalizePrefs(value);
      }
      return out;
    }
    // One-shot migrate: old global prefs become the default for every
    // section until that section gets its own override.
    const legacy = localStorage.getItem(VIEW_STORAGE_KEY_LEGACY);
    if (legacy) {
      const prefs = normalizePrefs(JSON.parse(legacy) as Partial<LibraryViewPrefs>);
      return { '*': prefs };
    }
  } catch {
    /* ignore */
  }
  return {};
}

function writeViewStore(store: Record<string, LibraryViewPrefs>) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ bySection: store }));
  } catch {
    /* ignore quota */
  }
}

export function loadViewPrefs(section: string): LibraryViewPrefs {
  const store = readViewStore();
  return store[section] ?? store['*'] ?? DEFAULT_VIEW_PREFS;
}

export function saveViewPrefs(section: string, prefs: LibraryViewPrefs) {
  const store = readViewStore();
  store[section] = normalizePrefs(prefs);
  writeViewStore(store);
}

export function formatSavedDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
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

export function faviconUrl(domain: string, size = 128): string | null {
  const host = domain.trim();
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}

// Raindrop stores signed Instagram CDN URLs that expire (often 403 within
// hours). The public /p/{code}/media/?size=l redirect still returns a
// fresh JPEG for posts and reels - prefer that over the stale cover.
export function instagramMediaUrl(pageUrl: string): string | null {
  const m = pageUrl.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  if (!m) return null;
  return `https://www.instagram.com/p/${m[1]}/media/?size=l`;
}

export function isInstagramItem(item: Pick<LibraryItem, 'url' | 'domain'>): boolean {
  return /instagram\.com/i.test(item.domain) || /instagram\.com/i.test(item.url);
}

// Same hotlink-safe proxy Reading uses.
export function libraryCoverUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('/api/')) return url;
  if (url.includes('google.com/s2/favicons')) return url;
  return `/api/reading/thumb?url=${encodeURIComponent(url)}`;
}

export function resolveCoverUrl(item: LibraryItem): string | null {
  const ig = instagramMediaUrl(item.url);
  if (ig) return libraryCoverUrl(ig) ?? ig;

  const cover = item.cover?.trim();
  if (cover) return libraryCoverUrl(cover) ?? cover;
  return faviconUrl(item.domain);
}

/** Ordered fallbacks after the primary cover fails to load. */
export function coverFallbacks(item: LibraryItem, failedSrc: string | null): string[] {
  const out: string[] = [];
  const push = (url: string | null | undefined) => {
    if (!url || url === failedSrc || out.includes(url)) return;
    out.push(url);
  };

  const ig = instagramMediaUrl(item.url);
  if (ig) push(libraryCoverUrl(ig) ?? ig);

  const cover = item.cover?.trim();
  if (cover) push(libraryCoverUrl(cover) ?? cover);

  // Instagram favicons blow up into that ugly logo tile - skip them and
  // let the card hide the media slot instead.
  if (!isInstagramItem(item)) push(faviconUrl(item.domain));
  return out;
}

export function buildCollectionTree(collections: LibraryCollection[]) {
  // Preserve the order the backend already applied (library_collection_order).
  const roots = collections.filter((c) => !c.parentId);
  const byParent = new Map<string, LibraryCollection[]>();
  for (const c of collections) {
    if (!c.parentId) continue;
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }
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

export async function libraryArticleCacheId(url: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(url));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

export function coverSizeToDensity(size: LibraryCoverSize): 'compact' | 'comfortable' | 'large' {
  if (size === 's') return 'compact';
  if (size === 'l') return 'large';
  return 'comfortable';
}
