import { useState, type MouseEvent } from 'react';
import { GlyphPicker } from './GlyphPicker';
import { GlyphIcon } from './glyphs';
import styles from './EditableGlyph.module.css';

interface Props {
  value?: string;
  onChange: (icon: string) => void | Promise<void>;
  label: string;
}

export function EditableGlyph({ value, onChange, label }: Props) {
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);

  function open(event: MouseEvent<HTMLButtonElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    setPicker({ x: box.left, y: box.bottom + 8 });
  }

  return <>
    <button type="button" className={styles.button} onClick={open} aria-label={label} title={label}><GlyphIcon icon={value} size={22} /></button>
    <GlyphPicker open={!!picker} x={picker?.x ?? 0} y={picker?.y ?? 0} value={value} onChange={(icon) => { void onChange(icon); }} onClose={() => setPicker(null)} />
  </>;
}
