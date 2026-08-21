import { AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { setTopicIcon } from '../api/actions/reading';
import { useSnapshotData } from '../api/SnapshotProvider';
import type { Book, ReadingItem } from '../api/types';
import { Skeleton } from '../primitives/Skeleton/Skeleton';
import { ArticleDetail } from '../widgets/Reading/ArticleDetail';
import { AddBookSheet } from '../widgets/Reading/Books/AddBookSheet';
import { BookDetail } from '../widgets/Reading/Books/BookDetail';
import { BooksHome } from '../widgets/Reading/Books/BooksHome';
import { ReadingFeed } from '../widgets/Reading/ReadingFeed';
import { ReadingSidebarNav, type ReadingSection } from '../widgets/Reading/ReadingSidebarNav';
import { SavesPanel } from '../widgets/Reading/SavesPanel';
import { SourceManagerSheet } from '../widgets/Reading/SourceManagerSheet';
import { VideoDetail } from '../widgets/Reading/VideoDetail';
import { isSavesSection, savesCollectionId } from '../widgets/Reading/topics';
import { usePublishAppSidebar } from '../shell/AppChromeContext';
import { useSidebarCollapsed } from '../shell/SidebarCollapseContext';
import { useToast } from '../primitives/Toast/ToastProvider';
import styles from './Reading.module.css';

interface ReadingProps {
  initialSection?: ReadingSection | null;
  onInitialSectionApplied?: () => void;
}

export function Reading({ initialSection, onInitialSectionApplied }: ReadingProps = {}) {
  const { snapshot } = useSnapshotData();
  const data = snapshot?.reading;
  const library = snapshot?.library;
  const { collapsed } = useSidebarCollapsed();
  const { push } = useToast();
  const [activeKey, setActiveKey] = useState<ReadingSection>('foryou');
  const [savesSearch, setSavesSearch] = useState('');
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
  const [sourceManagerOpen, setSourceManagerOpen] = useState(false);
  const [topicIconOverrides, setTopicIconOverrides] = useState<Record<string, string>>({});
  const topics = useMemo(
    () => (data?.topics ?? []).map((topic) => ({ ...topic, icon: topicIconOverrides[topic.id] ?? topic.icon })),
    [data?.topics, topicIconOverrides],
  );

  const savedUrls = useMemo(() => new Set(library?.saved_urls ?? []), [library?.saved_urls]);
  const feedItems = useMemo(
    () => (data?.items ?? []).map((item) => ({ ...item, saved: savedUrls.has(item.url) || item.saved })),
    [data?.items, savedUrls],
  );

  useEffect(() => {
    if (!data?.topics) return;
    setTopicIconOverrides((current) => {
      const next = { ...current };
      let changed = false;
      data.topics.forEach((topic) => {
        if (next[topic.id] !== undefined && next[topic.id] === topic.icon) {
          delete next[topic.id];
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [data?.topics]);

  async function handleTopicIconChange(id: string, icon: string) {
    const previous = topics.find((topic) => topic.id === id)?.icon;
    setTopicIconOverrides((current) => ({ ...current, [id]: icon }));
    try {
      const result = await setTopicIcon(id, icon);
      if (!result.ok) throw new Error(result.error || 'Could not change topic icon');
    } catch (error) {
      setTopicIconOverrides((current) => {
        const next = { ...current };
        if (previous) next[id] = previous;
        else delete next[id];
        return next;
      });
      push(error instanceof Error ? error.message : 'Could not change topic icon', 'error');
      throw error;
    }
  }

  usePublishAppSidebar(
    useMemo(
      () =>
        data ? (
          <ReadingSidebarNav
            items={feedItems}
            books={data.books}
            collections={library?.collections ?? []}
            libraryConfigured={!!library?.configured}
            savesSearch={savesSearch}
            onSavesSearchChange={setSavesSearch}
            topics={topics}
            active={activeKey}
            onSelect={setActiveKey}
            onSelectBook={setDetailBook}
            onManageSources={() => setSourceManagerOpen(true)}
            onTopicIconChange={handleTopicIconChange}
            collapsed={collapsed}
          />
        ) : null,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [feedItems, data?.books, library?.collections, library?.configured, topics, activeKey, savesSearch, collapsed],
    ),
  );

  useEffect(() => {
    if (!detailBook || !data?.books) return;
    const fresh = data.books.find((b) => b.id === detailBook.id);
    if (!fresh) return;
    // Snapshot is source of truth after light books refresh. Don't invent
    // anti-regression rules that fight an intentional Want demote.
    if (
      fresh.reading_cfi !== detailBook.reading_cfi ||
      fresh.progress_pct !== detailBook.progress_pct ||
      fresh.file_url !== detailBook.file_url ||
      fresh.status !== detailBook.status ||
      fresh.notes !== detailBook.notes ||
      fresh.cover_url !== detailBook.cover_url
    ) {
      setDetailBook(fresh);
    }
  }, [data?.books, detailBook]);

  if (!data) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingGrid} aria-busy="true" aria-label="Loading Reading">
          <Skeleton height={280} radius={24} className={styles.loadingHero} />
          <div className={styles.loadingPanels}>
            <Skeleton height={200} radius={24} />
            <Skeleton height={200} radius={24} />
            <Skeleton height={200} radius={24} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        {activeKey === 'books' ? (
          <BooksHome books={data.books} onSelectBook={setDetailBook} onAddBook={() => setAddBookOpen(true)} />
        ) : isSavesSection(activeKey) ? (
          <SavesPanel section={savesCollectionId(activeKey)} search={savesSearch} />
        ) : (
          <ReadingFeed
            items={feedItems}
            books={data.books}
            topics={topics}
            errors={data.errors}
            section={activeKey}
            onOpenItem={setDetailItem}
            onSelectBook={setDetailBook}
            onSelectSection={setActiveKey}
            onTopicIconChange={handleTopicIconChange}
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
        {detailBook && (
          <BookDetail
            book={detailBook}
            onClose={() => setDetailBook(null)}
            onBookChange={(patch) =>
              setDetailBook((current) => (current ? { ...current, ...patch } : current))
            }
          />
        )}
      </AnimatePresence>

      <AddBookSheet open={addBookOpen} onClose={() => setAddBookOpen(false)} />
      <SourceManagerSheet open={sourceManagerOpen} onClose={() => setSourceManagerOpen(false)} sources={data.sources} topics={data.topics} />
    </div>
  );
}
