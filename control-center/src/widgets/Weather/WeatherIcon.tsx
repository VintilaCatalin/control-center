// The old app never rendered the `icon` field the backend already sends
// (server.py:341, WEATHER_CODES) - renderWeather() only used label/temp/
// days (index.html:4563-4575). Small minimal line glyphs, not emoji, to
// stay in the app's existing frosted/restrained visual language.
const PATHS: Record<string, string> = {
  clear: 'M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
  cloud: 'M7 18a4 4 0 0 1-.6-7.96A5 5 0 0 1 16.2 9 3.5 3.5 0 0 1 16 16.5v.05',
  fog: 'M4 15h16M6 18h12M4 12h11M8 9a4 4 0 0 1 7.4-2',
  rain: 'M7 16a4 4 0 0 1-.6-7.96A5 5 0 0 1 16.2 7 3.5 3.5 0 0 1 16 14.5M8 18l-1 2M12 18l-1 2M16 18l-1 2',
  snow: 'M7 16a4 4 0 0 1-.6-7.96A5 5 0 0 1 16.2 7 3.5 3.5 0 0 1 16 14.5M9 18v3M9 18.5l2.6 1.5M9 18.5l-2.6 1.5M15 18v3M15 18.5l2.6 1.5M15 18.5l-2.6 1.5',
  storm: 'M7 15a4 4 0 0 1-.6-7.96A5 5 0 0 1 16.2 6 3.5 3.5 0 0 1 16 13.5M13 14l-3 5h3l-2 4',
};

export function WeatherIcon({ icon, size = 16 }: { icon: string; size?: number }) {
  const d = PATHS[icon] ?? PATHS.cloud;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
