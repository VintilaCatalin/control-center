import { useEffect, useRef, useState } from 'react';
import { fetchSnapshot } from './client';
import type { Snapshot } from './types';

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
        const snapshot = await fetchSnapshot();
        if (cancelled) return;
        setState({ snapshot, loading: false, error: null });
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
