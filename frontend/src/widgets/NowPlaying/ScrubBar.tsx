import type { KeyboardEvent, MouseEvent } from 'react';
import styles from './NowPlaying.module.css';

interface ScrubBarProps {
  progress: number;
  onSeek: (percentage: number) => void;
  disabled?: boolean;
}

export function ScrubBar({ progress, onSeek, disabled }: ScrubBarProps) {
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (disabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    let next: number | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = progress - 0.02;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = progress + 0.02;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = 1;
    if (next === null) return;
    event.preventDefault();
    onSeek(Math.max(0, Math.min(1, next)));
  }

  return (
    <div
      className={styles.scrubTrack}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-disabled={disabled}
    >
      <div className={styles.scrubFill} style={{ width: `${progress * 100}%` }}>
        <span />
      </div>
    </div>
  );
}
