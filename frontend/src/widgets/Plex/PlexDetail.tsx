import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { fetchPlexItem } from '../../api/actions/plex';
import { launchTarget } from '../../api/actions/launch';
import type { PlexItem, PlexItemDetail } from '../../api/types';
import { duration, ease } from '../../tokens/motion';
import { BackIcon, PlayIcon } from './icons';
import styles from './PlexDetail.module.css';

interface PlexDetailProps {
  item: PlexItem;
  onClose: () => void;
}

function formatDuration(ms?: number | null): string | null {
  if (!ms || ms <= 0) return null;
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// The rich detail surface the product spec calls for: selecting a
// poster lands here, not an immediate launch. `item` (from whatever list
// row was clicked) paints instantly; plex_item_detail() then fills in
// summary/genres/backdrop/rating - fields the snapshot poll deliberately
// never carries per-item across every library (see api/types.ts).
export function PlexDetail({ item, onClose }: PlexDetailProps) {
  const [detail, setDetail] = useState<PlexItemDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // The page behind this takeover keeps its own document flow (Home's
  // rows are still mounted, just visually covered) - lock body scroll
  // while open so there's no way to scroll the page underneath into
  // view, on top of the fixed positioning already covering it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setLoading(true);
    if (!item.ratingKey) {
      setLoading(false);
      return;
    }
    fetchPlexItem(item.ratingKey).then(
      (d) => {
        if (!cancelled) {
          setDetail(d.error ? null : d);
          setLoading(false);
        }
      },
      () => !cancelled && setLoading(false),
    );
    return () => {
      cancelled = true;
    };
  }, [item.ratingKey]);

  const title = item.type === 'episode' ? item.show || item.title : item.title;
  const episodeTitle = item.type === 'episode' ? item.title : null;
  const backdrop = detail?.backdrop || detail?.art || item.art;
  const summary = detail?.summary;
  const genres = detail?.genres ?? [];
  const year = detail?.year ?? item.year;
  const durationLabel = formatDuration(detail?.duration ?? item.duration);
  const launch = detail?.launch ?? item.launch;
  const viewOffset = detail?.viewOffset ?? item.viewOffset;
  const totalDuration = detail?.duration ?? item.duration;
  const progress = totalDuration && viewOffset ? Math.min(100, Math.max(0, (viewOffset / totalDuration) * 100)) : 0;
  const isResume = progress > 2;

  return (
    <motion.div
      className={styles.detail}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: duration.base, ease }}
    >
      <div className={styles.backdrop}>
        {backdrop && <img className={styles.backdropImg} src={backdrop} alt="" />}
        <div className={styles.shade} />

        <button type="button" className={styles.backBtn} onClick={onClose} aria-label="Back">
          <BackIcon />
        </button>

        <div className={styles.content}>
          {item.type !== 'episode' && item.art && (
            <div className={styles.poster}>
              <img src={item.art} alt="" />
            </div>
          )}

          <div className={styles.info}>
          {item.show && item.type === 'episode' && <span className={styles.eyebrow}>{item.show}</span>}
          <h1 className={styles.title}>{episodeTitle || title}</h1>

          <div className={styles.metaRow}>
            {year && <span className={styles.metaItem}>{year}</span>}
            {durationLabel && (
              <>
                <span className={styles.dot} />
                <span className={styles.metaItem}>{durationLabel}</span>
              </>
            )}
            {detail?.contentRating && (
              <>
                <span className={styles.dot} />
                <span className={styles.badge}>{detail.contentRating}</span>
              </>
            )}
            {detail?.rating != null && (
              <>
                <span className={styles.dot} />
                <span className={styles.metaItem}>★ {detail.rating.toFixed(1)}</span>
              </>
            )}
          </div>

          {genres.length > 0 && (
            <div className={styles.genres}>
              {genres.map((g) => (
                <span key={g} className={styles.genre}>
                  {g}
                </span>
              ))}
            </div>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.playBtn}
              disabled={!launch}
              onClick={() => launch && launchTarget(launch)}
            >
              <PlayIcon />
              {isResume ? 'Resume' : 'Play'}
            </button>

            {progress > 0 && (
              <div className={styles.progressWrap}>
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                </div>
                <span className={styles.progressLabel}>{Math.round(progress)}%</span>
              </div>
            )}
          </div>

          {summary && <p className={styles.summary}>{summary}</p>}
          {!summary && loading && <p className={styles.summary}>Loading details…</p>}

          {detail?.studio && <span className={styles.studio}>{detail.studio}</span>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
