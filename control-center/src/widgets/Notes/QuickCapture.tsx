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

const CAPTURE_FOLDER = 'Quick Notes';

// capture -> save -> continue: one field, autofocused, Enter to save,
// the first line becomes the title the same way new_note() already
// seeds every note's opening heading. Chrome comes from the shared
// Overlay now (same surface/radius/motion as Search and Tasks) -
// only the body content is bespoke to this interaction.
export function QuickCapture({ open, onClose, onCreated }: QuickCaptureProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setText('');
  }, [open]);

  async function handleCapture() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const firstLine = trimmed.split('\n')[0].replace(/^#+\s*/, '').slice(0, 80).trim();
      const rest = trimmed.slice(trimmed.indexOf('\n') + 1).trim();
      const res = await newNote(firstLine || 'Quick note', CAPTURE_FOLDER);
      if (!res.ok || !res.rel) return;
      if (rest) await saveNote(res.rel, `# ${firstLine || 'Quick note'}\n\n${rest}\n`);
      onCreated(res.rel);
      onClose();
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
          <span>Enter to save · Shift+Enter for a new line</span>
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
