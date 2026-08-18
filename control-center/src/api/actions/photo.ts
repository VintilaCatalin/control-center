import { postAction } from '../client';

// server.py:4302-4312 - both mutate the shared single-photo rotator and
// call snapshot.refresh("photo") synchronously before responding, so the
// next 2s poll (see useSnapshot) already carries the new photo. No local
// optimistic state needed here, same pattern as the layout actions.
export function nextPhoto(): Promise<{ ok: boolean }> {
  return postAction('/api/photo/next');
}

export function pinPhoto(pinned: boolean): Promise<{ ok: boolean; pinned: boolean }> {
  return postAction('/api/photo/pin', { pinned });
}
