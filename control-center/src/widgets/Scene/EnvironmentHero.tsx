import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import {
  setBrightness,
  setLightsColor,
  setLightsMode,
  setSaturation,
  wallImageUrl,
  type LightsMode,
} from '../../api/actions/scene';
import { useSnapshotData } from '../../api/SnapshotProvider';
import { useAtmosphere } from '../../primitives/Atmosphere/AtmosphereContext';
import { duration, ease } from '../../tokens/motion';
import styles from './EnvironmentHero.module.css';

const FALLBACK_ACCENT = '#8f97a8';

const MODES: { id: LightsMode; label: string }[] = [
  { id: 'white', label: 'White' },
  { id: 'bias', label: 'Bias' },
  { id: 'video', label: 'Video' },
  { id: 'game', label: 'Game' },
  { id: 'off', label: 'Off' },
];

// The Hero is the environment-control surface, not just a picture with a
// palette legend: the gradient strip IS the Colorful action (no separate
// button duplicating it), individual swatches send their own colour
// directly, White/Bias/Video/Game/Off sit as compact manual overrides,
// and brightness/saturation apply live as you drag - all reading and
// acting on the exact same accent/lights data the rest of Scene shows,
// so nothing here is a second source of truth.
export function EnvironmentHero() {
  const { hex, palette, source } = useAtmosphere();
  const { snapshot } = useSnapshotData();
  const reduceMotion = useReducedMotion();

  const [brightness, setBrightnessValue] = useState(100);
  const [saturation, setSaturationValue] = useState(100);
  const [pendingMode, setPendingMode] = useState<LightsMode | null>(null);
  // Tracks whether Colorful is the active mode, purely so a brightness/
  // saturation drag knows whether to preserve it: Colorful paints each
  // segmented light a different colour off the wallpaper's gradient, so
  // nudging brightness/saturation while it's active has to re-run that
  // same gradient (see setBrightness/setSaturation's `mode` param) rather
  // than patch every entity to one flat colour, which would collapse the
  // multi-colour look to a single hue. Every other mode/swatch is already
  // flat, so the direct patch is correct there.
  const [isColorful, setIsColorful] = useState(true);
  const brightnessDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saturationDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(brightnessDebounce.current);
      clearTimeout(saturationDebounce.current);
    },
    [],
  );

  const lights = snapshot?.lights?.lights ?? [];
  const onLights = lights.filter((l) => l.on);

  const accent = hex ?? FALLBACK_ACCENT;
  const heroImage = source ? wallImageUrl(source, 1600, 900) : null;
  const key = source ?? 'none';

  async function handleMode(mode: LightsMode) {
    setIsColorful(false);
    setPendingMode(mode);
    try {
      await setLightsMode(mode);
    } finally {
      setPendingMode(null);
    }
  }

  async function handleColorful() {
    setIsColorful(true);
    setPendingMode('colorful');
    try {
      await setLightsMode('colorful');
    } finally {
      setPendingMode(null);
    }
  }

  function handleSwatch(hex: string) {
    setIsColorful(false);
    setLightsColor(hex);
  }

  function handleBrightnessInput(value: number) {
    setBrightnessValue(value);
    clearTimeout(brightnessDebounce.current);
    brightnessDebounce.current = setTimeout(() => setBrightness(value, isColorful ? 'colorful' : undefined), 350);
  }

  function handleSaturationInput(value: number) {
    setSaturationValue(value);
    clearTimeout(saturationDebounce.current);
    saturationDebounce.current = setTimeout(() => setSaturation(value, isColorful ? 'colorful' : undefined), 350);
  }

  return (
    <div className={styles.hero}>
      <AnimatePresence>
        {heroImage && (
          <motion.div
            key={key}
            className={styles.imageLayer}
            style={{ backgroundImage: `url("${heroImage}")` }}
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : duration.slow, ease }}
          />
        )}
      </AnimatePresence>

      <div
        className={styles.glow}
        style={{ background: `radial-gradient(60% 60% at 85% 15%, color-mix(in oklab, ${accent} 38%, transparent), transparent 70%)` }}
      />
      <div className={styles.shade} />

      <span className={styles.eyebrow}>Current Environment</span>

      <div className={styles.content}>
        <div className={styles.systemRow}>
          {palette.length > 0 && (
            <motion.button
              type="button"
              className={styles.paletteStrip}
              style={{ background: `linear-gradient(to right, ${palette.join(', ')})` }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: duration.fast, ease }}
              onClick={handleColorful}
              disabled={pendingMode !== null}
              title="Colourful - paint this palette across every light"
              aria-label="Colourful - paint this palette across every light"
            />
          )}
          {palette.length > 0 && (
            <div className={styles.swatches}>
              {palette.map((swatch) => (
                <motion.button
                  key={swatch}
                  type="button"
                  className={styles.swatch}
                  style={{ background: swatch }}
                  whileHover={{ scale: 1.18 }}
                  whileTap={{ scale: 0.88 }}
                  transition={{ duration: duration.fast, ease }}
                  onClick={() => handleSwatch(swatch)}
                  title={`Send ${swatch} to the lights`}
                  aria-label={`Send ${swatch} to the lights`}
                />
              ))}
            </div>
          )}

          <div
            className={styles.lightStatus}
            title={lights.length > 0 ? `${onLights.length} of ${lights.length} lights on` : 'No lights reporting'}
          >
            {lights.length === 0 ? (
              <span className={styles.lightStatusEmpty}>No lights reporting</span>
            ) : (
              lights.map((l) => (
                <span
                  key={l.entity}
                  className={styles.lightPip}
                  data-on={l.on ? '' : undefined}
                  style={l.on && l.hex ? { background: l.hex, boxShadow: `0 0 7px ${l.hex}` } : undefined}
                  title={`${l.name} - ${l.on ? 'on' : 'off'}`}
                />
              ))
            )}
          </div>
        </div>

        <div className={styles.controlsRow}>
          <div className={styles.modes}>
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={styles.modeBtn}
                onClick={() => handleMode(m.id)}
                disabled={pendingMode !== null}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className={styles.sliders}>
            <label className={styles.sliderGroup}>
              <span className={styles.sliderLabel}>Bright</span>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={brightness}
                className={styles.slider}
                onChange={(e) => handleBrightnessInput(Number(e.target.value))}
              />
              <output className={styles.sliderValue}>{brightness}%</output>
            </label>
            <label className={styles.sliderGroup}>
              <span className={styles.sliderLabel}>Sat</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={saturation}
                className={styles.slider}
                onChange={(e) => handleSaturationInput(Number(e.target.value))}
              />
              <output className={styles.sliderValue}>{saturation}%</output>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
