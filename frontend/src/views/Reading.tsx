import { AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteBookmark } from '../api/actions/reading';
import { useSnapshotData } from '../api/SnapshotProvider';
import type { Book, ReadingItem } from '../api/types';
import { AddBookmarkSheet } from '../widgets/Reading/AddBookmarkSheet';
import { ArticleDetail } from '../widgets/Reading/ArticleDetail';
import { AddBookSheet } from '../widgets/Reading/Books/AddBookSheet';
import { BookDetail } from '../widgets/Reading/Books/BookDetail';
import { BooksHome } from '../widgets/Reading/Books/BooksHome';
import { ReadingFeed } from '../widgets/Reading/ReadingFeed';
import { ReadingSidebarNav, type ReadingSection } from '../widgets/Reading/ReadingSidebarNav';
import { SourceManagerSheet } from '../widgets/Reading/SourceManagerSheet';
import { VideoDetail } from '../widgets/Reading/VideoDetail';
import { usePublishAppSidebar } from '../shell/AppChromeContext';
import { useSidebarCollapsed } from '../shell/SidebarCollapseContext';
import styles from './Reading.module.css';

// A curated visual feed, not an RSS table - see the Reading redesign plan.
// Detail overlays are full-bleed, same pattern as Plex's own detail
// screen, independent of the feed's own scroll position underneath them -
// which one renders depends on the clicked item's kind (ArticleDetail for
// articles, VideoDetail's embedded player for videos - bookmarks are
// always articles). Books is its own section with its own visual system
// (BooksHome), not another feed view.
interface ReadingProps {
  // Global Search's deep-link target - applied once (see App.tsx's
  // navigateToApp/pendingReadingSection), then cleared via the callback so
  // a later manual sidebar click isn't overridden on the next render.
  initialSection?: ReadingSection | null;
  onInitialSectionApplied?: () => void;
}

export function Reading({ initialSection, onInitialSectionApplied }: ReadingProps = {}) {
  const { snapshot } = useSnapshotData();
  const data = snapshot?.reading;
  const { collapsed } = useSidebarCollapsed();
  const [activeKey, setActiveKey] = useState<ReadingSection>('foryou');
  const appliedInitial = useRef(false);

  useEffect(() => {
    if (appliedInitial.current || !initialSection) return;
    appliedInitial.current = true;
    setActiveKey(initialSection);
    onInitialSectionApplied?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSection]);
  const [detailItem, setDetailItem] = useState<ReadingItem | null>(null);
  const [detailBook, setDetailBook] = useState<Book | null>(null);
  const [addBookOpen, setAddBookOpen] = useState(false);
  const [addBookmarkOpen, setAddBookmarkOpen] = useState(false);
  const [sourceManagerOpen, setSourceManagerOpen] = useState(false);

  usePublishAppSidebar(
    useMemo(
      () =>
        data ? (
          <ReadingSidebarNav
            sources={data.sources}
            items={data.items}
            books={data.books}
            bookmarks={data.bookmarks}
            topics={data.topics}
            active={activeKey}
            onSelect={setActiveKey}
            onManageSources={() => setSourceManagerOpen(true)}
            onAddBookmark={() => setAddBookmarkOpen(true)}
            collapsed={collapsed}
          />
        ) : null,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [data?.sources, data?.items, data?.books, data?.bookmarks, data?.topics, activeKey, collapsed],
    ),
  );

  if (!data) {
    return (
      <div className={styles.page}>
        <div className={styles.state}>Loading Reading…</div>
      </div>
    );
  }

  function handleRemoveBookmark(item: ReadingItem) {
    deleteBookmark(item.id).catch(() => {});
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        {activeKey === 'books' ? (
          <BooksHome books={data.books} onSelectBook={setDetailBook} onAddBook={() => setAddBookOpen(true)} />
        ) : (
          <ReadingFeed
            items={data.items}
            bookmarks={data.bookmarks}
            books={data.books}
            topics={data.topics}
            section={activeKey}
            onOpenItem={setDetailItem}
            onRemoveBookmark={handleRemoveBookmark}
            onSelectBook={setDetailBook}
            onSelectSection={setActiveKey}
          />
        )}
      </div>

      <AnimatePresence>
        {detailItem &&
          (detailItem.kind === 'video' ? (
            <VideoDetail item={detailItem} onClose={() => setDetailItem(null)} />
          ) : (
            <ArticleDetail item={detailItem} onClose={() => setDetailItem(null)} />
          ))}
        {detailBook && <BookDetail book={detailBook} onClose={() => setDetailBook(null)} />}
      </AnimatePresence>

      <AddBookSheet open={addBookOpen} onClose={() => setAddBookOpen(false)} />
      <AddBookmarkSheet open={addBookmarkOpen} onClose={() => setAddBookmarkOpen(false)} topics={data.topics} />
      <SourceManagerSheet open={sourceManagerOpen} onClose={() => setSourceManagerOpen(false)} sources={data.sources} topics={data.topics} />
    </div>
  );
}
