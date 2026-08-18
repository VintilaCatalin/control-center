import { motion } from 'framer-motion';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { duration, ease } from '../../tokens/motion';
import styles from './IconButton.module.css';

type ConflictingProps =
  | 'aria-label'
  | 'onDrag'
  | 'onDragStart'
  | 'onDragEnd'
  | 'onAnimationStart'
  | 'onAnimationEnd'
  | 'onAnimationIteration';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, ConflictingProps> {
  icon: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  label: string; // required - becomes aria-label and title, not optional polish
}

export function IconButton({
  icon,
  size = 'md',
  label,
  className,
  disabled,
  ...rest
}: IconButtonProps) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={[styles.btn, styles[size], className].filter(Boolean).join(' ')}
      whileTap={disabled ? undefined : { scale: 0.9 }}
      transition={{ duration: duration.fast, ease }}
      {...rest}
    >
      {icon}
    </motion.button>
  );
}
