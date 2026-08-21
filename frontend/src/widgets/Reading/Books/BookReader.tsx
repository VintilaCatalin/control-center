import { motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import ePub from 'epubjs';
import { editBook, openLocalBook } from '../../../api/actions/books';
import type { Book } from '../../../api/types';
import { duration, ease } from '../../../tokens/motion';
import { BackIcon, ExternalLinkIcon } from '../icons';
import styles from './BookReader.module.css';

/**
 * Clean EPUB reader — one proven path only:
 *   renderTo(host, { width:'100%', height:'100%', flow:'scrolled-doc' })
 *   display(spineIndex)  // never TOC fragment hrefs
 *   scroll lives on `.epub-container`, not the iframe window
 *
 * Position blob in book.reading_cfi + localStorage: {v:1,spine,scroll}
 * Bookmark button → save place + status "reading" + progress_pct
 */

export interface BookReaderProps {
  title: string;
  url: string;
  onClose: () => void;
  bookId?: string;
  initialCfi?: string | null;
  onLocation?: (
    encoded: string,
    progressPct?: number,
    meta?: { status?: Book['status'] },
  ) => void;
}

type EpubBook = ReturnType<typeof ePub>;
type EpubRendition = ReturnType<EpubBook['renderTo']>;
type SpineItem = { href: string; index: number };
type ReadingPos = { v: 1; spine: number; scroll: number };

const INK = '#12141a';
const TEXT = '#ebe6d9';
const ACCENT = '#9ec0ff';

const READER_CSS = `
  html, body {
    background: ${INK} !important;
    color: ${TEXT} !important;
    font-family: Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif !important;
    font-size: 22px !important;
    line-height: 1.75 !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  body {
    padding: 2.25rem 2.25rem 4rem !important;
    max-width: 48rem !important;
    margin: 0 auto !important;
  }
  * {
    line-height: 1.75 !important;
    letter-spacing: normal !important;
    max-height: none !important;
  }
  p, .indent, .indent1, .indent_top, .noindent, .ext, .head, .head2,
  div, span, li, td, th, blockquote, section, article, aside {
    color: ${TEXT} !important;
    background: transparent !important;
    font-size: 22px !important;
    line-height: 1.75 !important;
  }
  p, .indent, .indent1, .indent_top, .noindent, .ext {
    margin-top: 0 !important;
    margin-bottom: 1em !important;
    text-indent: 0 !important;
    text-align: left !important;
  }
  h1, h2, h3, h4, h5, h6, .cn, .ct, .fmh {
    color: ${TEXT} !important;
    background: transparent !important;
    font-size: 1.45em !important;
    line-height: 1.3 !important;
    font-weight: 650 !important;
    text-align: center !important;
    margin: 1.25em 0 0.75em !important;
  }
  h2.cn { font-size: 0.95em !important; letter-spacing: 0.06em !important; opacity: 0.85; }
  a { color: ${ACCENT} !important; text-decoration: none !important; }
  .dropcap, .dropcap1, span.dropcap, span.large {
    float: none !important;
    display: inline !important;
    font-size: inherit !important;
    line-height: inherit !important;
    font-weight: inherit !important;
  }
  img, svg, image {
    max-width: 100% !important;
    height: auto !important;
    display: block !important;
    margin: 1rem auto !important;
  }
  .cc-resume-mark {
    box-shadow: inset 3px 0 0 ${ACCENT} !important;
    background: rgba(158, 192, 255, 0.12) !important;
    border-radius: 2px !important;
  }
`;

function paintReaderStyles(doc: Document | undefined) {
  if (!doc?.head) return;
  doc.querySelectorAll('link[rel="stylesheet"], style:not([data-cc-reader])').forEach((node) => {
    try {
      if ('disabled' in node) (node as HTMLLinkElement | HTMLStyleElement).disabled = true;
    } catch {
      /* ignore */
    }
  });
  let style = doc.querySelector('style[data-cc-reader]') as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.setAttribute('data-cc-reader', '1');
    doc.head.appendChild(style);
  }
  style.textContent = READER_CSS;
}

