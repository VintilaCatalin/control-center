import { createContext, useContext, type ReactNode } from 'react';
import type { ReadingSection } from '../widgets/Reading/topics';
import type { SettingsSection } from '../widgets/Settings/types';

interface AppNavigation {
  openSettings: (section: SettingsSection) => void;
  // Global Search's "open the relevant item directly" - Games/Plex results
  // launch straight out (see GlobalSearchOverlay), but Notes/Reading have
  // no external launch target, only an in-app place to land. Switches the
  // active application and, for Reading, which section it should open on
  // (consumed once by Reading.tsx, same one-time-apply shape as
  // DefaultAppSync's default_app handling in App.tsx).
  navigateToApp: (appId: string, opts?: { readingSection?: ReadingSection }) => void;
}

const Ctx = createContext<AppNavigation | null>(null);

// The opposite direction from AppChromeContext's "child publishes up" -
// App.tsx owns which application is active, GlobalUtilities (three levels
// down, inside the sidebar) needs to ask it to switch to Settings. A
// plain provided callback, not a second state store: App.tsx is still
// the one and only place activeAppId actually lives.
export function AppNavigationProvider({ value, children }: { value: AppNavigation; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppNavigation(): AppNavigation {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppNavigation must be used inside <AppNavigationProvider>');
  return ctx;
}
