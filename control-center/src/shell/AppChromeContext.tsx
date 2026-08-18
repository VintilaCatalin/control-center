import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface Registry {
  value: ReactNode;
  setValue: (v: ReactNode) => void;
}

const Ctx = createContext<Registry | null>(null);

// Lets the active application publish its own sidebar content up to the
// shell, the same "child publishes, parent renders" shape
// PanelsControlContext already uses for panel visibility - one pattern
// for "a view hands the shell something to render outside its own
// subtree", not a second competing mechanism. AppShell owns where the
// published content actually appears (inside AppSidebar's nav slot);
// the application itself only ever supplies nav markup, never touches
// the frame around it.
export function AppChromeProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<ReactNode>(null);
  return <Ctx.Provider value={{ value, setValue }}>{children}</Ctx.Provider>;
}

// Same contract as PanelsControlContext's usePublishPanelsControl: `node`
// must be referentially stable across renders that don't actually change
// anything - the caller wraps its sidebar JSX in useMemo (see Notes/
// Plex/etc.) with real dependencies, not a bare `<Sidebar/>` recreated
// fresh every render. Without that, `[node, setValue]` below would
// re-fire on every render (a JSX element has no stable identity),
// setValue would treat each call as a genuine change, and the resulting
// re-render would recreate `node` again - an infinite loop, not a
// live-updating sidebar. Unmounting (switching apps, leaving app mode)
// clears the value so the old application's nav can never linger.
export function usePublishAppSidebar(node: ReactNode) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePublishAppSidebar must be used inside <AppChromeProvider>');
  const { setValue } = ctx;
  useEffect(() => {
    setValue(node);
    return () => setValue(null);
  }, [node, setValue]);
}

export function useAppSidebarContent(): ReactNode {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppSidebarContent must be used inside <AppChromeProvider>');
  return ctx.value;
}
