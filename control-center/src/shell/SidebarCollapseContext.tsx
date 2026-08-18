import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSnapshotData } from '../api/SnapshotProvider';

interface CollapseCtx {
  collapsed: boolean;
  toggle: () => void;
}

const Ctx = createContext<CollapseCtx | null>(null);

// One collapse boolean for the whole sidebar column, provided above both
// MainSidebar (which owns the toggle button) and every application view
// (Notes/Plex/Reading/...), which need to read it too so their own
// published secondary nav can render a compact form instead of silently
// ignoring the preference. Previously `collapsed` lived as local state
// inside MainSidebar and was force-disabled (`collapsed && !secondary`)
// whenever a secondary nav was showing, because no application had any
// way to know the preference existed and adapt its own content - the
// button looked live but did nothing while inside Notes/Plex/Reading.
// A shared context is the fix: the state is genuinely one thing, read
// wherever it's needed, not reimplemented per application.
export function SidebarCollapseProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  // Settings > Sidebar's "collapse by default" preference - applied once,
  // the first time it's seen, not on every poll (that would silently
  // fight a manual toggle the user just made). A ref instead of state
  // for the "have we applied it yet" flag, since it's not something any
  // render needs to react to.
  const { snapshot } = useSnapshotData();
  const applied = useRef(false);
  const wantsDefault = snapshot?.ui?.prefs?.sidebar_default_collapsed;

  useEffect(() => {
    if (applied.current || wantsDefault === undefined) return;
    applied.current = true;
    if (wantsDefault) setCollapsed(true);
  }, [wantsDefault]);

  return <Ctx.Provider value={{ collapsed, toggle: () => setCollapsed((c) => !c) }}>{children}</Ctx.Provider>;
}

export function useSidebarCollapsed(): CollapseCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSidebarCollapsed must be used inside <SidebarCollapseProvider>');
  return ctx;
}
