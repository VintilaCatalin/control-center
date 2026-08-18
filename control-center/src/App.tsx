import { useEffect, useRef, useState, type ReactElement } from 'react';
import { SnapshotProvider, useSnapshotData } from './api/SnapshotProvider';
import { AtmosphereBackground } from './primitives/Atmosphere/AtmosphereBackground';
import { AtmosphereProvider } from './primitives/Atmosphere/AtmosphereContext';
import { AppShell } from './shell/AppShell';
import { AppNavigationProvider } from './shell/AppNavigationContext';
import { GamesIcon, HomelabIcon, NotesIcon, OverviewIcon, PlexIcon, ReadingIcon, SceneIcon } from './shell/icons';
import type { NavAppItem } from './shell/MainSidebar';
import { useServiceAlerts } from './shell/useServiceAlerts';
import { ToastProvider } from './primitives/Toast/ToastProvider';
import { CoverSheetProvider } from './widgets/Games/CoverSheetContext';
import { GamesView } from './widgets/Games/GamesView';
import { IconSheetProvider } from './widgets/Launchpad/IconSheetContext';
import type { SettingsSection } from './widgets/Settings/types';
import { Homelab } from './views/Homelab';
import { Notes } from './views/Notes';
import { Overview } from './views/Overview';
import { Plex } from './views/Plex';
import { Reading } from './views/Reading';
import { Scene } from './views/Scene';
import { SettingsView } from './views/SettingsView';
import type { ReadingSection } from './widgets/Reading/topics';

type AppId = 'overview' | 'games' | 'scene' | 'notes' | 'plex' | 'reading' | 'homelab';

interface AppDef {
  id: AppId;
  label: string;
  icon: ReactElement;
  component: () => ReactElement;
}

// There's always an active application - no separate blank "Main Menu"
// content state any more, the sidebar's own root list IS the Main Menu
// (see shell/MainSidebar). Settings deliberately has no entry here - it
// lives in the profile menu (see GlobalUtilities), never the application
// list - but it's still a real page occupying this same content region
// (see `settings` state below), not a modal floating over whatever app
// was active.
const APPS: AppDef[] = [
  { id: 'overview', label: 'Overview', icon: <OverviewIcon />, component: Overview },
  { id: 'games', label: 'Games', icon: <GamesIcon />, component: GamesView },
  { id: 'scene', label: 'Scene', icon: <SceneIcon />, component: Scene },
  { id: 'notes', label: 'Notes', icon: <NotesIcon />, component: Notes },
  { id: 'plex', label: 'Plex', icon: <PlexIcon />, component: Plex },
  { id: 'reading', label: 'Reading', icon: <ReadingIcon />, component: Reading },
  { id: 'homelab', label: 'Homelab', icon: <HomelabIcon />, component: Homelab },
];

// Notes, Plex and Reading all lead their own secondary nav with their own
// identity (Notes starts directly at Search; Plex/Reading have their own
// branding block - see PlexSidebarNav/ReadingSidebarNav) - the shell's
// generic icon+title identity row would just duplicate that, stacked
// above it. Homelab has no secondary nav of its own (single-view, like
// Scene) so it keeps the generic identity row.
const NAV_ITEMS: NavAppItem[] = APPS.map((a) => ({
  id: a.id,
  label: a.label,
  icon: a.icon,
  hideSidebarIdentity: a.id === 'notes' || a.id === 'plex' || a.id === 'reading',
}));

// Settings > System & Preferences > Startup's "Open on launch" - applied
// once, the first time it's seen (a ref guard, not a dependency this
// effect keeps watching), so it seeds the starting screen without ever
// fighting a selection the user makes afterwards. Has to live inside
// SnapshotProvider's own subtree (App() itself renders that provider, so
// it can't call the hook directly) and hand the result back up via a
// plain callback.
function DefaultAppSync({ onReady }: { onReady: (id: AppId) => void }) {
  const { snapshot } = useSnapshotData();
  const applied = useRef(false);
  const defaultApp = snapshot?.ui?.prefs?.default_app;
  useEffect(() => {
    if (applied.current || !defaultApp) return;
    applied.current = true;
    if (APPS.some((a) => a.id === defaultApp)) onReady(defaultApp as AppId);
  }, [defaultApp, onReady]);
  return null;
}

// Mounted once, inside both SnapshotProvider and ToastProvider - just
// calls the watcher hook, nothing to render.
function ServiceAlertsWatcher() {
  useServiceAlerts();
  return null;
}

function App() {
  const [activeAppId, setActiveAppId] = useState<AppId>('overview');
  // Explicit "collapse the sidebar back to the root list" flag, distinct
  // from which application's content is showing - clicking a nav item
  // always clears it (a fresh selection should show that app's own
  // level naturally); only the sidebar's own back button sets it.
  const [showRoot, setShowRoot] = useState(false);
  // Non-null means Settings is the active page - kept apart from
  // activeAppId (rather than adding 'settings' to that union) so leaving
  // Settings can restore exactly whichever real application was showing
  // before, without APPS/NAV_ITEMS ever needing to know Settings exists.
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null);
  // Global Search deep-link target for Reading - consumed once by
  // Reading.tsx (same one-time-apply shape as DefaultAppSync), then left
  // alone so a later manual section click isn't fought on the next render.
  const [pendingReadingSection, setPendingReadingSection] = useState<ReadingSection | null>(null);

  const active = APPS.find((a) => a.id === activeAppId)!;
  const Active = active.component;

  function handleSelectApp(id: string) {
    if (!APPS.some((a) => a.id === id)) return; // Reading/Homelab: listed, not yet real destinations
    setSettingsSection(null);
    setActiveAppId(id as AppId);
    setShowRoot(false);
  }

  function openSettings(section: SettingsSection) {
    setSettingsSection(section);
    setShowRoot(false);
  }

  function navigateToApp(id: string, opts?: { readingSection?: ReadingSection }) {
    if (!APPS.some((a) => a.id === id)) return;
    setSettingsSection(null);
    setActiveAppId(id as AppId);
    setShowRoot(false);
    if (id === 'reading' && opts?.readingSection) setPendingReadingSection(opts.readingSection);
  }

  return (
    <SnapshotProvider>
      <ToastProvider>
        <AtmosphereProvider>
          <AtmosphereBackground />
          <DefaultAppSync onReady={setActiveAppId} />
          <ServiceAlertsWatcher />
          <CoverSheetProvider>
            <IconSheetProvider>
              <AppNavigationProvider value={{ openSettings, navigateToApp }}>
                <AppShell
                  navItems={NAV_ITEMS}
                  activeAppId={activeAppId}
                  showRoot={showRoot}
                  onSelectApp={handleSelectApp}
                  onBackToRoot={() => setShowRoot(true)}
                  identityOverride={settingsSection ? null : undefined}
                >
                  {settingsSection ? (
                    <SettingsView key={settingsSection} section={settingsSection} />
                  ) : activeAppId === 'reading' ? (
                    <Reading initialSection={pendingReadingSection} onInitialSectionApplied={() => setPendingReadingSection(null)} />
                  ) : (
                    <Active />
                  )}
                </AppShell>
              </AppNavigationProvider>
            </IconSheetProvider>
          </CoverSheetProvider>
        </AtmosphereProvider>
      </ToastProvider>
    </SnapshotProvider>
  );
}

export default App;
