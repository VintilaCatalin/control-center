import type { ReactNode } from 'react';
import { AppChromeProvider, useAppSidebarContent } from './AppChromeContext';
import { MainSidebar, type NavAppItem } from './MainSidebar';
import { PanelsControlProvider } from './PanelsControlContext';
import { SidebarCollapseProvider } from './SidebarCollapseContext';
import styles from './AppShell.module.css';

interface AppShellProps {
  navItems: NavAppItem[];
  activeAppId: string;
  // True once the user has explicitly clicked "Back to Main Menu" from
  // a secondary nav - forces the root app list even if the active
  // application still has content published, until a new selection
  // clears it (see App.tsx's onSelectApp).
  showRoot: boolean;
  onSelectApp: (id: string) => void;
  onBackToRoot: () => void;
  // Settings deliberately never changes activeAppId (so leaving it
  // restores exactly the app that was showing before - see App.tsx), so
  // looking `activeAppId` up in navItems for the secondary nav's header
  // would show the PREVIOUS real app's icon/title while Settings'
  // content is actually on screen. `null` here means "skip the identity
  // row, the published content owns its own" (Settings); `undefined`
  // (the default) means "use the normal activeAppId lookup", same as
  // every other application.
  identityOverride?: { icon?: ReactNode; title?: string } | null;
  children: ReactNode;
}

// The one persistent shell: MainSidebar never unmounts and never
// switches to a separate full-screen "Main Menu" mode - it always
// occupies the left column, showing either the flat Level 1 app list or
// whichever application's Level 2 nav is currently published (see
// AppChromeContext). Content sits beside it as an independent flex
// item - no shared bordered "frame" around both; the sidebar's own
// right border is the only separation.
function AppShellInner({ navItems, activeAppId, showRoot, onSelectApp, onBackToRoot, identityOverride, children }: AppShellProps) {
  const sidebarContent = useAppSidebarContent();
  const active = navItems.find((a) => a.id === activeAppId) ?? null;
  const identity =
    identityOverride !== undefined
      ? identityOverride
      : active && !active.hideSidebarIdentity
        ? { icon: active.icon, title: active.label }
        : null;
  const secondary = !showRoot && sidebarContent ? { icon: identity?.icon, title: identity?.title, content: sidebarContent } : null;

  return (
    <div className={styles.shell}>
      <MainSidebar navItems={navItems} activeAppId={activeAppId} onSelectApp={onSelectApp} secondary={secondary} onBackToRoot={onBackToRoot} />
      <div className={styles.content}>{children}</div>
    </div>
  );
}

export function AppShell(props: AppShellProps) {
  return (
    <SidebarCollapseProvider>
      <PanelsControlProvider>
        <AppChromeProvider>
          <AppShellInner {...props} />
        </AppChromeProvider>
      </PanelsControlProvider>
    </SidebarCollapseProvider>
  );
}
