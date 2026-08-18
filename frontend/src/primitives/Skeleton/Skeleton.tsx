import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
}

// Factored out of Weather's ad hoc .skel/.skelX classes now that a second
// widget needs the same shimmer placeholder - Weather keeps its own copy
// since it isn't being touched again, but every widget after this one
// should use this instead of redefining the pattern.
//
// width/height are optional so a placeholder can be sized by an
// aspect-ratio class instead (e.g. a 2:3 cover tile) - passing an explicit
// height of 0 to force that would just collapse the element instead.
export function Skeleton({ width, height, radius = 6, className }: SkeletonProps) {
  return (
    <span
      className={[styles.skel, className].filter(Boolean).join(' ')}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}
