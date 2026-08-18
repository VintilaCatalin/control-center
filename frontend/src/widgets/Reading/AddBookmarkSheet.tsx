import { useEffect, useState } from 'react';
import { addBookmark } from '../../api/actions/reading';
import type { ReadingSource } from '../../api/types';
import { Sheet } from '../../primitives/Sheet/Sheet';
import { TOPIC_LABELS, TOPIC_ORDER } from './topics';
import styles from './AddBookmarkSheet.module.css';

interface AddBookmarkSheetProps {
  open: boolean;
  onClose: () => void;
}

// Raindrop.io's core move: paste a link, get a card back. The backend
// fetches the page once and pulls title/image/description out of it
// (server.py's add_bookmark()) - there's nothing else to fill in here.
export function AddBookmarkSheet({ open, onClose }: AddBookmarkSheetProps) {
  const [url, setUrl] = useState('');
  const [topic, setTopic] = useState<ReadingSource['topic']>('interesting');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setUrl('');
      setTopic('interesting');
      setStatus(null);
    }
  }, [open]);

  async function handleAdd() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setStatus('Fetching…');
    const res = await addBookmark(trimmed, topic).catch(() => ({ ok: false, error: 'Failed to add' }));
    setBusy(false);
    if (res.ok) {
      onClose();
    } else {
      setStatus(res.error || 'Failed to add');
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add a bookmark" subtitle="Paste a link - we'll pull the title, image and a summary in.">
      <div className={styles.field}>
        <input
          type="text"
          className={styles.input}
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          autoFocus
        />
      </div>
      <div className={styles.field}>
        <select className={styles.topicSelect} value={topic} onChange={(e) => setTopic(e.target.value as ReadingSource['topic'])}>
          {TOPIC_ORDER.map((t) => (
            <option key={t} value={t}>
              {TOPIC_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className={styles.primaryBtn} onClick={handleAdd} disabled={!url.trim() || busy}>
        {busy ? 'Fetching…' : 'Add bookmark'}
      </button>
      {status && <span className={styles.hint}>{status}</span>}
    </Sheet>
  );
}
