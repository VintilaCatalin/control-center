import { type PanelDef, PanelGrid } from '../primitives/PanelGrid/PanelGrid';
import { EnvironmentHero } from '../widgets/Scene/EnvironmentHero';
import { FavoritesPanel } from '../widgets/Scene/FavoritesPanel';
import { WallhavenLibrary } from '../widgets/Scene/WallhavenLibrary';
import { YoursLibrary, YoursLibraryHeaderActions } from '../widgets/Scene/YoursLibrary';
import styles from './Scene.module.css';

// Scene is single-view - no sidebar content published; MainSidebar
// keeps showing the root app list while it's active (see
// shell/MainSidebar). Panels show/hide is a sidebar utility now (see
// shell/GlobalUtilities).
//
// Yours/Wallhaven are genuinely interchangeable panels - same content
// shape, no reason to fix their order/size/visibility - so they get the
// drag/resize/hide/persist system as a full-width bottom row (matching
// server.py's DEFAULT_LAYOUTS["scene"]). The Hero and Favorites above
// them are a fixed top-row composition instead, not part of this grid -
// see FavoritesPanel for why.
const LIBRARY_PANELS: PanelDef[] = [
  {
    id: 'yours',
    label: 'Yours',
    minSize: { w: 1, h: 1 },
    headerAction: <YoursLibraryHeaderActions />,
    content: <YoursLibrary />,
  },
  { id: 'wallhaven', label: 'Wallhaven', minSize: { w: 1, h: 1 }, content: <WallhavenLibrary /> },
];

export function Scene() {
  return (
    <div className={styles.scene}>
      <div className={styles.topRow}>
        <div className={styles.heroCol}>
          <EnvironmentHero />
        </div>
        <div className={styles.favoritesCol}>
          <FavoritesPanel />
        </div>
      </div>
      <PanelGrid view="scene" panels={LIBRARY_PANELS} fallbackSize={{ w: 4, h: 8 }} />
    </div>
  );
}
