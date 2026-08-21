import { BookmarkIcon } from './icons';
import styles from './SaveButton.module.css';

interface SaveButtonProps {
  saved: boolean;
  onToggle: () => void;
  // 'image': a light glass chip over dark artwork (the default).
  // 'panel': tinted to sit on a text-editorial card's own surface, which
  // has no dark image underneath to justify a glass-over-photo treatment.
  variant?: 'image' | 'panel';
  small?: boolean;
  // Cards float this over their own artwork/panel by default. A control
  // bar in normal document flow (VideoDetail's) has no positioned corner
  // to float over - it wants the button as a normal inline flex child.
  inline?: boolean;
}

// Shared by every card type (FeedCard, VideoCard, the detail overlays) so
// the save affordance stays visually and behaviorally identical across
// the whole app regardless of which card composition it's on.
export function SaveButton({ saved, onToggle, variant = 'image', small, inline }: SaveButtonProps) {
  return (
    <button
      type="button"
      className={[
        styles.btn,
        variant === 'panel' ? styles.onPanel : '',
        small ? styles.small : '',
        inline ? styles.inline : '',
        saved ? styles.active : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onToggle}
      aria-pressed={saved}
      title={saved ? 'Saved to Raindrop' : 'Save to Raindrop'}
    >
      <BookmarkIcon filled={saved} />
    </button>
  );
}
