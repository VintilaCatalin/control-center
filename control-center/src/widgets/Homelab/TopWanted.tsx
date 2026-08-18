import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import type { PopularData, PopularItem } from '../../api/types';
import { ArtTile } from '../../primitives/ArtTile/ArtTile';
import { duration, ease } from '../../tokens/motion';
import styles from './TopWanted.module.css';

interface TopWantedProps {
  data?: PopularData;
}

const STATUS_LABEL: Record<PopularItem['status'], string> = {
  unknown: 'Wanted',
  pending: 'Pending',
  processing: 'Processing',
  partial: 'Partial',
  available: 'On server',
};

const STATUS_CLASS: Record<PopularItem['status'], string> = {
  unknown: styles.statusUnknown,
  pending: styles.statusPending,
  processing: styles.statusProcessing,
  partial: styles.statusPartial,
  available: styles.statusAvailable,
};

type Kind = 'movies' | 'shows';

// What the wider world wants right now (TMDB popularity, via Overseerr's
// own /discover charts), each title's own-server availability attached -
// never this house's personal request history. A tab switch between
// Movies and TV, not two stacked rows fighting for the same height - one
// ranked leaderboard at a time, at full poster size.
export function TopWanted({ data }: TopWantedProps) {
  const [tab, setTab] = useState<Kind>('movies');

  if (!data?.configured) {
    return (
      <div className={styles.state}>
        <span className={styles.stateTitle}>Overseerr isn't connected</span>
        <span className={styles.stateBody}>Add an Overseerr URL and API key in Settings to see what's trending.</span>
      </div>
    );
  }

  const items = tab === 'movies' ? data.movies : data.shows;

  return (
    <div className={styles.panel}>
      <div className={styles.tabs}>
        <button type="button" className={[styles.tab, tab === 'movies' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('movies')}>
          Movies
        </button>
        <button type="button" className={[styles.tab, tab === 'shows' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('shows')}>
          TV Shows
        </button>
      </div>

      <div className={styles.body}>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            className={styles.scroll}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: duration.base, ease }}
          >
            {items.length === 0 ? (
              <span className={styles.emptyRow}>{data.error || 'Nothing to show yet.'}</span>
            ) : (
              items.map((item) => (
                <a className={styles.slot} key={item.tmdb} href={item.url} target="_blank" rel="noopener noreferrer">
                  <ArtTile
                    aspect="portrait"
                    className={styles.art}
                    src={item.poster}
                    alt={item.title}
                    fallback={<span className={styles.fallbackGlyph}>★</span>}
                    badge={<span className={styles.rank}>#{item.rank}</span>}
                    ribbon={<span className={[styles.status, STATUS_CLASS[item.status]].join(' ')}>{STATUS_LABEL[item.status]}</span>}
                  />
                  <div className={styles.meta}>
                    <span className={styles.itemTitle}>{item.title}</span>
                    <span className={styles.itemSub}>
                      {item.year}
                      {item.popularity != null ? ` · ${Math.round(item.popularity)} pop.` : ''}
                    </span>
                  </div>
                </a>
              ))
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
