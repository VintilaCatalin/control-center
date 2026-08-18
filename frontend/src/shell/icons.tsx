// Minimal line glyphs matching the app's existing icon language (24
// viewBox, currentColor stroke, ~1.7 width - see PanelGrid's/GameTile's
// inline icons) rather than an icon font or emoji, so nav scales visually
// with more sections later without a dependency.

export function OverviewIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="3.5" width="8" height="8" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="5.5" rx="1.6" />
      <rect x="13.5" y="11" width="7" height="9.5" rx="1.6" />
      <rect x="3.5" y="13.5" width="8" height="7" rx="1.6" />
    </svg>
  );
}

export function GamesIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="7.5" width="19" height="11" rx="4" />
      <path d="M7 11v4M5 13h4" />
      <circle cx="16" cy="11.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="14" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SceneIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M3.5 17.5l5.5-6 4 4.2 2.5-2.7 5 4.5" />
    </svg>
  );
}

// The page-level Panels visibility control (Overview/Games/Scene) - same
// glyph PanelGrid's own floating toolbar button used to use, now surfaced
// as a control row inside the active application's own sidebar (see
// AppSidebar) rather than floating over the grid or living in a global
// header.
export function GridIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function NotesIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 2H16l4 4v14.5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 5 20.5v-17A1.5 1.5 0 0 1 6.5 2z" />
      <path d="M15 2v5h5" />
      <path d="M8 12h8M8 16h5" />
    </svg>
  );
}

export function PlexIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9.5 8.2v7.6l6.2-3.8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TasksIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11l2 2 4-4" />
      <rect x="3" y="4" width="18" height="16" rx="3" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

// The one back-navigation glyph the whole app mode uses - "Back to Main
// Menu" is a level change (an application closing), never confused with
// browser-style history navigation, so it gets its own deliberate arrow
// rather than reusing ChevronIcon rotated.
export function BackIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function ReadingIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 6.5c-1.6-1.3-3.6-2-6-2v13c2.4 0 4.4.7 6 2 1.6-1.3 3.6-2 6-2v-13c-2.4 0-4.4.7-6 2z" />
      <path d="M12 6.5v13" />
    </svg>
  );
}

export function HomelabIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="3.5" width="16" height="6" rx="1.6" />
      <rect x="4" y="14.5" width="16" height="6" rx="1.6" />
      <circle cx="7.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="7.5" cy="17.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ChevronIcon() {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// The shell's own mark, not a literal wordmark - three concentric arcs
// reading as "control"/dials, tinted to the live wallpaper accent
// wherever it's used (see Header's brand button) so it never looks
// static against a changing atmosphere.
export function BrandMark() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" opacity="0.3" />
      <path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5" />
      <circle cx="12" cy="12" r="2.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LockIcon({ locked = true }: { locked?: boolean }) {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.5" y="11" width="15" height="10" rx="2.2" />
      {locked ? <path d="M8 11V7a4 4 0 0 1 8 0v4" /> : <path d="M8 11V7a4 4 0 0 1 7-2.6" />}
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l1.9-1.5-2-3.4-2.3.7a7.7 7.7 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.3a7.7 7.7 0 0 0-2.6 1.5l-2.3-.7-2 3.4L4.6 10.5a7.7 7.7 0 0 0 0 3l-1.9 1.5 2 3.4 2.3-.7a7.7 7.7 0 0 0 2.6 1.5l.4 2.3h4l.4-2.3a7.7 7.7 0 0 0 2.6-1.5l2.3.7 2-3.4z" />
    </svg>
  );
}

export function SlidersIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h9M17 6h3M4 12h3M9 12h11M4 18h13M20 18h0" />
      <circle cx="13" cy="6" r="1.8" />
      <circle cx="7" cy="12" r="1.8" />
      <circle cx="17" cy="18" r="1.8" />
    </svg>
  );
}

export function PlugIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 3v4M15 3v4M7 7h10v3.5a5 5 0 0 1-10 0z" />
      <path d="M12 15.5V19M9 21h6" />
    </svg>
  );
}
