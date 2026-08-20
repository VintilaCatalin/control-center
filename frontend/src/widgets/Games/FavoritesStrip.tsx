import { launchTarget } from '../../api/actions/launch';
import type { GameData } from '../../api/types';
import { GameCover } from './GameCover';
import styles from './FavoritesStrip.module.css';

// A compact secondary strip now, not full-size GameTiles - Favorites is a
// quick-launch shortcut list, not where the analytics/content that
// actually needs visual priority should compete for space (see
// PlaytimeAnalytics). Small covers, name beside rather than overlaid,
// click-to-launch only - no drag/favorite/cog chrome here, this is a
// glance-and-launch row, not a management surface (GameTile in the real
// shelves already covers that).
export function FavoritesStrip({ games }: { games: GameData[] }) {
  if (games.length === 0) {
    return <div className={styles.empty}>No favorites yet - star a game to pin it here.</div>;
  }
  return (
    <div className={styles.row}>
      {games.map((g) => (
        <button
          type="button"
          key={g.id}
          className={styles.item}
          onClick={() => g.launch && launchTarget(g.launch)}
          disabled={!g.launch}
          title={g.name}
        >
          <span className={styles.cover}>
            <GameCover game={g} />
          </span>
          <span className={styles.copy}>
            <span className={styles.name}>{g.name}</span>
            <span className={styles.meta}>{sourceLabel(g.source)}</span>
          </span>
          <span className={styles.arrow} aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  );
}

function sourceLabel(source: GameData['source']): string {
  return source === 'battlenet' ? 'Battle.net' : source === 'xbox' ? 'Xbox' : source === 'riot' ? 'Riot' : source === 'steam' ? 'Steam' : 'Library';
}
