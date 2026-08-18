import { postAction } from '../client';

// Shared by apps and games - both launch through the same route
// (server.py:2961-2965, launch_game() at 2321-2342). One function, not
// duplicated per domain.
export function launchTarget(target: string | string[]): Promise<{ ok: boolean }> {
  return postAction('/api/launch', { target });
}
