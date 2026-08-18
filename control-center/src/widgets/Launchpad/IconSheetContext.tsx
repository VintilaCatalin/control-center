import { createContext, useContext, useState, type ReactNode } from 'react';
import type { AppData } from '../../api/types';
import { IconSheet } from './IconSheet';

const Ctx = createContext<((app: AppData) => void) | null>(null);

// Same one-shared-instance pattern as CoverSheetProvider - the Launchpad
// dock is the only consumer today, but this keeps the same shape in case
// a second one shows up later.
export function IconSheetProvider({ children }: { children: ReactNode }) {
  const [app, setApp] = useState<AppData | null>(null);
  return (
    <Ctx.Provider value={setApp}>
      {children}
      <IconSheet app={app} onClose={() => setApp(null)} />
    </Ctx.Provider>
  );
}

export function useIconSheet(): (app: AppData) => void {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useIconSheet must be used inside <IconSheetProvider>');
  return ctx;
}
