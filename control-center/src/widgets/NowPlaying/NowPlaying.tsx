import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { postAction } from '../../api/client';
import { useSnapshotData } from '../../api/SnapshotProvider';
import { IconButton } from '../../primitives/IconButton/IconButton';
import { Skeleton } from '../../primitives/Skeleton/Skeleton';
import { duration, ease } from '../../tokens/motion';
import { MusicNoteIcon } from './MusicNoteIcon';
import { ScrubBar } from './ScrubBar';
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from './TransportIcons';
import { useTickingProgress } from './useTickingProgress';
import styles from './NowPlaying.module.css';

function formatTime(seconds: number): string {
  const sign = seconds < 0 ? '-' : '';
  const abs = Math.abs(Math.round(seconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m}:${s.toString().padStart(2, '0')}`;
}

export function NowPlaying() {
  const { snapshot, loading, error } = useSnapshotData();
  const m = snapshot?.media;

  const [optimisticPlaying, setOptimisticPlaying] = useState<boolean | null>(null);
  const [seekOverride, setSeekOverride] = useState<number | null>(null);

  const playing = optimisticPlaying ?? m?.playing ?? false;

  // Reconcile the optimistic flip once the server confirms it (or give up
  // after 3s so a failed request never leaves the button permanently wrong).
  useEffect(() => {
    if (optimisticPlaying === null) return;
    if (m?.playing === optimisticPlaying) {
      setOptimisticPlaying(null);
      return;
    }
    const t = setTimeout(() => setOptimisticPlaying(null), 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.playing, optimisticPlaying]);

  useEffect(() => {
    if (seekOverride === null) return;
    const t = setTimeout(() => setSeekOverride(null), 2500);
    return () => clearTimeout(t);
  }, [seekOverride]);

  const tickingPosition = useTickingProgress(m?.position, m?.duration, playing);
  const displayPosition = seekOverride ?? tickingPosition;
  const progress = m?.duration ? Math.min(1, displayPosition / m.duration) : 0;

  function handleToggle() {
    const next = !playing;
    setOptimisticPlaying(next);
    postAction('/api/media/control', { action: 'toggle' }).catch(() => setOptimisticPlaying(null));
  }

  function handlePrev() {
    postAction('/api/media/control', { action: 'prev' });
  }

  function handleNext() {
    postAction('/api/media/control', { action: 'next' });
  }

  function handleSeek(pct: number) {
    if (!m?.duration) return;
    const pos = Math.round(pct * m.duration);
    setSeekOverride(pos);
    postAction('/api/media/control', { action: 'seek', position: pos }).catch(() =>
      setSeekOverride(null),
    );
  }

  // No snapshot has ever arrived yet.
  if (!snapshot && loading) return <NowPlayingSkeleton />;

  // No snapshot has ever arrived, and the request failed.
  if (!snapshot && error) {
    return (
      <Message tone="error" icon={<MusicNoteIcon size={26} />} title="Now Playing">
        Can't reach the panel backend
      </Message>
    );
  }

  if (snapshot?.errors?.media) {
    return (
      <Message tone="error" icon={<MusicNoteIcon size={26} />} title="Now Playing">
        Media status unavailable
      </Message>
    );
  }

  if (!m?.title) {
    return (
      <Message tone="quiet" icon={<MusicNoteIcon size={26} />} title="Nothing playing">
        Start something and it'll show up here
      </Message>
    );
  }

  const trackKey = `${m.title}|${m.artist ?? ''}|${m.album ?? ''}`;

  return (
    <div className={styles.stage}>
      {m.art ? (
        <AnimatePresence>
          <motion.div
            key={trackKey}
            className={styles.artLayer}
            style={{ backgroundImage: `url("${m.art}")` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: duration.slow, ease }}
          />
        </AnimatePresence>
      ) : (
        <div className={styles.artFallback}>
          <MusicNoteIcon size={32} />
        </div>
      )}
      <div className={styles.artShade} />

      <div className={styles.eyebrow}>Now Playing</div>

      <div className={styles.content}>
        <AnimatePresence initial={false}>
          <motion.div
            key={trackKey}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: duration.base, ease }}
          >
            <div className={styles.title}>{m.title}</div>
            <div className={styles.subtitle}>
              {[m.artist, m.album].filter(Boolean).join(' · ')}
              {!playing ? ' · Paused' : ''}
            </div>
          </motion.div>
        </AnimatePresence>

        {!!m.duration && (
          <>
            <ScrubBar progress={progress} onSeek={handleSeek} />
            <div className={styles.timeRow}>
              <span className={styles.time}>{formatTime(displayPosition)}</span>
              <span className={styles.time}>{formatTime(displayPosition - m.duration)}</span>
            </div>
          </>
        )}

        <div className={styles.controls}>
          <IconButton icon={<PrevIcon />} label="Previous" size="md" onClick={handlePrev} />
          <IconButton
            icon={playing ? <PauseIcon /> : <PlayIcon />}
            label={playing ? 'Pause' : 'Play'}
            size="lg"
            onClick={handleToggle}
          />
          <IconButton icon={<NextIcon />} label="Next" size="md" onClick={handleNext} />
        </div>
      </div>
    </div>
  );
}

function NowPlayingSkeleton() {
  return (
    <div className={styles.stage} aria-busy="true" aria-label="Loading now playing">
      <Skeleton width="100%" height="100%" radius={0} className={styles.skeletonArt} />
      <div className={styles.skeletonContent}>
        <Skeleton width="70%" height={22} />
        <Skeleton width="45%" height={15} />
        <Skeleton width="100%" height={4} radius={4} />
        <div className={styles.skeletonControls}>
          <Skeleton width={40} height={40} radius={999} />
          <Skeleton width={48} height={48} radius={999} />
          <Skeleton width={40} height={40} radius={999} />
        </div>
      </div>
    </div>
  );
}

function Message({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'error' | 'quiet';
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`${styles.message} ${tone === 'error' ? styles.messageError : ''}`}>
      {icon}
      <div className={styles.messageTitle}>{title}</div>
      <div className={styles.messageSub}>{children}</div>
    </div>
  );
}
