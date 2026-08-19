import { MotionConfig } from 'framer-motion';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useSnapshotData } from '../../api/SnapshotProvider';

interface AtmosphereState {
  hex: string | null;
  bg: string | null;
  palette: string[];
  source: string | null;
}

const EMPTY: AtmosphereState = { hex: null, bg: null, palette: [], source: null };

const AtmosphereContext = createContext<AtmosphereState>(EMPTY);

export function useAtmosphere(): AtmosphereState {
  return useContext(AtmosphereContext);
}

// The wallpaper-as-light-source signal, read once here and fanned out two
// ways: this context (consumed by AtmosphereBackground, and later Scene's
// hero/palette so they key off the exact same accent object rather than
// each polling snapshot.accent independently) and the global --accent CSS
// custom property, which is what every existing var(--accent) usage across
// the app (Card rims, focus rings, PanelGrid's resize ghost, ...) already
// reads - setting it here is what makes the whole app react to the
// wallpaper, not just Scene.
export function AtmosphereProvider({ children }: { children: ReactNode }) {
  const { snapshot } = useSnapshotData();
  const accent = snapshot?.accent;
  const theme = snapshot?.ui?.profile?.theme;
  const reducedMotion = snapshot?.ui?.prefs?.reduced_motion;
  const materialStyle = snapshot?.ui?.prefs?.material_style ?? 'liquid_glass';

  const value = useMemo<AtmosphereState>(
    () => ({
      hex: accent?.hex ?? null,
      bg: accent?.bg ?? null,
      palette: accent?.palette ?? [],
      source: accent?.source ?? null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accent?.hex, accent?.bg, accent?.source, accent?.palette?.join(',')],
  );

  useEffect(() => {
    if (value.hex) document.documentElement.style.setProperty('--accent', value.hex);
  }, [value.hex]);

  // Settings > Appearance > Theme - the only place `data-theme` gets set.
  // No attribute at all (rather than an explicit "dark") when the
  // preference is dark/unset, matching colors.css's own dark-first
  // :root - light mode is the one that needs an override, not dark.
  useEffect(() => {
    if (theme === 'light') document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
  }, [theme]);

  // Material is a product-wide preference, not an application skin. The
  // attribute lives beside the theme/accent signals so persistent chrome,
  // app surfaces and portal-based popovers all change in the same frame.
  useEffect(() => {
    document.documentElement.dataset.material = materialStyle === 'blur_cyberpunk' ? 'blur' : 'liquid';
  }, [materialStyle]);

  return (
    <AtmosphereContext.Provider value={value}>
      {/* 'user' (not 'never') when the app-level toggle is off, so the
          OS's own prefers-reduced-motion still applies on its own -
          Settings > Motion is an explicit reinforcement of that
          preference, not the only way to ever get it. */}
      <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>{children}</MotionConfig>
    </AtmosphereContext.Provider>
  );
}
