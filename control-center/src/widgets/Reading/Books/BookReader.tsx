import { motion } from 'framer-motion';
import { duration, ease } from '../../../tokens/motion';
import { BackIcon, ExternalLinkIcon } from '../icons';
import styles from './BookReader.module.css';

interface BookReaderProps {
  title: string;
  url: string;
  onClose: () => void;
}

// A Google Drive "share" link 404s in an iframe (X-Frame-Options); its
// own "preview" path embeds fine. Direct PDF/EPUB URLs and most personal
// servers work as pasted - this only rewrites the one common case that
// wouldn't otherwise.
function toEmbeddable(url: string): string {
  const drive = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  return drive ? `https://drive.google.com/file/d/${drive[1]}/preview` : url;
}

// The reason Books has a file_url at all: an actual reader, not just a
// progress tracker. Simple by design - an iframe pointed at whatever was
// pasted, plus an always-visible "Open in browser" escape hatch for
// anything that can't be framed (some servers/CORS setups block it
// outright, and there's no reliable way to detect that in advance).
export function BookReader({ title, url, onClose }: BookReaderProps) {
  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: duration.base, ease }}
    >
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
    </motion.div>
  );
}
