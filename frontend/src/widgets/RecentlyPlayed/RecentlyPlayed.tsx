import { useSnapshotData } from '../../api/SnapshotProvider';
import { GameTile } from '../Games/GameTile';
import styles from './RecentlyPlayed.module.css';

// A permanent panel slot now, not data-driven visibility - see the same
// note on FavoritesStrip/PlaytimeList. Hiding/showing this panel is the
// user's call via the panel toolbar, not something the widget decides for
// itself by vanishing out from under a layout they arranged.
export function RecentlyPlayed() {
  const { snapshot } = useSnapshotData();
  const recent = snapshot?.games?.recent ?? [];
  const shelves = snapshot?.games?.shelves ?? [];

  if (recent.length === 0) {
    return <div className={styles.empty}>Nothing played recently.</div>;
  }

  return (
    <div className={styles.row}>
      {recent.slice(0, 8).map((g) => (
        <div key={g.id} className={styles.item}>
          <GameTile game={g} shelves={shelves} />
        </div>
      ))}
    </div>
  );
}