function markResumeSpot(doc: Document | undefined) {
  if (!doc?.body) return;
  doc.querySelectorAll('.cc-resume-mark').forEach((n) => n.classList.remove('cc-resume-mark'));
  const win = doc.defaultView;
  let target: Element | null = null;
  if (win) {
    const probeY = Math.min(140, Math.floor(win.innerHeight * 0.28));
    target = doc.elementFromPoint(Math.floor(win.innerWidth / 2), probeY);
    while (target && target !== doc.body && !/^(P|H1|H2|H3|H4|BLOCKQUOTE|LI)$/i.test(target.tagName)) {
      target = target.parentElement;
    }
  }
  if (!target || target === doc.body) {
    target = doc.querySelector('p.noindent, p.indent, p') || doc.querySelector('h2, h1');
  }
  if (target) target.classList.add('cc-resume-mark');
}

function toEmbeddable(url: string): string {
  const drive = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  return drive ? `https://drive.google.com/file/d/${drive[1]}/preview` : url;
}

/** Keep ebook fetches same-origin — absolute http://127.0.0.1:8770/… breaks under Vite / restarts. */
function normalizeEbookUrl(url: string): string {
  const raw = (url || '').trim();
  if (!raw) return raw;
  try {
    if (raw.startsWith('/')) return raw;
    const parsed = new URL(raw, window.location.origin);
    if (parsed.pathname.startsWith('/api/books/')) {
      return `${parsed.pathname}${parsed.search}`;
    }
    if (
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
      parsed.port === window.location.port
    ) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    /* keep raw */
  }
  return raw;
}

function isLocalLibraryUrl(url: string): boolean {
  const n = normalizeEbookUrl(url);
  return n.startsWith('/api/books/local');
}

function urlLooksLikeEpub(url: string): boolean {
  const lower = normalizeEbookUrl(url).toLowerCase();
  if (lower.includes('.epub')) return true;
  if (!isLocalLibraryUrl(url)) return false;
  try {
    const rel = new URL(normalizeEbookUrl(url), 'http://local').searchParams.get('rel') || '';
    return rel.toLowerCase().endsWith('.epub');
  } catch {
    return false;
  }
}

function urlLooksLikeFb2(url: string): boolean {
  const lower = normalizeEbookUrl(url).toLowerCase();
  if (lower.includes('.fb2')) return true;
  if (!isLocalLibraryUrl(url)) return false;
  try {
    const rel = new URL(normalizeEbookUrl(url), 'http://local').searchParams.get('rel') || '';
    return decodeURIComponent(rel).toLowerCase().endsWith('.fb2');
  } catch {
    return false;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** FictionBook (.fb2) → simple HTML for the in-app scrolled reader. */
function fb2ToHtml(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('This FB2 file is damaged or not valid XML');
  }

  const binaries = new Map<string, string>();
  doc.querySelectorAll('binary').forEach((bin) => {
    const id = bin.getAttribute('id');
    const ctype = bin.getAttribute('content-type') || 'image/jpeg';
    const data = (bin.textContent || '').replace(/\s+/g, '');
    if (id && data) binaries.set(id, `data:${ctype};base64,${data}`);
  });

  const parts: string[] = [];

  function attrHref(el: Element): string {
    return (
      el.getAttribute('l:href') ||
      el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
      el.getAttribute('xlink:href') ||
      el.getAttribute('href') ||
      ''
    );
  }

  function walk(el: Element) {
    const tag = (el.localName || el.tagName || '').toLowerCase();
    if (!tag || tag === 'binary' || tag === 'description' || tag === 'stylesheet') return;

    if (tag === 'title') {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) parts.push(`<h2>${escapeHtml(t)}</h2>`);
      return;
    }
    if (tag === 'subtitle') {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) parts.push(`<h3>${escapeHtml(t)}</h3>`);
      return;
    }
    if (tag === 'p' || tag === 'v' || tag === 'text-author') {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) parts.push(`<p>${escapeHtml(t)}</p>`);
      return;
    }
    if (tag === 'empty-line') {
      parts.push('<p><br/></p>');
      return;
    }
    if (tag === 'image') {
      const id = attrHref(el).replace(/^#/, '');
      const src = binaries.get(id);
      if (src) parts.push(`<img src="${src}" alt="" />`);
      return;
    }
    if (tag === 'a') {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) parts.push(`<p>${escapeHtml(t)}</p>`);
      return;
    }

    Array.from(el.children).forEach((child) => walk(child as Element));
  }

  doc.querySelectorAll('body').forEach((body) => {
    const name = body.getAttribute('name') || '';
    if (/notes|comments|footnotes/i.test(name)) return;
    walk(body);
  });

  if (!parts.length) throw new Error('This FB2 has no readable text');
  return parts.join('\n');
}

