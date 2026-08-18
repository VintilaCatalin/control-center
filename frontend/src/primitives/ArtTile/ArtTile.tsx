import { useState, type ReactNode } from 'react';
import { Skeleton } from '../Skeleton/Skeleton';
import styles from './ArtTile.module.css';

interface ArtTileProps {
  aspect: 'square' | 'portrait' | 'landscape';
  src?: string | null;
  altSrcs?: string[];
  alt: string;
  fallback: ReactNode;
  badge?: ReactNode;
  ribbon?: ReactNode;
  contain?: boolean;
  className?: string;
}

// Purely visual: image + fallback-chain + shimmer + badge/ribbon slots.
// Deliberately has no click/hover/drag behavior of its own - AppIcon and
// GameTile each own a different interaction contract (a single launch
// button vs. a draggable, favoritable library tile), so that belongs in
// the consumer, not here.
export function ArtTile({
  aspect,
  src,
  altSrcs = [],
  alt,
  fallback,
  badge,
  ribbon,
  contain,
  className,
}: ArtTileProps) {
  const candidates = src ? [src, ...altSrcs] : [];
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const current = candidates[index];
  const exhausted = index >= candidates.length;

  function handleError() {
    setIndex((i) => i + 1);
    setLoaded(false);
  }

  return (
    <div className={[styles.tile, styles[aspect], className].filter(Boolean).join(' ')}>
      {current && !exhausted ? (
        <>
          {!loaded && (
            <Skeleton width="100%" height="100%" radius={0} className={styles.imgSkeleton} />
          )}
          <img
            key={current}
            src={current}
            alt={alt}
            className={[styles.img, contain ? styles.contain : ''].filter(Boolean).join(' ')}
            style={{ opacity: loaded ? 1 : 0 }}
            onLoad={() => setLoaded(true)}
            onError={handleError}
            draggable={false}
          />
        </>
      ) : (
        <div className={styles.fallback}>{fallback}</div>
      )}
      <div className={styles.sheen} />
      {badge && <div className={styles.badge}>{badge}</div>}
      {ribbon && <div className={styles.ribbon}>{ribbon}</div>}
    </div>
  );
}
