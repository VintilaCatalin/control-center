import type { HTMLAttributes, ReactNode, Ref } from 'react';
import styles from './Card.module.css';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

// Ported from the old app's .card (index.html:141-160) - the shared glass
// surface. No padding baked in: some cards want edge-to-edge content (art
// behind text, like Now Playing), others want inset padding - that's the
// consumer's call, not this primitive's.
//
// React 19 accepts `ref` as a plain prop on function components, no
// forwardRef needed - used by Shelf, which needs the DOM node for
// cross-shelf drop-target detection during drag.
export function Card({ children, className, ref, ...rest }: CardProps) {
  return (
    <div ref={ref} className={[styles.card, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}
