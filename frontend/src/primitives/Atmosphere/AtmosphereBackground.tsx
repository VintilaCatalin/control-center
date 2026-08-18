import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useSnapshotData } from '../../api/SnapshotProvider';
import { duration, ease } from '../../tokens/motion';
import { useAtmosphere } from './AtmosphereContext';
import styles from './AtmosphereBackground.module.css';

const FALLBACK_ACCENT = '#8f97a8';

// A restrained radial wash, not a full accent-coloured overlay - two soft
// pools (top and bottom) so the effect reads as ambient light in the room,
// not a colour filter over the UI. Computed per-layer from a captured hex
// rather than the live --accent custom property, so the crossfade below
// is a plain opacity animation between two fully-formed layers (old
// image+wash, new image+wash) instead of trying to interpolate the
// gradient's own colour - simpler and doesn't depend on @property support.
function washImage(hex: string) {
  return [
    `radial-gradient(115% 65% at 50% -8%, color-mix(in oklab, ${hex} 16%, transparent), transparent 60%)`,
    `radial-gradient(95% 55% at 50% 110%, color-mix(in oklab, ${hex} 11%, transparent), transparent 60%)`,
  ].join(', ');
}

// Mounted once at the app root (see App.tsx), behind everything - this is
// the "wallpaper as light source" layer, not a Scene-only visual. Keyed by
// `source` (the wallpaper's file path) so a wallpaper change crossfades
// the whole environment - image and wash together, as one layer - rather
// than swapping a background-image mid-frame.
//
// Settings > Appearance > App background can override this entirely - a
// flat colour or a custom picture instead of the wallpaper-driven wash.
// Only the visual layer changes; --accent/palette (Scene, Card rims,
// focus rings, ...) stay wallpaper-derived either way, since overriding
// what's visually behind the UI isn't the same claim as "recolour the
// whole app's accent."
export function AtmosphereBackground() {
  const { bg, hex, source } = useAtmosphere();
  const { snapshot } = useSnapshotData();
  const reduceMotion = useReducedMotion();
  const accent = hex ?? FALLBACK_ACCENT;

  const mode = snapshot?.ui?.prefs?.background_mode ?? 'wallpaper';

  if (mode === 'color') {
    const color = snapshot?.ui?.prefs?.background_color || '#0b0d12';
    return (
      <div className={styles.host} aria-hidden="true">
        <div className={styles.layer} style={{ opacity: 1 }}>
          <div className={styles.image} style={{ backgroundImage: 'none', backgroundColor: color }} />
        </div>
      </div>
    );
  }

  if (mode === 'image' && snapshot?.ui?.prefs?.background_image) {
    const image = snapshot.ui.prefs.background_image;
    return (
      <div className={styles.host} aria-hidden="true">
        <div className={styles.layer} style={{ opacity: 0.7 }}>
          <div className={styles.image} style={{ backgroundImage: `url("${image}")` }} />
          <div className={styles.wash} style={{ backgroundImage: washImage(accent) }} />
        </div>
      </div>
    );
  }

  const key = source ?? bg ?? 'none';

  return (
    <div className={styles.host} aria-hidden="true">
      <AnimatePresence>
        {bg && (
          <motion.div
            key={key}
            className={styles.layer}
            initial={{ opacity: 0 }}
            // Capped well under fully opaque - the server already
            // darkens/blurs the source image, this is a second,
            // independent restraint so no wallpaper (however bright) can
            // compete with foreground text.
            animate={{ opacity: 0.55 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : duration.lazy, ease }}
          >
            <div className={styles.image} style={{ backgroundImage: `url("${bg}")` }} />
            <div className={styles.wash} style={{ backgroundImage: washImage(accent) }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
