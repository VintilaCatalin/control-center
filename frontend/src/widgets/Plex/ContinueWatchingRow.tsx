import { motion } from 'framer-motion';
import { launchTarget } from '../../api/actions/launch';
import type { PlexItem } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import { duration, ease } from '../../tokens/motion';
import { InfoIcon, MovieIcon, PlayIcon } from './icons';
import styles from './ContinueWatchingRow.module.css';

export interface ContinueWatchingEntry {
  item: PlexItem;
  live?: boolean;
}

interface ContinueWatchingRowProps {
  entries: ContinueWatchingEntry[];
  onOpenDetail: (item: PlexItem) => void;
}

function episodeLabel(item: PlexItem): string | null {
  if (item.type !== 'episode') return null;
  if (item.parentIndex != null && item.index != null) return `S${item.parentIndex} · E${item.index}`;
  if (item.index != null) return `E${item.index}`;
  return null;
}

function formatRemaining(durationMs?: number | null, offsetMs?: number | null): string | null {
  if (!durationMs || durationMs <= 0) return null;
  const remaining = Math.max(0, durationMs - (offsetMs ?? 0));
  const mins = Math.round(remaining / 60000);
  if (mins <= 0) return null;
  if (mins < 60) return `${mins}m left`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
}

function typeBadge(type?: string): string | null {
  if (type === 'movie') return 'Movie';
  if (type === 'show' || type === 'episode') return 'Series';
  return null;
}

// One large featured card + two smaller supporting cards, all visible at
// once - a fixed-height row (all three cards share the same height, only
// width differs), matching the reference composition, not a single
// full-width hero and not a one-at-a-time carousel. The featured slot
// always shows entries[0] (a live session outranks Continue Watching for
// it, see PlexHome); everything else scrolls horizontally two-at-a-time
// in the supporting lane, so a 4th/5th/6th item is still just one scroll
// away without collapsing the 1-large+2-small hierarchy.
export function ContinueWatchingRow({ entries, onOpenDetail }: ContinueWatchingRowProps) {
  if (entries.length === 0) return null;
  const [featured, ...supporting] = entries;

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>Continue Watching</h2>
      <div className={styles.row}>
        <FeaturedCard entry={featured} onOpenDetail={onOpenDetail} />
        {supporting.length > 0 ? (
          <div className={styles.supportingScroll}>
            {supporting.map((entry, i) => (
              <div className={styles.supportingSlot} key={entry.item.ratingKey ?? `cw-${i}`}>
                <SupportingCard entry={entry} onOpenDetail={onOpenDetail} />
              </div>
            ))}
          </div>
        ) : (
          // Nothing to show beside the featured card - a quiet message
          // filling the space intentionally, not another bordered card
          // pretending to be a second tile.
          <div className={styles.supportingEmpty}>Nothing else in progress right now.</div>
        )}
      </div>
    </section>
  );
}

function FeaturedCard({ entry, onOpenDetail }: { entry: ContinueWatchingEntry; onOpenDetail: (item: PlexItem) => void }) {
  const { item, live } = entry;
  const title = item.type === 'episode' ? item.show || item.title : item.title;
  const episode = episodeLabel(item);
  const badge = typeBadge(item.type);
  const progress =
    item.duration && item.duration > 0 && item.viewOffset
      ? Math.min(100, Math.max(0, (item.viewOffset / item.duration) * 100))
      : 0;
  const remaining = formatRemaining(item.duration, item.viewOffset);
  const canResume = !live && !!item.launch;

  function handleResume() {
    if (item.launch) launchTarget(item.launch);
  }

  return (
    <motion.div
      className={styles.featured}
      whileHover={{ y: -3, transition: { duration: duration.base, ease } }}
      onClick={canResume ? handleResume : () => onOpenDetail(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && (canResume ? handleResume() : onOpenDetail(item))}
    >
      <ArtTile
        aspect="landscape"
        className={styles.artFill}
        src={item.backdrop || item.art}
        alt={title ?? 'Untitled'}
        fallback={<MovieIcon />}
      />
      <div className={styles.featuredShade} />

      {progress > 0 && (
        <div className={styles.featuredProgress}>
          <div className={styles.featuredProgressFill} style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className={styles.featuredMeta}>
        <div className={styles.featuredEyebrowRow}>
          {live && <span className={styles.liveDot} />}
          {live ? (
            <span className={styles.featuredEyebrow}>Now Playing</span>
          ) : (
            badge && <span className={styles.typeBadge}>{badge}</span>
          )}
        </div>
        <span className={styles.featuredTitle}>{episode ? item.title : title}</span>
        <div className={styles.featuredMetaRow}>
          {episode && item.show && <span className={styles.featuredMetaItem}>{item.show}</span>}
          {episode && <span className={styles.featuredMetaItem}>{episode}</span>}
          {!episode && item.year && <span className={styles.featuredMetaItem}>{item.year}</span>}
          {remaining && <span className={styles.featuredMetaItem}>{remaining}</span>}
        </div>
        {item.summary && <p className={styles.featuredSummary}>{item.summary}</p>}
        <div className={styles.featuredActions}>
          {canResume && (
            <button
              type="button"
              className={styles.resumeBtn}
              onClick={(e) => {
                e.stopPropagation();
                handleResume();
              }}
            >
              <PlayIcon />
              {progress > 2 ? 'Resume' : 'Play'}
            </button>
          )}
          {item.ratingKey && (
            <button
              type="button"
              className={styles.infoBtn}
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail(item);
              }}
            >
              <InfoIcon />
              More Info
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// A quieter treatment than the featured card - artwork, title, brief
// context and progress, Resume on click. No separate Play/Info button
// row (there isn't room at this size, and the whole card already
// resumes on click, matching the reference's simpler supporting-card
// content).
function SupportingCard({ entry, onOpenDetail }: { entry: ContinueWatchingEntry; onOpenDetail: (item: PlexItem) => void }) {
  const { item, live } = entry;
  const title = item.type === 'episode' ? item.show || item.title : item.title;
  const sub = episodeLabel(item) || (item.year ? String(item.year) : null);
  const progress =
    item.duration && item.duration > 0 && item.viewOffset
      ? Math.min(100, Math.max(0, (item.viewOffset / item.duration) * 100))
      : 0;
  const canResume = !live && !!item.launch;

  function handleActivate() {
    if (canResume && item.launch) launchTarget(item.launch);
    else onOpenDetail(item);
  }

  return (
    <motion.div
      className={styles.supporting}
      whileHover={{ y: -3, transition: { duration: duration.base, ease } }}
      onClick={handleActivate}
      role="button"
      tabIndex={0}
      title={canResume ? `Resume ${title ?? ''}` : title ?? undefined}
      onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
    >
      <ArtTile aspect="landscape" className={styles.artFill} src={item.art} alt={title ?? 'Untitled'} fallback={<MovieIcon />} />
      <div className={styles.supportingShade} />

      <div className={styles.supportingPlay}>
        <PlayIcon />
      </div>

      {progress > 0 && (
        <div className={styles.supportingProgress}>
          <div className={styles.supportingProgressFill} style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className={styles.supportingMeta}>
        <span className={styles.supportingTitle}>{title}</span>
        {sub && <span className={styles.supportingSub}>{sub}</span>}
      </div>
    </motion.div>
  );
}
