import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { duration, ease } from '../../tokens/motion';
import { GLYPH_IDS, GLYPH_LABELS, GlyphIcon } from './glyphs';
import styles from './GlyphPicker.module.css';

interface GlyphPickerProps {
  open: boolean;
  x: number;
  y: number;
  value?: string;
  onChange: (icon: string) => void;
  onClose: () => void;
}

export function GlyphPicker({ open, x, y, value, onChange, onClose }: GlyphPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const pointer = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', pointer);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', pointer); document.removeEventListener('keydown', key); };
  }, [open, onClose]);

  const left = Math.max(10, Math.min(x, window.innerWidth - 300));
  const top = Math.max(10, Math.min(y, window.innerHeight - 390));
  const preview = hovered || value || 'folder';
  return createPortal(<AnimatePresence>{open && <motion.div ref={ref} className={styles.picker} style={{ left, top }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: duration.fast, ease }}>
    <div className={styles.glass} />
    <motion.div className={styles.content} initial={{ scale: .96, y: -4 }} animate={{ scale: 1, y: 0 }} exit={{ scale: .98 }} transition={{ duration: duration.fast, ease }}>
      <div className={styles.header}><span className={styles.preview}><GlyphIcon icon={preview} size={19} /></span><span><strong>{GLYPH_LABELS[preview]}</strong><small>Choose a symbol</small></span></div>
      <div className={styles.grid}>{GLYPH_IDS.map((icon) => <button key={icon} type="button" className={[styles.item, value === icon ? styles.selected : ''].filter(Boolean).join(' ')} onMouseEnter={() => setHovered(icon)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(icon)} onClick={() => { onChange(icon); onClose(); }} aria-label={GLYPH_LABELS[icon]} aria-pressed={value === icon}><GlyphIcon icon={icon} size={17} /></button>)}</div>
    </motion.div>
  </motion.div>}</AnimatePresence>, document.body);
}
