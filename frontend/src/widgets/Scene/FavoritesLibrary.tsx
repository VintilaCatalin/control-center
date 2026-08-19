import { useCallback, useMemo, useState } from 'react';
import { applyLocalWallpaper, favoriteWallpaper, matchLightsToWallpaper, wallImageUrl } from '../../api/actions/scene';
import { useSnapshotData } from '../../api/SnapshotProvider';
import type { WallpaperEntry } from '../../api/types';
import { WallpaperTile } from './WallpaperTile';
import styles from './WallpaperLibrary.module.css';

const NO_FAVORITES: WallpaperEntry[] = [];

// A pinboard, not a third copy of the library - reads the same
// `wallpapers.favorites` list Yours' star buttons write to
// (server.py's wallpaper_favorites store key), so favoriting/unfavoriting
// from either place stays in sync through the normal snapshot poll.
export function FavoritesLibrary() {
  const { snapshot } = useSnapshotData();
  const [applyingPath, setApplyingPath] = useState<string | null>(null);

  const favorites = snapshot?.wallpapers?.favorites ?? NO_FAVORITES;

  const handleApply = useCallback(async (path: string, matchLights: boolean) => {
    setApplyingPath(path);
    try {
      await applyLocalWallpaper(path);
      if (matchLights) matchLightsToWallpaper();
    } finally {
      setApplyingPath(null);
    }
  }, []);

  const tiles = useMemo(
    () =>
      favorites.map((w) => (
        <WallpaperTile
          key={w.path}
          thumbUrl={wallImageUrl(w.path, 420, 236)}
          name={w.name}
          current={w.current}
          favorite
          onToggleFavorite={() => favoriteWallpaper(w.path, false)}
          applying={applyingPath === w.path}
          onApply={() => handleApply(w.path, false)}
          onApplyMatchLights={() => handleApply(w.path, true)}
        />
      )),
    [applyingPath, favorites, handleApply],
  );

  if (favorites.length === 0) {
    return <div className={styles.message}>No favorites yet - star a wallpaper in Yours to pin it here.</div>;
  }

  return (
    <div className={styles.grid}>
      {tiles}
    </div>
  );
}
