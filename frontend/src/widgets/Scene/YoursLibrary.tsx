import { useEffect, useRef, useState } from 'react';
import { applyLocalWallpaper, favoriteWallpaper, fixDesktopWallpapers, matchLightsToWallpaper, wallImageUrl } from '../../api/actions/scene';
import { useSnapshotData } from '../../api/SnapshotProvider';
import { FolderSetup } from '../../primitives/FolderSetup/FolderSetup';
import { Menu, type MenuItem } from '../../primitives/Menu/Menu';
import { useMenu } from '../../primitives/Menu/useMenu';
import { Sheet } from '../../primitives/Sheet/Sheet';
import { Skeleton } from '../../primitives/Skeleton/Skeleton';
import { WallpaperTile } from './WallpaperTile';
import styles from './WallpaperLibrary.module.css';

function DotsIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

// The panel's own header already supplies the "Yours" label - this is the
// small self-contained overflow control in its headerAction slot (same
// pattern as Launchpad's LaunchpadHeaderActions), independent of the tile
// grid below. Fix Desktop Wallpapers lives here specifically because it's
// a local-desktop-state recovery action, not a Wallhaven concern.
export function YoursLibraryHeaderActions() {
  const overflowMenu = useMenu();
  const [fixOpen, setFixOpen] = useState(false);
  const [fixBusy, setFixBusy] = useState(false);
  const [fixResult, setFixResult] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  async function handleFixDesktops() {
    setFixBusy(true);
    setFixResult(null);
    try {
      const r = await fixDesktopWallpapers();
      if (r.ok) {
        setFixResult('Explorer is restarting - your taskbar will flash briefly.');
        // A real fix, not just an error message shown until dismissed -
        // close itself once the user's had a moment to read it, same as
        // Explorer restarting is itself a self-resolving event.
        closeTimer.current = setTimeout(() => {
          setFixOpen(false);
          setFixResult(null);
        }, 2200);
      } else {
        setFixResult(r.error ?? "Couldn't run the fix.");
      }
    } catch {
      setFixResult("Couldn't reach the panel backend.");
    } finally {
      setFixBusy(false);
    }
  }

  const overflowItems: MenuItem[] = [{ label: 'Fix desktop wallpapers…', onClick: () => setFixOpen(true) }];

  return (
    <>
      <button
        type="button"
        className={styles.overflowBtn}
        onClick={overflowMenu.openAt}
        aria-label="Wallpaper options"
        title="Wallpaper options"
      >
        <DotsIcon />
      </button>
      <Menu open={overflowMenu.open} x={overflowMenu.x} y={overflowMenu.y} items={overflowItems} onClose={overflowMenu.close} />
      <Sheet
        open={fixOpen}
        onClose={() => {
          clearTimeout(closeTimer.current);
          setFixOpen(false);
          setFixResult(null);
        }}
        title="Fix desktop wallpapers?"
        subtitle="For the rare case where Windows shows different wallpapers across virtual desktops. This restarts Explorer - your taskbar and desktop icons will disappear for a second."
        actions={
          <>
            <button type="button" className={styles.sheetBtn} onClick={() => { clearTimeout(closeTimer.current); setFixOpen(false); }} disabled={fixBusy}>
              Cancel
            </button>
            <button type="button" className={`${styles.sheetBtn} ${styles.sheetBtnDanger}`} onClick={handleFixDesktops} disabled={fixBusy}>
              {fixBusy ? 'Restarting Explorer…' : 'Fix desktop wallpapers'}
            </button>
          </>
        }
      >
        {fixResult && <p className={styles.fixResult}>{fixResult}</p>}
      </Sheet>
    </>
  );
}

export function YoursLibrary() {
  const { snapshot, loading } = useSnapshotData();
  const [applyingPath, setApplyingPath] = useState<string | null>(null);

  const walls = snapshot?.wallpapers?.walls ?? [];
  const configured = snapshot?.wallpapers?.configured;
  const wallsError = snapshot?.wallpapers?.error;

  async function handleApply(path: string, matchLights: boolean) {
    setApplyingPath(path);
    try {
      await applyLocalWallpaper(path);
      if (matchLights) matchLightsToWallpaper();
    } finally {
      setApplyingPath(null);
    }
  }

  if (!snapshot && loading) return <SkeletonGrid />;
  if (configured === false)
    return (
      <FolderSetup
        settingKey="wallpaper_dir"
        title="Choose your wallpaper folder"
        description="Pick a folder of images to browse, favorite and apply as your desktop background."
      />
    );
  if (wallsError) return <div className={styles.message}>{wallsError}</div>;
  if (walls.length === 0) return <div className={styles.message}>No wallpapers found in this folder.</div>;

  return (
    <div className={styles.grid}>
      {walls.map((w) => (
        <WallpaperTile
          key={w.path}
          thumbUrl={wallImageUrl(w.path, 420, 236)}
          name={w.name}
          current={w.current}
          favorite={w.favorite}
          onToggleFavorite={() => favoriteWallpaper(w.path, !w.favorite)}
          applying={applyingPath === w.path}
          onApply={() => handleApply(w.path, false)}
          onApplyMatchLights={() => handleApply(w.path, true)}
        />
      ))}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className={styles.grid} aria-busy="true" aria-label="Loading wallpapers">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} width="100%" className={styles.skeletonTile} radius={16} />
      ))}
    </div>
  );
}
