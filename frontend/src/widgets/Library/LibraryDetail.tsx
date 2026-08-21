import { useEffect, useState } from 'react';
import type { LibraryItem, ReadingItem } from '../../api/types';
import { ArticleDetail } from '../Reading/ArticleDetail';
import { libraryArticleCacheId } from './utils';

interface LibraryDetailProps {
  item: LibraryItem;
  onClose: () => void;
}

// Reuses Reading's article reader (trafilatura full-text) so Library
// bookmarks open the same way feed articles do - not just a metadata sheet.
export function LibraryDetail({ item, onClose }: LibraryDetailProps) {
  const [readingItem, setReadingItem] = useState<ReadingItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReadingItem(null);
    libraryArticleCacheId(item.url).then((id) => {
      if (cancelled) return;
      const published = item.created ? Math.floor(new Date(item.created).getTime() / 1000) : null;
      setReadingItem({
        id,
        kind: 'article',
        source_id: 'library',
        source_label: item.domain || 'Raindrop',
        topic: 'interesting',
        title: item.title,
        url: item.url,
        domain: item.domain,
        published: Number.isFinite(published) ? published : null,
        thumb: item.cover ?? null,
        blurb: item.excerpt || '',
        read_minutes: null,
        saved: false,
        read: true,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [item]);

  if (!readingItem) return null;

  return (
    <ArticleDetail
      item={readingItem}
      onClose={onClose}
      backLabel="Back to Library"
      saveable={false}
    />
  );
}
