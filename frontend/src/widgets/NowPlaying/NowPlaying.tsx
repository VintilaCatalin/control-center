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
  const minutes = Math.floor(abs / 60);
  const remainder = abs % 60;
  return `${sign}${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function sourceLabel(app?: string): string | null {
  if (!app) return null;
  const value = app.toLocaleLowerCase();
  if (value.includes('spotify')) return 'Spotify';
  if (value.includes('plex')) return 'Plex';
  if (value.includes('musicbee')) return 'MusicBee';
  if (value.includes('vlc')) return 'VLC';
  if (
    value.includes('chrome') ||
    value.includes('edge') ||
    value.includes('brave') ||
    value.includes('firefox')
  ) {
    return 'Browser';
  }
  return null;
}

export function NowPlaying() {
  const { snapshot, loading, error } = useSnapshotData();
  const media = snapshot?.media;
  const [optimisticPlaying, setOptimisticPlaying] = useState<boolean | null>(null);
  const [seekOverride, setSeekOverride] = useState<number | null>(null);
  const playing = optimisticPlaying ?? media?.playing ?? false;

  useEffect(() => {
    if (optimisticPlaying === null) return;
    if (media?.playing === optimisticPlaying) {
      setOptimisticPlaying(null);
      return;
    }
    const timer = setTimeout(() => setOptimisticPlaying(null), 3000);
    return () => clearTimeout(timer);
  }, [media?.playing, optimisticPlaying]);

  useEffect(() => {
    if (seekOverride === null) return;
    const timer = setTimeout(() => setSeekOverride(null), 2500);
    return () => clearTimeout(timer);
  }, [seekOverride]);

  const tickingPosition = useTickingProgress(media?.position, media?.duration, playing);
  const displayPosition = seekOverride ?? tickingPosition;
  const progress = media?.duration ? Math.min(1, displayPosition / media.duration) : 0;

  function handleToggle() {
    const next = !playing;
    setOptimisticPlaying(next);
    postAction('/api/media/control', { action: 'toggle' }).catch(() => setOptimisticPlaying(null));
  }

  function handlePrevious() {
    postAction('/api/media/control', { action: 'prev' }).catch(() => {});
  }

  function handleNext() {
    postAction('/api/media/control', { action: 'next' }).catch(() => {});
  }

  function handleSeek(percentage: number) {
    if (!media?.duration) return;
    const position = Math.round(percentage * media.duration);
    setSeekOverride(position);
    postAction('/api/media/control', { action: 'seek', position }).catch(() =>
      setSeekOverride(null),
    );
  }

  if (!snapshot && loading) return <NowPlayingSkeleton />;
  if (!snapshot && error) {
    return <Message tone="error" title="Now Playing">Can't reach the panel backend</Message>;
  }
  if (snapshot?.errors?.media) {
    return <Message tone="error" title="Now Playing">Media status unavailable</Message>;
  }
  if (!media?.title) {
    return <Message tone="quiet" title="Nothing playing">Start something and it will appear here</Message>;
  }

  const trackKey = `${media.title}|${media.artist ?? ''}|${media.album ?? ''}`;
  const source = sourceLabel(media.app);

  return (
    <div className={styles.stage}>
      {media.art ? (
        <AnimatePresence>
          <motion.div
            key={`wash-${trackKey}`}
            className={styles.artLayer}
            style={{ backgroundImage: `url("${media.art}")` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: duration.slow, ease }}
          />
        </AnimatePresence>
      ) : (
        <div className={styles.artFallback} />
      )}
      <div className={styles.artShade} />

      <div className={styles.layout}>
        <motion.div
          key={`cover-${trackKey}`}
          className={styles.cover}
          style={media.art ? { backgroundImage: `url("${media.art}")` } : undefined}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: duration.slow, ease }}
        >
          {!media.art && <MusicNoteIcon size={38} />}
          <span className={styles.coverHighlight} />
        </motion.div>

        <div className={styles.content}>
          <div className={styles.statusRow}>
            <span className={`${styles.nowStatus} ${playing ? styles.nowStatusPlaying : ''}`}>
              <i />
              {playing ? 'Playing' : 'Paused'}
            </span>
            {source && <span className={styles.source}>{source}</span>}
          </div>

          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={trackKey}
              className={styles.trackMeta}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: duration.base, ease }}
            >
              <div className={styles.title}>{media.title}</div>
              {media.artist && <div className={styles.subtitle}>{media.artist}</div>}
              {media.album && <div className={styles.album}>{media.album}</div>}
            </motion.div>
          </AnimatePresence>

          {!!media.duration && (
            <div className={styles.timeline}>
              <ScrubBar progress={progress} onSeek={handleSeek} />
              <div className={styles.timeRow}>
                <span className={styles.time}>{formatTime(displayPosition)}</span>
                <span className={styles.time}>{formatTime(displayPosition - media.duration)}</span>
              </div>
            </div>
          )}

          <div className={styles.controls}>
            <IconButton
              className={styles.transportButton}
              icon={<PrevIcon size={18} />}
              label="Previous"
              size="md"
              onClick={handlePrevious}
            />
            <IconButton
              className={styles.playButton}
              icon={playing ? <PauseIcon size={19} /> : <PlayIcon size={19} />}
              label={playing ? 'Pause' : 'Play'}
              size="lg"
              onClick={handleToggle}
            />
            <IconButton
              className={styles.transportButton}
              icon={<NextIcon size={18} />}
              label="Next"
              size="md"
              onClick={handleNext}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function NowPlayingSkeleton() {
  return (
    <div className={styles.stage} aria-busy="true" aria-label="Loading now playing">
      <Skeleton width="100%" height="100%" radius={0} className={styles.skeletonArt} />
      <div className={styles.layout}>
        <Skeleton width="100%" height="100%" radius={18} className={styles.skeletonCover} />
        <div className={styles.skeletonContent}>
          <Skeleton width="34%" height={11} />
          <Skeleton width="82%" height={24} />
          <Skeleton width="55%" height={15} />
          <Skeleton width="100%" height={4} radius={4} />
          <div className={styles.skeletonControls}>
            <Skeleton width={40} height={40} radius={999} />
            <Skeleton width={48} height={48} radius={999} />
            <Skeleton width={40} height={40} radius={999} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Message({
  tone,
  title,
  children,
}: {
  tone: 'error' | 'quiet';
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`${styles.message} ${tone === 'error' ? styles.messageError : ''}`}>
      <span className={styles.messageIcon}><MusicNoteIcon size={28} /></span>
      <div className={styles.messageTitle}>{title}</div>
      <div className={styles.messageSub}>{children}</div>
    </div>
  );
}
