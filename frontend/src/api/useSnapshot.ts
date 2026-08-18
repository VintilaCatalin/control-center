import { useEffect, useRef, useState } from 'react';
import { fetchSnapshot } from './client';
import type { Snapshot } from './types';

const POLL_MS = 2000; // matches the old app's poll cadence (index.html:7605)

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

    async function tick() {
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
        if (!cancelled) timer.current = setTimeout(tick, POLL_MS);
      }
    }

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
    };
  }, []);

  return state;
}
