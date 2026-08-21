import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { toggleRaindropSave } from '../../api/actions/library';
import type { ReadingItem } from '../../api/types';
import { duration, ease } from '../../tokens/motion';
import { BackIcon, ExternalLinkIcon } from './icons';
import { readingThumbUrl } from './media';
import { SaveButton } from './SaveButton';
import { relativeTime } from './time';
import { extractYouTubeId } from './youtube';
import styles from './VideoDetail.module.css';

interface VideoDetailProps {
  item: ReadingItem;
  onClose: () => void;
}

// Video's own detail surface, not the article reader with an iframe
// dropped in: the player is the hero (autoplays on open, since a click
// already expressed intent to watch), title/channel/description sit
// below it as a description panel rather than an editorial reading
// column - closer to how a video app frames a video, without borrowing
// Plex's poster-detail chrome (no backdrop art, no rating/genre chips).
export function VideoDetail({ item, onClose }: VideoDetailProps) {
  const [saved, setSaved] = useState(item.saved);
  const videoId = extractYouTubeId(item.url);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    setSaved(item.saved);
  }, [item.id, item.saved]);

  function handleToggleSave() {
    const next = !saved;
    setSaved(next);
    toggleRaindropSave(
      { url: item.url, title: item.title, excerpt: item.blurb, cover: item.thumb },
      next,
      'youtube',
    ).catch(() => setSaved(!next));
  }

  const initial = item.source_label.trim().charAt(0).toUpperCase() || '?';

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: duration.base, ease }}
    >
      <div className={styles.scroll}>
        <div className={styles.bar}>
          <button type="button" className={styles.backBtn} onClick={onClose} aria-label="Back to Reading">
            <BackIcon />
            <span>Back to Reading</span>
          </button>
          <div className={styles.barActions}>
            <a className={styles.openBrowserBtn} href={item.url} target="_blank" rel="noopener noreferrer" title="Open in browser" aria-label="Open in browser">
              <ExternalLinkIcon />
            </a>
            <SaveButton saved={saved} onToggle={handleToggleSave} inline />
          </div>
        </div>

        <div className={styles.column}>
          <div className={styles.player}>
            {videoId ? (
              <iframe
                className={styles.iframe}
                src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
                title={item.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              item.thumb && <img className={styles.playerFallbackImg} src={readingThumbUrl(item.thumb)} alt="" />
            )}
          </div>

          <h1 className={styles.title}>{item.title}</h1>

          <div className={styles.channelRow}>
            <span className={styles.avatar} aria-hidden="true">
              {initial}
            </span>
            <span className={styles.channelText}>
              <span className={styles.channelName}>{item.source_label}</span>
              <span className={styles.published}>{relativeTime(item.published)}</span>
            </span>
          </div>

          {item.blurb && <p className={styles.description}>{item.blurb}</p>}
        </div>
      </div>
    </motion.div>
  );
}
