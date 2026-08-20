// Some sources (Codrops among them) block hotlinked images by Referer -
// this app's own origin gets rejected outright when the browser requests
// the image directly, which reads as "the image is just missing" with no
// error surfaced anywhere. Routing through server.py's own fetch
// (/api/reading/thumb) sends no Referer and this app's normal UA, which
// is what actually side-steps that block.
export function readingThumbUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('/api/')) return url;
  return `/api/reading/thumb?url=${encodeURIComponent(url)}`;
}
