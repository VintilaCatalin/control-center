import { useAtmosphere } from '../../primitives/Atmosphere/AtmosphereContext';

interface MetricPalette {
  cpu: string;
  ram: string;
  network: [string, string];
  storage: [string, string];
  disks: string[];
}

function soften(color: string): string {
  return `color-mix(in oklab, ${color} 55%, white 30%)`;
}

// A wallpaper with real color variety (a landscape, a poster, anything
// with more than one dominant hue) gives CPU/RAM/Network/Storage each
// their own real color from it, instead of every metric being a tint of
// the same single --accent. A near-monochrome wallpaper still only ever
// yields one usable tone - that's not a bug to work around, it's exactly
// when falling back to --accent's own tonal variants (the trick every
// other tinted element in this app already uses) is the right call.
export function useMetricPalette(): MetricPalette {
  const { hex, palette } = useAtmosphere();
  const accent = hex ?? 'var(--accent)';

  if (palette.length >= 4) {
    const [c0, c1, c2, c3, c4, c5, c6] = palette;
    return {
      cpu: c0,
      ram: c1,
      network: [c2, c4 ?? soften(c2)],
      storage: [c3, c5 ?? soften(c3)],
      disks: [c3, c4 ?? soften(c3), c5 ?? c0, c6 ?? c1],
    };
  }

  return {
    cpu: accent,
    ram: accent,
    network: [accent, soften(accent)],
    storage: [accent, soften(accent)],
    disks: [
      accent,
      `color-mix(in oklab, ${accent} 70%, white 20%)`,
      `color-mix(in oklab, ${accent} 70%, black 20%)`,
      `color-mix(in oklab, ${accent} 45%, white 40%)`,
    ],
  };
}
