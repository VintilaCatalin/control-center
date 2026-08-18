import type { PlexData, PlexItem } from '../../api/types';
import { type PanelDef, PanelGrid } from '../../primitives/PanelGrid/PanelGrid';
import { ContinueWatchingRow, type ContinueWatchingEntry } from './ContinueWatchingRow';
import { PlexPosterScroller } from './PlexPosterScroller';
import styles from './PlexHome.module.css';

interface PlexHomeProps {
  data: PlexData;
  onSelect: (item: PlexItem) => void;
  onNavigate: (sectionKey: string) => void;
}

const HOME_PREVIEW_COUNT = 10;

// Home's hierarchy: Continue Watching leads - full-width, no card of its
// own around it (see ContinueWatchingRow), directly in the content area -
// then media rails. The rails go through the app's own established
// PanelGrid drag/resize/hide system now instead of a manually-stacked,
// non-reorderable CSS section: each library is one PanelDef, same
// mechanism Overview/Games/Scene already use, so Plex doesn't invent a
// second layout model. A live session outranks Continue Watching for the
// featured slot - "something is playing right now" is more urgent than
// "you have unfinished things".
export function PlexHome({ data, onSelect, onNavigate }: PlexHomeProps) {
  const nowPlaying = data.playing[0];
  const libraries = data.sections.filter((s) => s.key !== 'continueWatching' && s.items.length > 0);

  const continueEntries: ContinueWatchingEntry[] = [];
  if (nowPlaying) {
    continueEntries.push({
      item: {
        ratingKey: nowPlaying.ratingKey,
        title: nowPlaying.title,
        show: nowPlaying.show,
        type: nowPlaying.type,
        art: nowPlaying.art,
        backdrop: nowPlaying.backdrop,
        launch: null,
        duration: nowPlaying.duration,
        viewOffset: nowPlaying.viewOffset,
      },
      live: true,
    });
  }
  data.recent.forEach((item) => continueEntries.push({ item }));

  const panels: PanelDef[] = libraries.map((section) => ({
    id: `plex-${section.key}`,
    label: section.title,
    minSize: { w: 1, h: 1 },
    headerAction: (
      <button type="button" className={styles.seeAll} onClick={() => onNavigate(section.key)}>
        See all
      </button>
    ),
    content: <PlexPosterScroller items={section.items.slice(0, HOME_PREVIEW_COUNT)} onSelect={onSelect} />,
  }));

  return (
    <div className={styles.home}>
      <ContinueWatchingRow entries={continueEntries} onOpenDetail={onSelect} />

      {panels.length > 0 && <PanelGrid view="plex-home" panels={panels} fallbackSize={{ w: 4, h: 6 }} />}

      {continueEntries.length === 0 && panels.length === 0 && (
        <div className={styles.state}>
          <span className={styles.stateTitle}>Nothing to show yet</span>
          <span>Plex hasn't reported any libraries or watch history.</span>
        </div>
      )}
    </div>
  );
}
