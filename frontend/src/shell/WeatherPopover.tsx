import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useSnapshotData } from '../api/SnapshotProvider';
import { duration, ease } from '../tokens/motion';
import { Weather } from '../widgets/Weather/Weather';
import { WeatherIcon } from '../widgets/Weather/WeatherIcon';
import { useSidebarPopover } from './useSidebarPopover';
import styles from './WeatherPopover.module.css';

// The compact weather glance lives in the sidebar's utility strip now
// (see GlobalUtilities) - opens adjacent to that trigger via
// useSidebarPopover, not below a top-right header chip any more. Styled
// as the same full-width row every other utility uses (icon, label,
// trailing value) rather than its own pill shape, so the strip reads as
// one group instead of "three rows and one chip that doesn't match".
export function WeatherPopover({ collapsed = false }: { collapsed?: boolean }) {
  const { snapshot } = useSnapshotData();
  const weather = snapshot?.weather;
  const popover = useSidebarPopover<HTMLButtonElement>();

  if (!weather) return null;

  return (
    <>
      <button
        ref={popover.triggerRef}
        type="button"
        className={styles.trigger}
        data-collapsed={collapsed ? '' : undefined}
        onClick={popover.toggle}
        aria-haspopup="dialog"
        aria-expanded={popover.open}
        title="Weather details"
      >
        <span className={styles.iconSlot}>
          <WeatherIcon icon={weather.icon} size={15} />
        </span>
        <span className={styles.label}>Weather</span>
        <span className={styles.temp}>
          {weather.temp}°{weather.unit}
        </span>
      </button>
      {createPortal(
        <AnimatePresence>
          {popover.open && (
            <motion.div
              ref={popover.panelRef}
              className={styles.panel}
              style={{ left: popover.pos.left, top: popover.pos.top }}
              initial={{ opacity: 0, scale: 0.96, x: -6 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: duration.fast, ease }}
              role="dialog"
              aria-label="Weather details"
            >
              <Weather />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
