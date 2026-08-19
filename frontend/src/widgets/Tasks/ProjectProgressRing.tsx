import styles from './ProjectProgressRing.module.css';

interface Props {
  completed: number;
  total: number;
  size?: number;
}

export function ProjectProgressRing({ completed, total, size = 18 }: Props) {
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  return <span className={styles.ring} style={{ width: size, height: size }} aria-label={`${progress}% complete`} title={`${progress}% complete`}>
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle className={styles.track} cx="10" cy="10" r="7.75" pathLength="100" />
      <circle className={styles.value} cx="10" cy="10" r="7.75" pathLength="100" strokeDasharray={`${progress} 100`} />
    </svg>
  </span>;
}
