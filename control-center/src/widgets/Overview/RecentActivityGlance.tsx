import { useSnapshotData } from '../../api/SnapshotProvider';
import { launchTarget } from '../../api/actions/launch';
import type { GameData } from '../../api/types';
import { relativeTime } from '../Games/time';
import styles from './RecentActivityGlance.module.css';

const SOURCE_LABEL: Partial<Record<GameData['source'], string>> = {
  xbox: 'Xbox',
  battlenet: 'Battle.net',
  riot: 'Riot',
  manual: 'Added manually',
};

function GamesIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="20" height="12" rx="4" />
      <path d="M8 11v4M6 13h4M15.5 12.5h.01M18 14.5h.01" />
    </svg>
  );
}

// Real cover art now, not a thin row of tiny thumbnails - "recent
// activity" earns visual weight the same way Favorites/Games shelves
// already give their art. Still compact (a wrapping grid, not the full
// GameTile management chrome), just with the art doing the work instead
// of a caption line.
export function RecentActivityGlance() {
  const { snapshot } = useSnapshotData();
  const recent = snapshot?.games?.recent ?? [];

  return (
    <div className={styles.glance}>
      <span className={styles.heading}>
        <GamesIcon /> Recent Activity
      </span>
      {recent.length === 0 ? (
        <div className={styles.empty}>Nothing played recently.</div>
      ) : (
        <div className={styles.grid}>
          {recent.slice(0, 6).map((g) => (
            <button
              type="button"
              key={g.id}
              className={styles.card}
              onClick={() => g.launch && launchTarget(g.launch)}
              disabled={!g.launch}
              title={g.name}
            >
              <span className={styles.art} style={{ backgroundImage: g.art ? `url("${g.art}")` : undefined }} />
              <span className={styles.name}>{g.name}</span>
              <span className={styles.meta}>
                {SOURCE_LABEL[g.source] ?? 'Steam'} · {relativeTime(g.last_played)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