function spineItems(book: EpubBook): SpineItem[] {
  const raw = (book.spine as { spineItems?: SpineItem[] }).spineItems;
  return Array.isArray(raw) ? raw : [];
}

/** First open → spine 0 (cover). Resume keeps saved spine. */
function resolveStartIndex(_book: EpubBook): number {
  return 0;
}

function encodePos(pos: ReadingPos): string {
  return JSON.stringify(pos);
}

function parsePos(raw: string | null | undefined): ReadingPos | null {
  if (!raw?.trim()?.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ReadingPos>;
    if (typeof parsed.spine !== 'number' || !Number.isFinite(parsed.spine)) return null;
    return {
      v: 1,
      spine: Math.max(0, Math.floor(parsed.spine)),
      scroll: Math.max(0, Math.round(Number(parsed.scroll) || 0)),
    };
  } catch {
    return null;
  }
}

function localKey(bookId: string) {
  return `cc.book.pos.${bookId}`;
}

function readLocalPos(bookId: string | undefined): ReadingPos | null {
  if (!bookId) return null;
  try {
    return parsePos(localStorage.getItem(localKey(bookId)));
  } catch {
    return null;
  }
}

function writeLocalPos(bookId: string, pos: ReadingPos) {
  try {
    localStorage.setItem(localKey(bookId), encodePos(pos));
  } catch {
    /* ignore */
  }
}

function pickBestPos(server: string | null | undefined, bookId: string | undefined): ReadingPos | null {
  const a = parsePos(server);
  const b = readLocalPos(bookId);
  if (a && b) {
    if (b.spine !== a.spine) return b.spine >= a.spine ? b : a;
    return b.scroll >= a.scroll ? b : a;
  }
  return a || b;
}

/** Continue when we've moved past the cover or scrolled into a chapter. */
export function hasResumePoint(raw: string | null | undefined): boolean {
  const pos = parsePos(raw);
  return !!(pos && (pos.scroll >= 80 || pos.spine > 0));
}

function isMeaningfulPos(pos: ReadingPos): boolean {
  return pos.scroll >= 80 || pos.spine > 0;
}

function approxProgress(book: EpubBook, spine: number, scroll: number, scrollHeight: number): number {
  const n = Math.max(1, spineItems(book).length);
  const within = scrollHeight > 0 ? Math.min(1, Math.max(0, scroll / scrollHeight)) : 0;
  return Math.max(0, Math.min(100, Math.round(((spine + within) / n) * 100)));
}

async function displaySpine(rendition: EpubRendition, index: number) {
  try {
    await rendition.display(index);
  } catch {
    try {
      await rendition.display(0);
    } catch {
      await rendition.display();
    }
  }
}

function hasVisibleContent(host: HTMLElement): boolean {
  const iframe = host.querySelector('iframe');
  const doc = iframe?.contentDocument;
  if (!doc?.body) return false;
  if ((doc.body.innerText || '').trim().length >= 12) return true;
  return !!doc.body.querySelector('img, svg, image, canvas');
}

async function waitForContent(host: HTMLElement, attempts = 12): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (hasVisibleContent(host)) return true;
    await new Promise((r) => setTimeout(r, 120 + i * 40));
  }
  return hasVisibleContent(host);
}

function loadErrorMessage(status: number, bodyHint: string): string {
  if (status === 403) return 'File not allowed — check Settings → Reading → Books folder';
  if (status === 404) return 'Ebook file not found on disk';
  if (status === 500) return bodyHint || 'Couldn’t read the ebook file (NAS offline?)';
  if (status === 0) return 'Couldn’t reach Control Center — is the backend running?';
  return `Couldn’t load ebook (${status})`;
}

function ChevronLeftIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function BookmarkIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5v16.2l-6-3.4-6 3.4V4.5Z" />
    </svg>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: duration.base, ease }}
    >
      {children}
    </motion.div>
  );
}

export function BookReader(props: BookReaderProps) {
  const url = normalizeEbookUrl(props.url);
  if (urlLooksLikeEpub(url)) {
    return <EpubPane {...props} url={url} local={isLocalLibraryUrl(url)} />;
  }
  if (urlLooksLikeFb2(url)) {
    return <Fb2Pane {...props} url={url} local={isLocalLibraryUrl(url)} />;
  }
  if (isLocalLibraryUrl(url)) {
    return <SystemOpenPane title={props.title} url={url} onClose={props.onClose} />;
  }
  return <IframePane title={props.title} url={url} onClose={props.onClose} />;
}

