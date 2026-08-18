import { createContext, useContext, type ReactNode } from 'react';
import { useSnapshot, type SnapshotState } from './useSnapshot';

// One poll loop shared by every widget, fanned out via context - the same
// shape as the old app's single poll() dispatching to many render*()
// functions (index.html:7566-7602). Without this, each widget mounting its
// own useSnapshot() would mean N independent pollers hitting /api/data.
const SnapshotContext = createContext<SnapshotState | null>(null);

export function SnapshotProvider({ children }: { children: ReactNode }) {
  const state = useSnapshot();
  return <SnapshotContext.Provider value={state}>{children}</SnapshotContext.Provider>;
}

export function useSnapshotData(): SnapshotState {
  const ctx = useContext(SnapshotContext);
  if (!ctx) throw new Error('useSnapshotData must be used inside <SnapshotProvider>');
  return ctx;
}
