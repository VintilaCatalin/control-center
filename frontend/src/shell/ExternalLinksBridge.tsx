import { useEffect } from 'react';
import { openExternalUrl } from '../api/actions/openExternal';

function isExternalHref(href: string): boolean {
  if (/^https?:\/\//i.test(href)) return true;
  if (/^spotify:/i.test(href)) return true;
  return false;
}

/**
 * Global bridge: any external link / window.open leaves the isolated
 * Control Center Brave profile and opens in the OS default browser.
 * Same idea as legacy index.html's post("/api/open", { url }).
 */
export function ExternalLinksBridge() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href || !isExternalHref(href)) return;
      // Same-origin app routes stay in-window.
      try {
        const url = new URL(href, window.location.href);
        if (url.origin === window.location.origin) return;
      } catch {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void openExternalUrl(href).catch(() => {
        // Last resort if the backend is down mid-restart.
        window.location.assign(href);
      });
    }

    const nativeOpen = window.open.bind(window);
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      const href = typeof url === 'string' ? url : url?.toString();
      if (href && isExternalHref(href)) {
        void openExternalUrl(href).catch(() => nativeOpen(href, target, features));
        return null;
      }
      return nativeOpen(url, target, features);
    }) as typeof window.open;

    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.open = nativeOpen;
    };
  }, []);

  return null;
}
