import { postAction } from '../client';

// Control Center runs as Brave --app with an isolated --user-data-dir
// (panel-profile). window.open / <a target=_blank> would open inside that
// bare profile (no extensions). Route through the backend instead so
// Windows hands the URL to the user's real default browser.
export function openExternalUrl(url: string): Promise<{ ok: boolean; error?: string }> {
  return postAction('/api/open', { url });
}
