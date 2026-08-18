// Mirrors tokens/motion.css for Framer Motion, which needs real numbers
// rather than CSS custom properties. Keep both files in sync by hand.

export const ease = [0.22, 0.68, 0.18, 1] as const;

export const duration = {
  fast: 0.12,
  base: 0.22,
  slow: 0.42,
  lazy: 2,
} as const;
