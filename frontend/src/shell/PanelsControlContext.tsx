import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface PanelToggleItem {
  id: string;
  label: string;
  hidden: boolean;
}

export interface PanelsControlValue {
  items: PanelToggleItem[];
  toggle: (id: string) => void;
  // "The view is done" - hides every drag handle/resize handle/label so
  // the layout can't be nudged by accident, without losing the ability
  // to still show/hide panels from here. Per-view (PanelGrid itself owns
  // the localStorage key), not a global app setting.
  locked: boolean;
  toggleLock: () => void;
}

interface Registry {
  value: PanelsControlValue | null;
  setValue: (v: PanelsControlValue | null) => void;
}

const Ctx = createContext<Registry | null>(null);

// Lets the page's own PanelGrid be the source of truth for "what panels
// exist / which are hidden" while the header - a sibling, not a parent -
// is what actually renders the toggle control. The grid publishes its
// current list on every render; the header just reads whatever was last
// published. Each view renders exactly one visible PanelGrid, so "last
// published" is always unambiguously "the current page's grid".
export function PanelsControlProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<PanelsControlValue | null>(null);
  return <Ctx.Provider value={{ value, setValue }}>{children}</Ctx.Provider>;
}

// Called by PanelGrid itself - not part of the public panel-authoring
// API, so it isn't exported alongside PanelDef/PanelGrid. `value` must be
// referentially stable across renders that don't actually change
// anything (PanelGrid useMemos it) - setValue() triggers a render of
// this provider, which re-renders PanelGrid, which re-runs this effect;
// without a real dependency check that's an infinite loop, not a re-sync.
export function usePublishPanelsControl(value: PanelsControlValue) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePublishPanelsControl must be used inside <PanelsControlProvider>');
  const { setValue } = ctx;
  useEffect(() => {
    setValue(value);
    return () => setValue(null);
  }, [value, setValue]);
}

export function usePanelsControl(): PanelsControlValue | null {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePanelsControl must be used inside <PanelsControlProvider>');
  return ctx.value;
}