function Fb2Pane({
  title,
  url,
  local,
  onClose,
  bookId,
  initialCfi,
  onLocation,
}: BookReaderProps & { local: boolean }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bookIdRef = useRef(bookId);
  bookIdRef.current = bookId;
  const onLocationRef = useRef(onLocation);
  onLocationRef.current = onLocation;
  const persistRef = useRef<(opts?: { toast?: boolean }) => void>(() => {});

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [html, setHtml] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [bookmarkFlash, setBookmarkFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    let bannerTimer: ReturnType<typeof setTimeout> | undefined;
    let flashTimer: ReturnType<typeof setTimeout> | undefined;
    let savesAllowed = false;

    function persist(opts?: { toast?: boolean }) {
      const id = bookIdRef.current;
      const root = scrollerRef.current;
      if (!id || !savesAllowed || !root) return;
      const pos: ReadingPos = { v: 1, spine: 0, scroll: Math.round(root.scrollTop) };
      if (!opts?.toast && pos.scroll < 80) return;

      const encoded = encodePos(pos);
      writeLocalPos(id, pos);
      const max = Math.max(1, root.scrollHeight - root.clientHeight);
      const pct = Math.max(0, Math.min(100, Math.round((pos.scroll / max) * 100)));
      setProgressLabel(`${pct}%`);
      onLocationRef.current?.(encoded, pct, { status: 'reading' });

      clearTimeout(saveTimer);
      const write = () => {
        if (bookIdRef.current !== id) return;
        editBook(id, { reading_cfi: encoded, progress_pct: pct, status: 'reading' }).catch(() => {
          if (opts?.toast) {
            setBanner('Couldn’t save — is the backend running?');
            clearTimeout(bannerTimer);
            bannerTimer = setTimeout(() => setBanner(null), 2800);
          }
        });
      };
      if (opts?.toast) write();
      else saveTimer = setTimeout(write, 400);

      if (opts?.toast) {
        setBookmarkFlash(true);
        setBanner(`Reading · ${pct}% saved`);
        clearTimeout(flashTimer);
        clearTimeout(bannerTimer);
        flashTimer = setTimeout(() => setBookmarkFlash(false), 900);
        bannerTimer = setTimeout(() => setBanner(null), 2400);
      }
    }

    persistRef.current = persist;

    async function mount() {
      setStatus('loading');
      setError(null);
      try {
        const res = await fetch(normalizeEbookUrl(url));
        if (!res.ok) {
          const hint = (await res.text().catch(() => '')).slice(0, 120);
          throw new Error(loadErrorMessage(res.status, hint));
        }
        // FB2 is often UTF-8; fall back if the server omits charset.
        const buf = await res.arrayBuffer();
        let text = new TextDecoder('utf-8').decode(buf);
        if (text.includes('\uFFFD') || /encoding\s*=\s*["']?windows-1251/i.test(text.slice(0, 200))) {
          try {
            text = new TextDecoder('windows-1251').decode(buf);
          } catch {
            try {
              text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
            } catch {
              /* keep utf-8 */
            }
          }
        }
        if (cancelled) return;
        const rendered = fb2ToHtml(text);
        setHtml(rendered);
        setStatus('ready');

        const resume = pickBestPos(initialCfi, bookId);
        requestAnimationFrame(() => {
          const root = scrollerRef.current;
          if (!root) return;
          if (resume && resume.scroll > 0) {
            root.scrollTop = resume.scroll;
            setBanner('Picked up where you left off');
            bannerTimer = setTimeout(() => setBanner(null), 2800);
          }
          savesAllowed = true;
          if (bookIdRef.current) {
            onLocationRef.current?.(encodePos({ v: 1, spine: 0, scroll: Math.round(root.scrollTop) }), undefined, {
              status: 'reading',
            });
            editBook(bookIdRef.current, { status: 'reading' }).catch(() => {});
          }
        });
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        const msg = e instanceof Error ? e.message : 'Couldn’t open this FB2';
        setError(
          /failed to fetch|networkerror|load failed|connection aborted|remote.?disconnected/i.test(msg)
            ? 'Couldn’t load the ebook file — if this keeps happening, restart Control Center'
            : msg,
        );
      }
    }

    void mount();
    return () => {
      cancelled = true;
      clearTimeout(saveTimer);
      clearTimeout(scrollTimer);
      clearTimeout(bannerTimer);
      clearTimeout(flashTimer);
      if (savesAllowed) persist();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, bookId]);

  function onScroll() {
    clearTimeout((onScroll as { _t?: ReturnType<typeof setTimeout> })._t);
    (onScroll as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(() => persistRef.current(), 350);
  }

  function scrollPage(dir: 1 | -1) {
    const root = scrollerRef.current;
    if (!root) return;
    const step = Math.max(280, Math.floor(root.clientHeight * 0.88));
    root.scrollBy({ top: dir * step, behavior: 'smooth' });
    window.setTimeout(() => persistRef.current(), 400);
  }

  return (
    <Overlay>
      <div className={styles.bar}>
        <button type="button" className={styles.backBtn} onClick={onClose}>
          <BackIcon />
          <span>Back to {title}</span>
        </button>
        <div className={styles.barActions}>
          {banner && <span className={styles.resumeChip}>{banner}</span>}
          {progressLabel && !banner && <span className={styles.progressChip}>{progressLabel}</span>}
          <button type="button" className={styles.navBtn} disabled={status !== 'ready'} aria-label="Previous" onClick={() => scrollPage(-1)}>
            <ChevronLeftIcon />
          </button>
          <button type="button" className={styles.navBtn} disabled={status !== 'ready'} aria-label="Next" onClick={() => scrollPage(1)}>
            <ChevronRightIcon />
          </button>
          {local && (
            <button type="button" className={styles.openExternal} onClick={() => void openLocalBook({ url })} title="Open in system ebook app">
              <ExternalLinkIcon />
              System app
            </button>
          )}
        </div>
      </div>

      <div className={styles.epubShell}>
        {status === 'loading' && <p className={styles.epubStatus}>Loading ebook…</p>}
        {status === 'error' && (
          <div className={styles.systemPane}>
            <p className={styles.systemTitle}>Couldn’t open this FB2</p>
            <p className={styles.systemHint}>{error}</p>
            {local && (
              <button type="button" className={styles.openExternal} onClick={() => void openLocalBook({ url })}>
                <ExternalLinkIcon />
                Open in system app
              </button>
            )}
          </div>
        )}
        {status === 'ready' && (
          <>
            <button type="button" className={styles.pageHitLeft} aria-label="Previous" onClick={() => scrollPage(-1)} />
            <button type="button" className={styles.pageHitRight} aria-label="Next" onClick={() => scrollPage(1)} />
            <button
              type="button"
              className={styles.bookmarkFab}
              data-flash={bookmarkFlash ? 'true' : 'false'}
              title="Save place · mark as Reading"
              aria-label="Save place"
              onClick={() => persistRef.current({ toast: true })}
            >
              <BookmarkIcon filled={bookmarkFlash} />
            </button>
          </>
        )}
        <div className={styles.epubStage}>
          <div
            ref={scrollerRef}
            className={styles.fb2Host}
            data-ready={status === 'ready' ? 'true' : 'false'}
            onScroll={onScroll}
            dangerouslySetInnerHTML={status === 'ready' ? { __html: html } : undefined}
          />
        </div>
      </div>
    </Overlay>
  );
}

function SystemOpenPane({ title, url, onClose }: { title: string; url: string; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void openLocalBook({ url }).then((res) => {
      if (!res.ok) setError(res.error || 'Couldn’t open in system app');
    });
  }, [url]);

  return (
    <Overlay>
      <div className={styles.bar}>
        <button type="button" className={styles.backBtn} onClick={onClose}>
          <BackIcon />
          <span>Back to {title}</span>
        </button>
      </div>
      <div className={styles.systemPane}>
        <p className={styles.systemTitle}>Opening in system app…</p>
        <p className={styles.systemHint}>
          {error || 'This format isn’t readable in Control Center yet — your default ebook app should open.'}
        </p>
        <button type="button" className={styles.openExternal} onClick={() => void openLocalBook({ url })}>
          <ExternalLinkIcon />
          Open again
        </button>
      </div>
    </Overlay>
  );
}

function IframePane({ title, url, onClose }: { title: string; url: string; onClose: () => void }) {
  return (
    <Overlay>
      <div className={styles.bar}>
        <button type="button" className={styles.backBtn} onClick={onClose}>
          <BackIcon />
          <span>Back to {title}</span>
        </button>
        <a className={styles.openExternal} href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLinkIcon />
          Open in browser
        </a>
      </div>
      <iframe className={styles.frame} src={toEmbeddable(url)} title={title} />
    </Overlay>
  );
}

function EpubPane({
  title,
  url,
  local,
  onClose,
  bookId,
  initialCfi,
  onLocation,
}: BookReaderProps & { local: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<EpubRendition | null>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const spineRef = useRef(0);
  const bookIdRef = useRef(bookId);
  bookIdRef.current = bookId;
  const onLocationRef = useRef(onLocation);
  onLocationRef.current = onLocation;
  const navigateRef = useRef<(dir: 1 | -1) => void>(() => {});
  const persistRef = useRef<(opts?: { toast?: boolean }) => void>(() => {});

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [bookmarkFlash, setBookmarkFlash] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const hostEl: HTMLDivElement = host;

    let cancelled = false;
    let book: EpubBook | null = null;
    let rendition: EpubRendition | null = null;
    let ro: ResizeObserver | null = null;
    let scrollRoot: HTMLElement | null = null;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    let bannerTimer: ReturnType<typeof setTimeout> | undefined;
    let flashTimer: ReturnType<typeof setTimeout> | undefined;
    let savesAllowed = false;
    let ignoreScroll = false;
    let pendingRestore: number | null = null;

    function getScrollRoot(): HTMLElement | null {
      const container = hostEl.querySelector('.epub-container') as HTMLElement | null;
      if (container) return container;
      return (hostEl.querySelector('iframe')?.contentDocument?.scrollingElement as HTMLElement | null) || null;
    }

    function readScroll(): number {
      return Math.round(getScrollRoot()?.scrollTop || 0);
    }

    function writeScroll(y: number) {
      const root = getScrollRoot();
      if (!root) return;
      ignoreScroll = true;
      root.scrollTop = Math.max(0, Math.round(y));
      window.setTimeout(() => {
        ignoreScroll = false;
      }, 400);
    }

    function bindScrollRoot() {
      const root = getScrollRoot();
      if (!root || root === scrollRoot) return;
      if (scrollRoot) scrollRoot.removeEventListener('scroll', onScroll);
      scrollRoot = root;
      scrollRoot.addEventListener('scroll', onScroll, { passive: true });
    }

    function onScroll() {
      if (ignoreScroll || !savesAllowed) return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => persist(), 350);
    }

    function persist(opts?: { toast?: boolean; promote?: boolean }) {
      const id = bookIdRef.current;
      if (!id || !savesAllowed) return;

      bindScrollRoot();
      const pos: ReadingPos = { v: 1, spine: spineRef.current, scroll: readScroll() };

      if (!opts?.toast && !opts?.promote) {
        if (!isMeaningfulPos(pos)) return;
        const prior = pickBestPos(null, id);
        if (pos.scroll < 16 && prior && prior.scroll > 80 && prior.spine === pos.spine) return;
      }

      const encoded = encodePos(pos);
      writeLocalPos(id, pos);
      const root = getScrollRoot();
      const pct = bookRef.current
        ? approxProgress(bookRef.current, pos.spine, pos.scroll, root?.scrollHeight ?? 0)
        : undefined;
      if (pct != null) setProgressLabel(`${pct}%`);

      const promote = !!(opts?.toast || opts?.promote);
      onLocationRef.current?.(encoded, pct, promote ? { status: 'reading' } : undefined);

      clearTimeout(saveTimer);
      const write = () => {
        if (bookIdRef.current !== id) return;
        editBook(id, {
          reading_cfi: encoded,
          ...(pct != null ? { progress_pct: pct } : {}),
          ...(promote ? { status: 'reading' } : {}),
        }).catch(() => {
          if (opts?.toast) {
            setBanner('Couldn’t save — is the backend running?');
            clearTimeout(bannerTimer);
            bannerTimer = setTimeout(() => setBanner(null), 2800);
          }
        });
      };
      if (opts?.toast || opts?.promote) write();
      else saveTimer = setTimeout(write, 400);

      if (opts?.toast) {
        setBookmarkFlash(true);
        setBanner(pct != null ? `Reading · ${pct}% saved` : 'Moved to Reading · place saved');
        clearTimeout(flashTimer);
        clearTimeout(bannerTimer);
        flashTimer = setTimeout(() => setBookmarkFlash(false), 900);
        bannerTimer = setTimeout(() => setBanner(null), 2400);
      }
    }

    persistRef.current = persist;

    function scrollOrTurn(dir: 1 | -1) {
      const root = getScrollRoot();
      if (root) {
        const before = root.scrollTop;
        const step = Math.max(280, Math.floor(root.clientHeight * 0.88));
        root.scrollTop = Math.max(0, before + dir * step);
        window.setTimeout(() => {
          const after = root.scrollTop;
          const atEdge =
            dir > 0
              ? after + root.clientHeight >= root.scrollHeight - 8 || Math.abs(after - before) < 2
              : after <= 2 || Math.abs(after - before) < 2;
          if (atEdge && renditionRef.current) {
            void (dir > 0 ? renditionRef.current.next() : renditionRef.current.prev());
          }
          if (savesAllowed) persist();
        }, 50);
        return;
      }
      if (renditionRef.current) {
        void (dir > 0 ? renditionRef.current.next() : renditionRef.current.prev()).then(() => {
          if (savesAllowed) persist();
        });
      }
    }

    navigateRef.current = scrollOrTurn;

    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        scrollOrTurn(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        e.stopPropagation();
        scrollOrTurn(-1);
      }
    }

    async function mount() {
      setStatus('loading');
      setError(null);
      setBanner(null);
      savesAllowed = false;
      const fetchUrl = normalizeEbookUrl(url);
      try {
        const res = await fetch(fetchUrl);
        if (!res.ok) {
          const hint = (await res.text().catch(() => '')).slice(0, 120);
          throw new Error(loadErrorMessage(res.status, hint));
        }
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        if (buf.byteLength < 100) throw new Error('Ebook file is empty or unreadable');

        book = ePub(buf);
        bookRef.current = book;
        await book.ready;
        if (cancelled) return;

        const items = spineItems(book);
        if (!items.length) throw new Error('This EPUB has no readable sections');

        const resume = pickBestPos(initialCfi, bookId);
        spineRef.current = resume?.spine ?? resolveStartIndex(book);
        pendingRestore = resume && resume.scroll > 0 ? resume.scroll : null;

        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        if (cancelled) return;

        rendition = book.renderTo(hostEl, {
          width: '100%',
          height: '100%',
          flow: 'scrolled-doc',
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;

        rendition.hooks.content.register((contents: { document?: Document }) => {
          paintReaderStyles(contents.document);
          contents.document?.addEventListener('keydown', onKey, true);
          window.setTimeout(() => {
            bindScrollRoot();
            if (pendingRestore != null && pendingRestore > 0) writeScroll(pendingRestore);
          }, 0);
        });

        rendition.on('relocated', (location: { start?: { index?: number } }) => {
          if (typeof location?.start?.index === 'number') spineRef.current = location.start.index;
          bindScrollRoot();
          if (savesAllowed) persist();
        });

        ignoreScroll = true;
        await displaySpine(rendition, spineRef.current);
        if (cancelled) return;

        let ok = await waitForContent(hostEl);
        paintReaderStyles(hostEl.querySelector('iframe')?.contentDocument || undefined);

        // Resume landed on a blank/nav page — fall back to the cover/start.
        if (!ok && resume && spineRef.current !== 0) {
          spineRef.current = 0;
          pendingRestore = null;
          await displaySpine(rendition, 0);
          ok = await waitForContent(hostEl);
          paintReaderStyles(hostEl.querySelector('iframe')?.contentDocument || undefined);
        }

        // Still empty after waiting — open anyway (image covers / slow NAS).
        // Only hard-fail when the iframe never appeared at all.
        if (!hostEl.querySelector('iframe')) {
          throw new Error('Ebook opened but nothing rendered — try System app');
        }

        bindScrollRoot();

        if (pendingRestore != null && pendingRestore > 0) {
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          writeScroll(pendingRestore);
          await new Promise((r) => setTimeout(r, 150));
          if (Math.abs(readScroll() - pendingRestore) > 60) writeScroll(pendingRestore);
          await new Promise((r) => setTimeout(r, 100));
        }

        const restored = pendingRestore != null && pendingRestore > 40 && readScroll() > 40;
        if (restored) {
          markResumeSpot(hostEl.querySelector('iframe')?.contentDocument || undefined);
          setBanner('Picked up where you left off');
          bannerTimer = setTimeout(() => setBanner(null), 2800);
        }

        pendingRestore = null;
        savesAllowed = true;
        ignoreScroll = false;

        ro = new ResizeObserver(() => {
          if (!rendition) return;
          try {
            rendition.resize(Math.max(320, hostEl.clientWidth), Math.max(400, hostEl.clientHeight));
          } catch {
            /* ignore */
          }
          bindScrollRoot();
        });
        ro.observe(hostEl);

        setStatus('ready');
        hostEl.tabIndex = -1;
        hostEl.focus({ preventScroll: true });

        // Opening the reader moves Want → Reading immediately (don't wait for bookmark).
        // Only write a position blob when we actually restored or later scroll/bookmark.
        if (bookIdRef.current) {
          onLocationRef.current?.(
            encodePos({ v: 1, spine: spineRef.current, scroll: readScroll() }),
            undefined,
            { status: 'reading' },
          );
          editBook(bookIdRef.current, { status: 'reading' }).catch(() => {});
        }
        if (restored) persist();
      } catch (e) {
        if (cancelled) return;
        savesAllowed = true;
        setStatus('error');
        const msg = e instanceof Error ? e.message : 'Couldn’t open this EPUB';
        // Chromium often phrases network failures as "Failed to fetch" with 127.0.0.1 in console.
        setError(
          /failed to fetch|networkerror|load failed|connection aborted|remote.?disconnected/i.test(msg)
            ? 'Couldn’t load the ebook file — if this keeps happening, restart Control Center'
            : msg,
        );
      }
    }

    document.addEventListener('keydown', onKey, true);
    void mount();

    return () => {
      cancelled = true;
      document.removeEventListener('keydown', onKey, true);
      clearTimeout(saveTimer);
      clearTimeout(scrollTimer);
      clearTimeout(bannerTimer);
      clearTimeout(flashTimer);
      if (scrollRoot) scrollRoot.removeEventListener('scroll', onScroll);
      if (savesAllowed) persist();
      ro?.disconnect();
      try {
        rendition?.destroy();
      } catch {
        /* ignore */
      }
      try {
        book?.destroy();
      } catch {
        /* ignore */
      }
      renditionRef.current = null;
      bookRef.current = null;
      hostEl.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, bookId]);

  function go(dir: 1 | -1) {
    navigateRef.current(dir);
  }

  return (
    <Overlay>
      <div className={styles.bar}>
        <button type="button" className={styles.backBtn} onClick={onClose}>
          <BackIcon />
          <span>Back to {title}</span>
        </button>
        <div className={styles.barActions}>
          {banner && <span className={styles.resumeChip}>{banner}</span>}
          {progressLabel && !banner && <span className={styles.progressChip}>{progressLabel}</span>}
          <button
            type="button"
            className={styles.navBtn}
            disabled={status !== 'ready'}
            aria-label="Previous"
            onClick={(e) => {
              e.preventDefault();
              go(-1);
            }}
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            className={styles.navBtn}
            disabled={status !== 'ready'}
            aria-label="Next"
            onClick={(e) => {
              e.preventDefault();
              go(1);
            }}
          >
            <ChevronRightIcon />
          </button>
          {local ? (
            <button type="button" className={styles.openExternal} onClick={() => void openLocalBook({ url })} title="Open in system ebook app">
              <ExternalLinkIcon />
              System app
            </button>
          ) : (
            <a className={styles.openExternal} href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon />
              Open file
            </a>
          )}
        </div>
      </div>

      <div className={styles.epubShell}>
        {status === 'loading' && <p className={styles.epubStatus}>Loading ebook…</p>}
        {status === 'error' && (
          <div className={styles.systemPane}>
            <p className={styles.systemTitle}>Couldn’t open this EPUB</p>
            <p className={styles.systemHint}>{error}</p>
            {local && (
              <button type="button" className={styles.openExternal} onClick={() => void openLocalBook({ url })}>
                <ExternalLinkIcon />
                Open in system app
              </button>
            )}
          </div>
        )}
        {status === 'ready' && (
          <>
            <button
              type="button"
              className={styles.pageHitLeft}
              aria-label="Previous"
              onClick={(e) => {
                e.preventDefault();
                go(-1);
              }}
            />
            <button
              type="button"
              className={styles.pageHitRight}
              aria-label="Next"
              onClick={(e) => {
                e.preventDefault();
                go(1);
              }}
            />
            <button
              type="button"
              className={styles.bookmarkFab}
              data-flash={bookmarkFlash ? 'true' : 'false'}
              title="Save place · mark as Reading"
              aria-label="Save place"
              onClick={() => persistRef.current({ toast: true })}
            >
              <BookmarkIcon filled={bookmarkFlash} />
            </button>
          </>
        )}
        <div className={styles.epubStage}>
          <div ref={hostRef} className={styles.epubHost} data-ready={status === 'ready' ? 'true' : 'false'} />
        </div>
      </div>
    </Overlay>
  );
}
