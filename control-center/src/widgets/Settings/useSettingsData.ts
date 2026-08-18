import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSettings, saveSettings } from '../../api/actions/settings';
import type { SettingsResponse } from '../../api/types';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// One fetch on open, local edits layered on top until they're confirmed
// saved - the same "optimistic, reconciled once the server agrees" shape
// PanelGrid and ReadingFeed's save-state already use elsewhere in this
// app, not a new pattern invented for Settings. Each field saves on its
// own short debounce rather than needing an explicit "Save" button - a
// settings screen you can walk away from mid-edit and trust it already
// stuck is the actual point of "saved feedback", not a modal you have to
// remember to confirm.
export function useSettingsData(active: boolean) {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active || data) return;
    fetchSettings().then(
      (res) => setData(res),
      () => setLoadError("Couldn't load settings from the backend."),
    );
  }, [active, data]);

  useEffect(() => {
    const t = timers.current;
    const s = savedTimer.current;
    return () => {
      Object.values(t).forEach(clearTimeout);
      if (s) clearTimeout(s);
    };
  }, []);

  function getValue(key: string): string {
    if (key in pending) return pending[key];
    return data?.values[key] ?? '';
  }

  function setValue(key: string, value: string, opts?: { immediate?: boolean }) {
    setPending((prev) => ({ ...prev, [key]: value }));
    clearTimeout(timers.current[key]);
    const commit = () => {
      setStatus('saving');
      saveSettings({ [key]: value }).then(
        () => {
          setStatus('saved');
          if (savedTimer.current) clearTimeout(savedTimer.current);
          savedTimer.current = setTimeout(() => setStatus('idle'), 1800);
        },
        () => setStatus('error'),
      );
    };
    if (opts?.immediate) commit();
    else timers.current[key] = setTimeout(commit, 700);
  }

  // For fields with their own dedicated save endpoint (the profile photo
  // upload, see ProfilePhotoField) - the backend already has the new
  // value by the time this is called, this just reconciles the local
  // optimistic display with it, no second /api/settings/save round-trip.
  function setLocal(key: string, value: string) {
    setPending((prev) => ({ ...prev, [key]: value }));
  }

  const origin = useCallback((key: string) => data?.origins[key] ?? 'default', [data]);
  const isSecret = useCallback((key: string) => !!data?.secrets.includes(key), [data]);

  return { data, status, loadError, getValue, setValue, setLocal, origin, isSecret };
}
