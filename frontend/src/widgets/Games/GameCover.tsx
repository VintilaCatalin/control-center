import type { GameData } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import styles from './GameCover.module.css';

const SOURCE_LABEL: Partial<Record<GameData['source'], string>> = {
  xbox: 'Xbox',
  battlenet: 'Battle.net',
  riot: 'Riot',
  manual: 'Added',
};

// Pure artwork - no click/hover/favorite/drag behavior. GameTile owns all
// of that; this only knows how to render a cover well.
//
// Every source shares the same full-bleed cover treatment now - Xbox
// previously got object-fit:contain (letterboxed on a plate), which read
// as visually inconsistent next to Steam's full-bleed art for no real
// reason. The source badge is purely an overlay (ArtTile's badge slot);
// it never changes how the artwork itself fits.
export function GameCover({ game }: { game: GameData }) {
  const label = SOURCE_LABEL[game.source];
  return (
    <ArtTile
      aspect="portrait"
      src={game.art}
      altSrcs={[...(game.art_alts ?? []), ...(game.art_fallback ? [game.art_fallback] : [])]}
      alt={game.name}
      className={styles.cover}
      badge={label ? <span className={styles.badge}>{label}</span> : undefined}
      ribbon={!game.launch ? <span className={styles.ribbon}>No launcher</span> : undefined}
      fallback={<span className={styles.fallbackName}>{game.name}</span>}
    />
  );
}
