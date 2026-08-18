// A small fixed icon set topics can be tagged with (backend/core.py's
// DEFAULT_READING_TOPICS picks sensible defaults for the original 9; a
// custom topic starts on "tag" and can be changed via the sidebar's
// right-click menu, see ReadingSidebarNav). The backend never validates
// which of these ids exist - it just stores whatever string this file's
// own picker sends, so adding a new glyph here is the only step needed.
import type { ReactNode } from 'react';

interface Glyph {
  d: string;
  extra?: ReactNode;
}

const GLYPHS: Record<string, Glyph> = {
  tag: { d: 'M20.6 12.6 12.6 20.6a2 2 0 0 1-2.83 0l-6.37-6.37a2 2 0 0 1 0-2.83l8-8A2 2 0 0 1 12.83 3H19a1 1 0 0 1 1 1v6.17a2 2 0 0 1-.4 1.43Z', extra: <circle cx="16" cy="8" r="1.4" fill="currentColor" stroke="none" /> },
  chip: { d: 'M8 3v3M12 3v3M16 3v3M8 18v3M12 18v3M16 18v3M3 8h3M3 12h3M3 16h3M18 8h3M18 12h3M18 16h3M7 7h10v10H7Z' },
  sparkle: { d: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z' },
  palette: {
    d: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.7 1.6-1.5 0-.4-.2-.7-.4-1-.3-.3-.4-.6-.4-1 0-.8.6-1.4 1.4-1.4H16a4 4 0 0 0 4-4c0-5-3.6-9-8-9Z',
    extra: (
      <>
        <circle cx="7.5" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="10.5" cy="7" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
      </>
    ),
  },
  globe: { d: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3.5 9h17M3.5 15h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18' },
  plane: { d: 'M10.5 20.5 12 15l-6-1 1.2-2 6.4.7L17 6.5a1.6 1.6 0 0 1 2.8 1.5l-3.8 6.7.8 6.3-2-1-1.3 1.8-1-3.3-2-.5Z' },
  controller: { d: 'M7 9h10a4 4 0 0 1 4 4.2 3 3 0 0 1-5.3 2L14 13.5h-4L8.3 15.2A3 3 0 0 1 3 13.2 4 4 0 0 1 7 9ZM8.5 11.5v2M7.5 12.5h2M16 12h.01M18 14h.01' },
  star: { d: 'm12 3 2.6 5.9 6.4.6-4.8 4.3 1.4 6.2L12 16.9l-5.6 3.1 1.4-6.2-4.8-4.3 6.4-.6L12 3Z' },
  play: { d: 'M8 5.5v13l11-6.5-11-6.5Z' },
  trophy: { d: 'M8 4h8v4a4 4 0 0 1-8 0V4ZM5 5H3.5A1.5 1.5 0 0 0 2 6.5C2 9 4 10.5 5 10.5M19 5h1.5A1.5 1.5 0 0 1 22 6.5c0 2.5-2 4-3 4M12 12v3M9 20h6M12 15c-1.7 0-2.5 1-2.5 2v3h5v-3c0-1-.8-2-2.5-2Z' },
  film: { d: 'M4 4h16v16H4V4Z', extra: <path d="M4 8h16M4 16h16M9 4v4M9 16v4M15 4v4M15 16v4" /> },
  music: { d: 'M9 18a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5ZM18 16a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5ZM11.5 15.5V6L20.5 4v9.5' },
  heart: { d: 'M12 20.5s-7.5-4.6-9.7-9A5.3 5.3 0 0 1 12 6a5.3 5.3 0 0 1 9.7 5.5c-2.2 4.4-9.7 9-9.7 9Z' },
  book: { d: 'M4 5.5C4 4.7 4.7 4 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5v-13ZM20 5.5c0-.8-.7-1.5-1.5-1.5H12v16h6.5a1.5 1.5 0 0 0 1.5-1.5v-13Z' },
  folder: { d: 'M3 6.5a1.5 1.5 0 0 1 1.5-1.5h4.13a1.5 1.5 0 0 1 1.2.6l1.14 1.5a1.5 1.5 0 0 0 1.2.6H19.5A1.5 1.5 0 0 1 21 9.2V17a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17V6.5Z' },
};

export const TOPIC_ICON_IDS = Object.keys(GLYPHS);

export function TopicIcon({ icon, size = 15 }: { icon?: string; size?: number }) {
  const glyph = (icon && GLYPHS[icon]) || GLYPHS.tag;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={glyph.d} />
      {glyph.extra}
    </svg>
  );
}
