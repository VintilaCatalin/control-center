// Reading-local glyphs, same minimal line-icon language as shell/icons.tsx
// (24 viewBox, currentColor stroke, ~1.7 width) - not reused from Plex's
// icon set since Reading is deliberately a different product surface.

export function SparkleIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8-1.8 5.2-1.8-5.2-5.2-1.8 5.2-1.8z" />
      <path d="M19 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </svg>
  );
}

export function TagIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 12.5V5.5A2 2 0 0 1 5.5 3.5h7l8 8a2 2 0 0 1 0 2.8l-6.7 6.7a2 2 0 0 1-2.8 0l-8-8z" />
      <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PlayGlyphIcon() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9.5 8.2v7.6l6.2-3.8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4-6.5 4V4.5a1 1 0 0 1 1-1z" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
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

export function BookIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H12v18H5.5A1.5 1.5 0 0 1 4 19.5z" />
      <path d="M20 4.5A1.5 1.5 0 0 0 18.5 3H12v18h6.5a1.5 1.5 0 0 0 1.5-1.5z" />
    </svg>
  );
}

export function FolderScanIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 4.5h3.2l1.1 1.2H13.5v6.8H2.5V4.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 8.2a1.8 1.8 0 1 1-2.55 2.55"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M10.6 11.2 9.4 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7M18.5 7l-.7 12.3a1.6 1.6 0 0 1-1.6 1.5H7.8a1.6 1.6 0 0 1-1.6-1.5L5.5 7" />
    </svg>
  );
}

export function LinkIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.5 14.5l5-5" />
      <path d="M12 6.5l1-1a3.5 3.5 0 0 1 5 5l-1 1" />
      <path d="M12 17.5l-1 1a3.5 3.5 0 0 1-5-5l1-1" />
    </svg>
  );
}

export function ExternalLinkIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6H6.5A2.5 2.5 0 0 0 4 8.5v9A2.5 2.5 0 0 0 6.5 20h9a2.5 2.5 0 0 0 2.5-2.5V15" />
      <path d="M14 4h6v6" />
      <path d="M20 4l-9.5 9.5" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16.5 3.5l4 4L7 21l-5 1 1-5z" />
    </svg>
  );
}

export function DismissIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ShuffleIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h3.5l8 12H21M3 18h3.5l3-4.5M14.5 6H21M18 3l3 3-3 3M18 15l3 3-3 3" />
    </svg>
  );
}

export function PinIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.5c-2.8 0-5 2.2-5 5 0 3.5 5 11 5 11s5-7.5 5-11c0-2.8-2.2-5-5-5z" />
      <circle cx="12" cy="7.5" r="1.8" />
    </svg>
  );
}

export function ImageOffIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l5-5 4 4 3-3 4 4" />
    </svg>
  );
}
