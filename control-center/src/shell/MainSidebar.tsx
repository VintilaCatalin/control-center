import type { ReactNode } from 'react';
import { GlobalUtilities } from './GlobalUtilities';
import { BackIcon, BrandMark } from './icons';
import { useSidebarCollapsed } from './SidebarCollapseContext';
import styles from './MainSidebar.module.css';

export interface NavAppItem {
  id: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  // Skip the icon+title identity row when this app's secondary nav is
  // showing - for an app whose own nav content already reads as its
  // identity (Notes starts directly at Search now, matching Plex's
  // branding-led sidebar rather than stacking a redundant title above
  // it). See AppShell.tsx, which reads this when building `secondary`.
  hideSidebarIdentity?: boolean;
}

export interface SecondaryNav {
  // Both optional - an application whose own nav content already reads
  // as its own identity (Plex leads with branding+search, Notes is
  // meant to start directly at Search per its own product call) can
  // omit these and skip the identity row entirely rather than stacking
  // a redundant title above content that already says what app this is.
  icon?: ReactNode;
  title?: string;
  content: ReactNode;
}

interface MainSidebarProps {
  navItems: NavAppItem[];
  activeAppId: string;
  onSelectApp: (id: string) => void;
  // Non-null only for a multi-section application (Notes/Plex today)
  // that has published its own nav content AND the user hasn't just
  // collapsed back to the root list - see AppShell.tsx for how the two
  // are combined. Overview/Games/Scene never publish anything, so this
  // is always null while they're active - the root list stays showing,
  // which IS their navigation (no separate empty sidebar for them).
  secondary: SecondaryNav | null;
  onBackToRoot: () => void;
}

// The one persistent left column, always mounted, always full height,
// its own surface (background/border, no outer margin or rounding) -
// not a launcher screen that disappears and not a nested card sharing a
// container with content (see MainSidebar.module.css). What it shows
// in the middle changes between two states: the flat Level 1 app list
// (the default - this doubles as "Main Menu", there's no separate
// full-screen launcher any more) or a Level 2 secondary nav for
// whichever application currently owns one. The bottom utility strip
// (Quick Tasks/Weather/Profile) never changes with either state.
//
// Collapse is one shared preference (see SidebarCollapseContext), applied
// the same way whether the root app list or an application's own
// secondary nav is showing. A secondary nav that wants to render
// something other than icon-only content while collapsed reads the same
// `collapsed` value itself (see PlexSidebarNav/ReadingSidebarNav/Notes'
// Sidebar) and adapts - this component never special-cases which content
// is currently showing.
export function MainSidebar({ navItems, activeAppId, onSelectApp, secondary, onBackToRoot }: MainSidebarProps) {
  const { collapsed } = useSidebarCollapsed();
  const effectiveCollapsed = collapsed;

  return (
    <aside className={styles.sidebar} data-collapsed={effectiveCollapsed ? '' : undefined}>
      {secondary ? (
        <>
          <button type="button" className={styles.backBtn} onClick={onBackToRoot} title={effectiveCollapsed ? 'Main Menu' : undefined}>
            <BackIcon />
            <span className={styles.backLabel}>Main Menu</span>
          </button>
          {secondary.title && (
            <div className={styles.identity}>
              {secondary.icon && <span className={styles.identityIcon}>{secondary.icon}</span>}
              <span className={styles.identityTitle}>{secondary.title}</span>
            </div>
          )}
          <nav className={styles.navScroll}>{secondary.content}</nav>
        </>
      ) : (
        <>
          <div className={styles.brand}>
            <span className={styles.brandGlyph}>
              <BrandMark />
            </span>
            <span className={styles.brandLabel}>Control Center</span>
          </div>
          <nav className={styles.navScroll}>
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={[styles.navItem, item.id === activeAppId ? styles.navItemActive : ''].filter(Boolean).join(' ')}
                disabled={item.disabled}
                onClick={() => onSelectApp(item.id)}
                title={effectiveCollapsed ? item.label : undefined}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
                {item.disabled && <span className={styles.soonBadge}>Soon</span>}
              </button>
            ))}
          </nav>
        </>
      )}

      <div className={styles.utilities}>
        <GlobalUtilities collapsed={effectiveCollapsed} />
      </div>
    </aside>
  );
}
