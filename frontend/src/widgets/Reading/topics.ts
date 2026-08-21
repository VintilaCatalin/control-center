// Shared between ReadingSidebarNav (nav labels), ReadingFeed (block
// headings on For You) and every block component - one place for the
// section/topic vocabulary so they never drift. Topics themselves are
// user-editable now (see reading_add_topic()/reading_remove_topic() in
// backend/collectors/reading.py) - the `(string & {})` member keeps
// autocomplete for the original 9 while still accepting any topic id a
// user creates (a plain `| string` would collapse the whole union and
// lose that autocomplete entirely).
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
  | 'books'
  | 'saves'
  | 'saves-unsorted'
  | 'saves-favorites'
  | (string & {});

export const TOPIC_LABELS: Record<Exclude<ReadingSection, 'foryou' | 'books' | 'saves' | 'saves-unsorted' | 'saves-favorites'>, string> = {
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

export interface TopicDef {
  id: string;
  label: string;
  icon?: string;
}

// Falls back to the live topic list (snapshot.reading.topics, real
// user-created topics included) for any id outside the original 9, then
// to the raw id itself if even that comes up empty - never a blank label.
export function topicLabel(id: string, liveTopics?: TopicDef[]): string {
  if (id in TOPIC_LABELS) return TOPIC_LABELS[id as keyof typeof TOPIC_LABELS];
  return liveTopics?.find((t) => t.id === id)?.label ?? id;
}

// A deterministic hue from the topic id itself - custom topics get a
// real, stable colour without needing their own palette entry (see
// TOPIC_COLORS' own comment on why hue is the one axis Reading uses to
// tell topics apart at a glance).
function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h < 0 ? h + 360 : h;
}

export function topicColor(id: string): string {
  if (id in TOPIC_COLORS) return TOPIC_COLORS[id as keyof typeof TOPIC_COLORS];
  return `hsl(${hashHue(id)} 70% 60%)`;
}

/** Raindrop Saves sections live under Reading as `saves` / `saves-*` keys. */
export function isSavesSection(key: string): boolean {
  return key === 'saves' || key === 'saves-unsorted' || key === 'saves-favorites' || key.startsWith('saves-c-');
}

export type ReadingMode = 'feed' | 'saves' | 'books';

export function readingMode(key: ReadingSection): ReadingMode {
  if (key === 'books') return 'books';
  if (isSavesSection(key)) return 'saves';
  return 'feed';
}

export function savesCollectionId(key: string): string {
  if (key === 'saves') return 'recent';
  if (key === 'saves-unsorted') return 'unsorted';
  if (key === 'saves-favorites') return 'favorites';
  if (key.startsWith('saves-c-')) return key.slice('saves-c-'.length);
  return 'recent';
}

export function savesSectionKey(collectionId: string): ReadingSection {
  if (collectionId === 'recent') return 'saves';
  if (collectionId === 'unsorted') return 'saves-unsorted';
  if (collectionId === 'favorites') return 'saves-favorites';
  return `saves-c-${collectionId}`;
}
