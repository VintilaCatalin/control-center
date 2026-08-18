import { postAction } from '../client';

// server.py:2894-2926 - the same generic panel-layout routes Overview and
// Homelab already use, now registered for "games" too
// (server.py DEFAULT_LAYOUTS). No new backend logic.

export function resizePanel(view: string, id: string, w: number, h: number): Promise<{ ok: boolean }> {
  return postAction('/api/layout/resize', { view, id, w, h });
}

export function reorderPanels(view: string, order: string[]): Promise<{ ok: boolean }> {
  return postAction('/api/layout/order', { view, order });
}

export function hidePanel(view: string, id: string, hidden: boolean): Promise<{ ok: boolean }> {
  return postAction('/api/layout/hide', { view, id, hidden });
}
