import { useEffect, useRef } from 'react';
import { useSnapshotData } from '../api/SnapshotProvider';
import { useToast } from '../primitives/Toast/ToastProvider';

// Pure client-side edge-detection over the polling snapshot that already
// exists (SnapshotProvider) - no backend push/websocket needed. Keeps the
// last-known online state per service by name, and only toasts on a real
// true -> false transition, not on every poll while a service is already
// known to be down (which would otherwise fire once per ~15s refresh).
export function useServiceAlerts() {
  const { snapshot } = useSnapshotData();
  const { push } = useToast();
  const lastOnline = useRef<Map<string, boolean>>(new Map());

  useEffect(() => {
    const services = snapshot?.homelab?.services;
    if (!services) return;
    for (const svc of services) {
      const prev = lastOnline.current.get(svc.name);
      if (prev === true && svc.online === false) {
        push(`${svc.name} went offline`, 'error');
      }
      lastOnline.current.set(svc.name, svc.online);
    }
  }, [snapshot?.homelab?.services, push]);
}
