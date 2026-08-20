import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { launchTarget } from '../../api/actions/launch';
import type { LibraryItem } from '../../api/types';
import { duration, ease } from '../../tokens/motion';
import { BackIcon } from '../../shell/icons';
import { ExternalLinkIcon, StarIcon } from './icons';
import { formatSavedDate } from './utils';
import styles from './LibraryDetail.module.css';

interface LibraryDetailProps {
  item: LibraryItem;
  onClose: () => void;
}

export function LibraryDetail({ item, onClose }: LibraryDetailProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function handleOpen() {
    if (item.url) launchTarget(item.url).catch(() => window.open(item.url, '_blank', 'noopener'));
  }

  const date = formatSavedDate(item.created);

  return createPortal(
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: duration.base, ease }}
    >
      <button type="button" className={styles.backBtn} onClick={onClose}>
        <BackIcon />
        <span>Back to Library</span>
      </button>

      <div className={styles.actions}>
        <button type="button" className={styles.openBtn} onClick={handleOpen}>
          <ExternalLinkIcon />
          Open link
        </button>
      </div>

      <div className={styles.hero}>
        {item.cover && <img src={item.cover} alt="" />}
        <div className={styles.heroShade} />
      </div>

      <div className={styles.panel}>
        <span className={styles.eyebrow}>{item.domain || 'Saved link'}{date ? ` · ${date}` : ''}</span>
        <h1 className={styles.title}>{item.title}</h1>
        <p className={styles.meta}>{item.url}</p>
        {item.excerpt && <p className={styles.excerpt}>{item.excerpt}</p>}
        {item.important && (
          <p className={styles.favorite}>
            <StarIcon filled />
            Favorite in Raindrop
          </p>
        )}
        {item.tags.length > 0 && (
          <div className={styles.tags}>
            {item.tags.map((tag) => (
              <span key={tag} className={styles.tag}>{tag}</span>
            ))}
          </div>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}
