import { FavoritesLibrary } from './FavoritesLibrary';
import styles from './FavoritesPanel.module.css';

// Deliberately not a PanelGrid entry: it's pinned beside the Hero as part
// of one fixed top-row composition (see Scene.tsx/Scene.module.css), so
// there's nothing to drag/reorder/hide it relative to - the Hero itself
// is exempt from the panel system for the same reason. Yours/Wallhaven
// stay genuinely interchangeable panels below, where that system earns
// its keep.
export function FavoritesPanel() {
  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.label}>Favorites</span>
      </div>
      <div className={styles.body}>
        <FavoritesLibrary />
      </div>
    </div>
  );
}
