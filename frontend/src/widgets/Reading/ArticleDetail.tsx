import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { fetchArticleText, saveItem } from '../../api/actions/reading';
import type { ReadingItem } from '../../api/types';
import { Skeleton } from '../../primitives/Skeleton/Skeleton';
import { duration, ease } from '../../tokens/motion';
import { BackIcon, ClockIcon, ExternalLinkIcon } from './icons';
import { readingThumbUrl } from './media';
import { SaveButton } from './SaveButton';
import { TOPIC_LABELS } from './topics';
import styles from './ArticleDetail.module.css';

interface ArticleDetailProps {
  item: ReadingItem;
  onClose: () => void;
}

function formatDate(published: number | null): string | null {
  if (!published) return null;
  return new Date(published * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// The premium editorial reading experience the redesign brief calls for -
// deliberately not DocumentView's shape (no toolbar, no edit mode, no
// folder-vault chrome): a full-bleed hero, one comfortable reading
// column, and nothing else competing for attention. Opens instantly with
// whatever the feed already had (thumb/title/blurb) and hydrates with
// trafilatura's full text in the background - see fetchArticleText.
export function ArticleDetail({ item, onClose }: ArticleDetailProps) {
  const [extraction, setExtraction] = useState<{ ok: boolean; html?: string; word_count?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(item.saved);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    setSaved(item.saved);
    setExtraction(null);
    setLoading(true);
    let cancelled = false;
    // Read-state is already marked the instant a card is clicked (see
    // ReadingFeed's handleOpen, the one chokepoint every card routes
    // through) - not repeated here.
    fetchArticleText(item.id, item.url).then(
      (res) => {
        if (cancelled) return;
        setExtraction(res.ok ? { ok: true, html: res.html, word_count: res.word_count } : { ok: false });
        setLoading(false);
      },
      () => {
        if (!cancelled) {
          setExtraction({ ok: false });
          setLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  function handleToggleSave() {
    const next = !saved;
    setSaved(next);
    saveItem(item.id, next).catch(() => {});
  }

  const topic = item.topic in TOPIC_LABELS ? TOPIC_LABELS[item.topic as keyof typeof TOPIC_LABELS] : item.topic;
  const dateLabel = formatDate(item.published);
  const readMinutes = extraction?.ok && extraction.word_count ? Math.max(1, Math.round(extraction.word_count / 200)) : item.read_minutes;

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: duration.base, ease }}
    >
      {/* Siblings of .scroll, not children of .hero - .hero only ever
          occupies the top of the scrolling column, so anything positioned
          relative to it scrolls away with the article. These stay fixed
          to the overlay itself (which fills the viewport) so they're
          reachable the whole time you're reading, not just at the top. */}
      <button type="button" className={styles.backBtn} onClick={onClose} aria-label="Back to Reading">
        <BackIcon />
        <span>Back to Reading</span>
      </button>
      <div className={styles.heroActions}>
        <a
          className={styles.openBrowserBtn}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in browser"
          aria-label="Open in browser"
        >
          <ExternalLinkIcon />
        </a>
        <SaveButton saved={saved} onToggle={handleToggleSave} inline />
      </div>

      <div className={styles.scroll}>
        <div className={[styles.hero, item.thumb ? styles.heroWithImage : styles.heroBar].join(' ')}>
          {item.thumb && (
            <>
              <img className={styles.heroImg} src={readingThumbUrl(item.thumb)} alt="" />
              <div className={styles.heroShade} />
            </>
          )}
        </div>

        <div className={[styles.column, item.thumb ? styles.columnOverImage : styles.columnFlat].join(' ')}>
          <span className={styles.kicker}>{topic}</span>
          <h1 className={styles.title}>{item.title}</h1>

          <div className={styles.byline}>
            <span className={styles.source}>{item.source_label}</span>
            {dateLabel && (
              <>
                <span className={styles.dot}>·</span>
                <span>{dateLabel}</span>
              </>
            )}
            {readMinutes ? (
              <>
                <span className={styles.dot}>·</span>
                <span className={styles.readTime}>
                  <ClockIcon />
                  {readMinutes} min read
                </span>
              </>
            ) : null}
          </div>

          {extraction?.ok && extraction.html ? (
            <div className={styles.articleBody} dangerouslySetInnerHTML={{ __html: extraction.html }} />
          ) : (
            <>
              {item.blurb && <p className={styles.summary}>{item.blurb}</p>}
              {loading ? (
                <div className={styles.skeletons}>
                  <Skeleton width="100%" height={15} />
                  <Skeleton width="92%" height={15} />
                  <Skeleton width="96%" height={15} />
                  <Skeleton width="70%" height={15} />
                </div>
              ) : (
                <div className={styles.fallback}>
                  <p className={styles.fallbackNote}>
                    The full article couldn't be pulled in here - read it on the original site instead.
                  </p>
                  <a className={styles.sourceLink} href={item.url} target="_blank" rel="noopener noreferrer">
                    Read on {item.domain || item.source_label} ↗
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
