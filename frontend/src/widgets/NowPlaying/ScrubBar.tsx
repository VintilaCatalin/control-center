import type { MouseEvent } from 'react';
import styles from './NowPlaying.module.css';

interface ScrubBarProps {
  progress: number; // 0-1
  onSeek: (pct: number) => void;
  disabled?: boolean;
}

export function ScrubBar({ progress, onSeek, disabled }: ScrubBarProps) {
  function handleClick(e: MouseEvent<HTMLDivElement>) {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(pct);
  }

  return (
    <div
      className={styles.scrubTrack}
      onClick={handleClick}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-disabled={disabled}
    >
      <div className={styles.scrubFill} style={{ width: `${progress * 100}%` }} />
    </div>
  );
}
