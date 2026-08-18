// Small filled/line SVGs for transport controls, consistent stroke
// language with WeatherIcon/MusicNoteIcon rather than the old app's
// Unicode glyphs (&#9198; etc).

export function PrevIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 5v14" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <path d="M18 5L8 12l10 7V5z" fill="currentColor" />
    </svg>
  );
}

export function NextIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M17 5v14" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <path d="M6 5l10 7-10 7V5z" fill="currentColor" />
    </svg>
  );
}

export function PlayIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 4.5v15l13-7.5-13-7.5z" fill="currentColor" />
    </svg>
  );
}

export function PauseIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="4.5" width="4.2" height="15" rx="1.2" fill="currentColor" />
      <rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2" fill="currentColor" />
    </svg>
  );
}
