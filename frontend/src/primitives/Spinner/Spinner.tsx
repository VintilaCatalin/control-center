import styles from './Spinner.module.css';

interface SpinnerProps {
  size?: number;
}

// The one loading indicator every in-flight action in the app should use -
// see Spinner.module.css's comment. Purely visual/decorative (the action
// it sits inside already carries its own accessible busy state, e.g. a
// disabled button), so it's hidden from assistive tech rather than
// announced as a second, redundant status.
export function Spinner({ size = 14 }: SpinnerProps) {
  return <span className={styles.spinner} style={{ width: size, height: size }} aria-hidden="true" />;
}
