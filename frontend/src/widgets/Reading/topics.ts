// Shared between ReadingSidebarNav (nav labels), ReadingFeed (block
// headings on For You) and every block component - one place for the
// section/topic vocabulary so they never drift.
export type ReadingSection =
  | 'foryou'
  | 'tech'
  | 'ai'
  | 'design'
  | 'world'
  | 'travel'
  | 'games'
  | 'interesting'
  | 'youtube'
  | 'sport'
  | 'saved'
  | 'bookmarks'
  | 'books';

export const TOPIC_LABELS: Record<Exclude<ReadingSection, 'foryou' | 'saved' | 'bookmarks' | 'books'>, string> = {
  tech: 'Tech',
  ai: 'AI',
  design: 'Design',
  world: 'World',
  travel: 'Travel',
  games: 'Games',
  interesting: 'Interesting',
  youtube: 'YouTube',
  sport: 'Sport',
};

export const TOPIC_ORDER = Object.keys(TOPIC_LABELS) as (keyof typeof TOPIC_LABELS)[];

// A small family of hues (same saturation/lightness range as each other,
// so they read as one coherent system, not a rainbow) - the one place
// Reading breaks from the rest of the app's single-accent language. A
// personal feed spanning 8 unrelated subjects needs a way to
// differentiate them at a glance beyond text; badges/scrims/left-rules
// use this, nothing outside Reading does.
export const TOPIC_COLORS: Record<keyof typeof TOPIC_LABELS, string> = {
  tech: 'hsl(210 85% 62%)',
  ai: 'hsl(265 78% 68%)',
  design: 'hsl(330 78% 66%)',
  world: 'hsl(155 60% 48%)',
  travel: 'hsl(186 72% 48%)',
  games: 'hsl(25 88% 58%)',
  interesting: 'hsl(45 88% 56%)',
  youtube: 'hsl(0 72% 60%)',
  sport: 'hsl(9 82% 58%)',
};

// Topic tag vs. "is this a video" are independent axes (a YouTube source
// can be tagged any topic) - anywhere that renders per-topic editorial
// blocks (ReadingFeed's For You rows, ReadingSidebarNav's Topics group)
// excludes "youtube" from that loop and handles video content as its own
// thing (kind === 'video'), not a topic.
export const REGULAR_TOPICS = TOPIC_ORDER.filter((t) => t !== 'youtube');
