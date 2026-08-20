import { useEffect, useState } from 'react';
import { newNote, saveNote } from '../../api/actions/notes';
import { Overlay } from '../../primitives/Overlay/Overlay';
import { CaptureIcon } from './icons';
import styles from './QuickCapture.module.css';

interface QuickCaptureProps {
  open: boolean;
  onClose: () => void;
  onCreated: (rel: string) => void;
}

// Quick Capture behaves like an inbox. Root notes surface in Unfiled and
// can be organised later without hiding them in a synthetic folder.
const CAPTURE_FOLDER = '';

// capture -> save -> continue: one field, autofocused, Enter to save,
// the first line becomes the title while the remaining lines become the
// body. Chrome comes from the shared
// Overlay now (same surface/radius/motion as Search and Tasks) -
// only the body content is bespoke to this interaction.
export function QuickCapture({ open, onClose, onCreated }: QuickCaptureProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setText(''); setError(null); }
  }, [open]);

  async function handleCapture() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const firstLine = trimmed.split('\n')[0].replace(/^#+\s*/, '').slice(0, 80).trim();
      const rest = trimmed.slice(trimmed.indexOf('\n') + 1).trim();
      const res = await newNote(firstLine || 'Quick note', CAPTURE_FOLDER);
      if (!res.ok || !res.rel) throw new Error(res.error ?? "Couldn't create this note");
      if (rest) {
        const saved = await saveNote(res.rel, `${rest}\n`);
        if (!saved.ok) throw new Error("Couldn't save this note");
      }
      onCreated(res.rel);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save this note");
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCapture();
    }
  }

  return (
    <Overlay
      open={open}
      onClose={onClose}
      title="Quick Capture"
      icon={<CaptureIcon />}
      footer={
        <div className={styles.hint}>
          <span>{error ?? 'Enter to save · Shift+Enter for a new line'}</span>
          {busy && <span>Saving…</span>}
        </div>
      }
    >
      <textarea
        className={styles.field}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="What's on your mind?"
        autoFocus
      />
    </Overlay>
  );
}
