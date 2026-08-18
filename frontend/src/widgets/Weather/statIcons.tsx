// Small inline glyphs for weather stat chips (feels-like/humidity/wind) -
// shared between the sidebar's Weather popover and Overview's WeatherGlance
// so both read as the same design language, not two independent takes.
export function DropletIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3s6.5 7.1 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10.1 12 3 12 3Z" />
    </svg>
  );
}

export function WindIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8h11.5a2.75 2.75 0 1 0-2.6-3.7M3 12.5h14.5a2.75 2.75 0 1 1-2.6 3.7M3 17h9.5a2.25 2.25 0 1 1-2.1 3" />
    </svg>
  );
}

export function FeelsIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 14.76V4.5a2.5 2.5 0 0 0-5 0v10.26a4.5 4.5 0 1 0 5 0Z" strokeLinejoin="round" />
    </svg>
  );
}
