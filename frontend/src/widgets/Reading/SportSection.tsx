import type { ReadingItem } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import { readingThumbUrl } from './media';
import { SaveButton } from './SaveButton';
import { relativeTime } from './time';
import styles from './SportSection.module.css';

interface SportSectionProps {
  heading?: string;
  items: ReadingItem[];
  onOpen: (item: ReadingItem) => void;
  onToggleSave: (item: ReadingItem) => void;
  onDismiss?: (item: ReadingItem) => void;
}

const FRESH_WINDOW_SECONDS = 2 * 60 * 60;

function isFresh(published: number | null): boolean {
  return !!published && Date.now() / 1000 - published < FRESH_WINDOW_SECONDS;
}

// Most news CMSes (this app's own webpage extractor included) structure
// article URLs as /category/subcategory/slug - a real taxonomy the site
// itself declares, not a guess. "digisport.ro" tells you nothing; "Fotbal
// · Liga 1" (pulled straight from /fotbal/liga-1/...) is the genuine
// competition/category label the redesign asked for, without inventing
// team/player metadata the extractor never produced. Falls back to the
// domain only when a URL doesn't have that shape.
function categoryLabel(item: ReadingItem): string {
  try {
    const segments = new URL(item.url).pathname.split('/').filter(Boolean);
    const words = segments.slice(0, 2).map((s) => s.replace(/-/g, ' ')).map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase()));
    if (words.length >= 2) return words.join(' · ');
    if (words.length === 1) return words[0];
  } catch {
    /* relative or malformed url - fall through */
  }
  return item.domain || item.source_label;
}

// A full rebuild, not a palette swap on the article-card template every
// other topic uses: a two-tier hero (one large lead + two stacked
// runners-up, genuinely different sizes, not the same card scaled) then a
// dense horizontal ticker for everything else - the fast-scanning,
// varied-composition rhythm real sports pages use, not a uniform grid.
export function SportSection({ heading, items, onOpen, onToggleSave, onDismiss }: SportSectionProps) {
  if (items.length === 0) return null;
  const [lead, ...rest] = items;
  const runners = rest.slice(0, 2);
  const ticker = rest.slice(2);

  return (
    <section className={styles.section}>
      {heading && (
        <h2 className={styles.heading}>
          <span className={styles.dot} />
          {heading}
        </h2>
      )}

      <div className={styles.hero}>
        <SportCard item={lead} size="lead" onOpen={onOpen} onToggleSave={onToggleSave} onDismiss={onDismiss} />
        {runners.length > 0 && (
          <div className={styles.runners}>
            {runners.map((item) => (
              <SportCard key={item.id} item={item} size="runner" onOpen={onOpen} onToggleSave={onToggleSave} onDismiss={onDismiss} />
            ))}
          </div>
        )}
      </div>

      {ticker.length > 0 && (
        <div className={styles.ticker}>
          {ticker.map((item, i) => (
            <button type="button" key={item.id} className={styles.tickerCard} onClick={() => onOpen(item)}>
              <span className={styles.tickerRank}>{i + 3}</span>
              {item.thumb ? (
                <ArtTile aspect="square" src={readingThumbUrl(item.thumb)} alt="" fallback={null} className={styles.tickerArt} />
              ) : (
                <span className={styles.tickerFallback} />
              )}
              <span className={styles.tickerText}>
                <span className={styles.tickerCategory}>{categoryLabel(item)}</span>
                <span className={styles.tickerTitle}>{item.title}</span>
                <span className={styles.tickerMeta}>
                  {isFresh(item.published) && <span className={styles.freshDot} />}
                  {relativeTime(item.published)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

interface SportCardProps {
  item: ReadingItem;
  size: 'lead' | 'runner';
  onOpen: (item: ReadingItem) => void;
  onToggleSave: (item: ReadingItem) => void;
  onDismiss?: (item: ReadingItem) => void;
}

function SportCard({ item, size, onOpen, onToggleSave, onDismiss }: SportCardProps) {
  const fresh = isFresh(item.published);
  return (
    <article className={size === 'lead' ? styles.lead : styles.runner}>
      <button type="button" className={styles.media} onClick={() => onOpen(item)}>
        {item.thumb ? (
          <ArtTile aspect="landscape" src={readingThumbUrl(item.thumb)} alt={item.title} fallback={null} className={styles.art} />
        ) : (
          <span className={styles.fallback} />
        )}
        <span className={styles.scrim} />
        <span className={styles.cardBody}>
          <span className={styles.tag}>{categoryLabel(item)}</span>
          <span className={size === 'lead' ? styles.leadTitle : styles.runnerTitle}>{item.title}</span>
          <span className={styles.meta}>
            {fresh && <span className={styles.freshDot} />}
            {relativeTime(item.published)}
          </span>
        </span>
      </button>
      <div className={styles.actions}>
        <SaveButton saved={item.saved} onToggle={() => onToggleSave(item)} small inline />
        {onDismiss && (
          <button type="button" className={styles.dismissBtn} onClick={() => onDismiss(item)} title="Not interested">
            ×
          </button>
        )}
      </div>
    </article>
  );
}
