import { useEffect, useRef, useState } from 'react';
import { fetchSnapshot } from './client';
import type { Snapshot, SnapshotUpdate } from './types';

const POLL_MS = 2000; // matches the old app's poll cadence (index.html:7605)
const HIDDEN_POLL_MS = 30_000;

export interface SnapshotState {
  snapshot: Snapshot | null;
  loading: boolean; // true until the first request settles, success or fail
  error: Error | null; // most recent fetch error, if any
}

export function useSnapshot(): SnapshotState {
  const [state, setState] = useState<SnapshotState>({
    snapshot: null,
    loading: true,
    error: null,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cursor = useRef<{ epoch: string; versions: Record<string, number> } | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let fetching = false;

    function schedule(delay: number) {
      clearTimeout(timer.current);
      timer.current = setTimeout(tick, delay);
    }

    async function tick() {
      if (fetching) return;
      fetching = true;
      try {
        const update = await fetchSnapshot(cursor.current);
        if (cancelled) return;
        cursor.current = { epoch: update.epoch, versions: update.versions };
        applyUpdate(update);
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({
          snapshot: prev.snapshot, // keep last-known-good data on screen
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        }));
      } finally {
        fetching = false;
        if (!cancelled) schedule(document.hidden ? HIDDEN_POLL_MS : POLL_MS);
      }
    }

    function applyUpdate(update: SnapshotUpdate) {
      setState((prev) => {
        // Metadata-only replies are common now. Keeping the existing state
        // object prevents a full React tree render when no collector changed.
        if (prev.snapshot && update.changed.length === 0) return prev;
        const { changed: _changed, epoch: _epoch, versions: _versions, ...delta } = update;
        return {
          snapshot: { ...(prev.snapshot ?? {}), ...delta } as Snapshot,
          loading: false,
          error: null,
        };
      });
    }

    // A minimized/covered dashboard cannot show a live update. Backing off
    // avoids repeatedly downloading and parsing the full snapshot until the
    // window is visible again, at which point refresh immediately.
    function onVisibilityChange() {
      if (!document.hidden) schedule(0);
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return state;
}
