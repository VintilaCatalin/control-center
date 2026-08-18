// Plex-local glyph set - same minimal line-icon language as
// shell/icons.tsx (24 viewBox, currentColor stroke, ~1.7 width) but
// scoped here since these are only ever used inside the Plex surface
// (section-type badges, play/resume controls), not the global nav rail.

export function PlayIcon({ filled = true }: { filled?: boolean }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 4.5v15l13-7.5-13-7.5z" />
    </svg>
  );
}

export function InfoIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v6M12 7.5v.01" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function HomeIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 11.5L12 4l8 7.5" />
      <path d="M6 10v9.5h12V10" />
    </svg>
  );
}

export function MovieIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M8 5v14M16 5v14M3 9.5h5M16 9.5h5M3 14.5h5M16 14.5h5" />
    </svg>
  );
}

export function TvIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12.5" rx="2" />
      <path d="M8 21.5h8M9 3l3 3 3-3" />
    </svg>
  );
}

export function MusicIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18V5.5L20 3v12.5" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="15.5" r="3" />
    </svg>
  );
}

export function PhotoIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M3.5 17.5l5.5-6 4 4.2 2.5-2.7 5 4.5" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.8-4.8" />
    </svg>
  );
}

export function LibraryIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4.5v15l4-2 4 2 4-2 4 2v-15" />
      <path d="M8 8.5h8" />
    </svg>
  );
}

export function iconForSectionType(type: string) {
  switch (type) {
    case 'movie':
      return MovieIcon;
    case 'show':
      return TvIcon;
    case 'artist':
    case 'album':
    case 'track':
      return MusicIcon;
    case 'photo':
      return PhotoIcon;
    default:
      return LibraryIcon;
  }
}
