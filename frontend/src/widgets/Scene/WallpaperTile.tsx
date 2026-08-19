import { Menu, type MenuItem } from '../../primitives/Menu/Menu';
import { useMenu } from '../../primitives/Menu/useMenu';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import styles from './WallpaperTile.module.css';

interface WallpaperTileProps {
  thumbUrl: string;
  name: string;
  current?: boolean;
  onApply: () => void;
  onApplyMatchLights: () => void;
  applying?: boolean;
  // Wallhaven results don't live in wallpaper_dir, so they can't be
  // favorited (favourite is a purely local-file concept) - omitting these
  // two props drops the star affordance entirely rather than rendering a
  // dead button.
  favorite?: boolean;
  onToggleFavorite?: () => void;
}

function StarIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path d="M12 2.8l2.8 6.2 6.7.6-5.1 4.5 1.5 6.6L12 17.4l-5.9 3.3 1.5-6.6L2.5 9.6l6.7-.6z" strokeLinejoin="round" />
    </svg>
  );
}

// A real <button>, not a div with role="button" - Tab/Enter/Space work for
// free instead of needing a hand-rolled keydown handler (the pattern
// GameTile needs precisely because it ISN'T a real button, for its own
// drag/launch reasons that don't apply here).
export function WallpaperTile({ thumbUrl, name, current, onApply, onApplyMatchLights, applying, favorite, onToggleFavorite }: WallpaperTileProps) {
  const menu = useMenu();

  const items: MenuItem[] = [
    { label: 'Set wallpaper', onClick: onApply },
    { label: 'Set, then match the lights', onClick: onApplyMatchLights },
    ...(onToggleFavorite ? [{ label: favorite ? 'Remove from favorites' : 'Add to favorites', onClick: onToggleFavorite }] : []),
  ];

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.tile}
        onClick={onApply}
        onContextMenu={menu.openAt}
        disabled={applying}
        title={name}
      >
        <ArtTile
          aspect="landscape"
          src={thumbUrl}
          alt={name}
          fallback={<span className={styles.fallbackName}>{name}</span>}
          ribbon={current ? <span className={styles.currentRibbon}>Current</span> : undefined}
        />
        {applying && (
          <div className={styles.applyingOverlay}>
            <span className={styles.spinner} />
          </div>
        )}
      </button>
      {onToggleFavorite && (
        <button
          type="button"
          className={styles.favoriteBtn}
          data-active={favorite ? '' : undefined}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          title={favorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={!!favorite}
        >
          <StarIcon filled={favorite} />
        </button>
      )}
      <Menu open={menu.open} x={menu.x} y={menu.y} items={items} onClose={menu.close} />
    </div>
  );
}
