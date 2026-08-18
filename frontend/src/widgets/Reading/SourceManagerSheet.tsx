import { useEffect, useState } from 'react';
import { addSource, addTopic, deleteSource, editSource, fetchFeedPresets, importSubscriptions, removeTopic } from '../../api/actions/reading';
import type { ReadingSource } from '../../api/types';
import { Sheet } from '../../primitives/Sheet/Sheet';
import { type TopicDef, topicLabel } from './topics';
import styles from './SourceManagerSheet.module.css';

interface SourceManagerSheetProps {
  open: boolean;
  onClose: () => void;
  sources: ReadingSource[];
  topics: TopicDef[];
}

type Tab = 'sources' | 'add' | 'topics' | 'import';

// Everything needed to shape what feeds into Reading, in one place: the
// current source list (enable/retag/remove), a manual-add form plus a
// one-click browser over the curated FEED_PRESETS, topic management
// (create/remove - topics used to be a fixed 9-value enum, now a plain
// user-editable list, see backend/collectors/reading.py), and a YouTube
// subscriptions import. The feed/sidebar themselves never need to know
// this exists - sources/topics changing just means different content on
// the next poll.
export function SourceManagerSheet({ open, onClose, sources, topics }: SourceManagerSheetProps) {
  const [tab, setTab] = useState<Tab>('sources');

  useEffect(() => {
    if (open) setTab('sources');
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title="Manage sources" subtitle="What feeds into your Reading page, and how it's tagged.">
      <div className={styles.tabs}>
        <button type="button" className={[styles.tab, tab === 'sources' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('sources')}>
          Your sources
        </button>
        <button type="button" className={[styles.tab, tab === 'add' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('add')}>
          Add source
        </button>
        <button type="button" className={[styles.tab, tab === 'topics' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('topics')}>
          Topics
        </button>
        <button type="button" className={[styles.tab, tab === 'import' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('import')}>
          Import YouTube
        </button>
      </div>

      {tab === 'sources' && <SourceList sources={sources} topics={topics} />}
      {tab === 'add' && <AddSourceForm topics={topics} />}
      {tab === 'topics' && <TopicManager topics={topics} sources={sources} />}
      {tab === 'import' && <ImportSubscriptions />}
    </Sheet>
  );
}

function SourceList({ sources, topics }: { sources: ReadingSource[]; topics: TopicDef[] }) {
  if (sources.length === 0) {
    return <p className={styles.hint}>No sources yet - add one from the "Add source" tab.</p>;
  }
  return (
    <div className={styles.list}>
      {sources.map((source) => (
        <SourceRow key={source.id} source={source} topics={topics} />
      ))}
    </div>
  );
}

const KIND_LABEL: Record<ReadingSource['type'], string> = { rss: 'Feed', youtube: 'YouTube', webpage: 'Webpage' };

// Shared by SourceRow and AddSourceForm - a topic <select> built from the
// live topic list, plus a "+ New topic..." option that reveals an inline
// create form right there instead of sending the user to a separate
// place to make one first.
function TopicPicker({ topics, value, onChange }: { topics: TopicDef[]; value: string; onChange: (id: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    const trimmed = label.trim();
    if (!trimmed) return;
    setBusy(true);
    const res = await addTopic(trimmed).catch(() => ({ ok: false as const, error: undefined as string | undefined }));
    setBusy(false);
    if (res.ok && 'id' in res && res.id) {
      onChange(res.id);
      setAdding(false);
      setLabel('');
    }
  }

  if (adding) {
    return (
      <div className={styles.topicNewRow}>
        <input
          type="text"
          className={styles.input}
          placeholder="New topic name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          autoFocus
        />
        <button type="button" className={styles.primaryBtn} onClick={handleCreate} disabled={busy || !label.trim()}>
          {busy ? '…' : 'Create'}
        </button>
        <button type="button" className={styles.removeBtn} onClick={() => setAdding(false)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <select
      className={styles.topicSelect}
      value={value}
      onChange={(e) => (e.target.value === '__new__' ? setAdding(true) : onChange(e.target.value))}
    >
      {!topics.some((t) => t.id === value) && <option value={value}>{topicLabel(value, topics)}</option>}
      {topics.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
      <option value="__new__">+ New topic…</option>
    </select>
  );
}

function SourceRow({ source, topics }: { source: ReadingSource; topics: TopicDef[] }) {
  const [enabled, setEnabled] = useState(source.enabled);
  const [topic, setTopic] = useState(source.topic);
  const [type, setType] = useState(source.type);
  const [removed, setRemoved] = useState(false);

  function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    editSource(source.id, { enabled: next }).catch(() => {});
  }

  function handleTopic(next: string) {
    setTopic(next);
    editSource(source.id, { topic: next }).catch(() => {});
  }

  // A source auto-detected (or picked) as the wrong kind fetches nothing
  // but zero items forever - see collect_reading's per-source errors.
  // Only rss/webpage are offered here since a YouTube channel URL isn't
  // meaningfully re-classifiable as either.
  function handleKind(next: 'rss' | 'webpage') {
    setType(next);
    editSource(source.id, { type: next }).catch(() => {});
  }

  function handleDelete() {
    setRemoved(true);
    deleteSource(source.id).catch(() => {});
  }

  if (removed) return null;

  return (
    <div className={[styles.row, !enabled ? styles.rowDisabled : ''].join(' ')}>
      <button type="button" className={styles.enableDot} onClick={handleToggle} title={enabled ? 'Disable' : 'Enable'} aria-pressed={enabled} />
      <div className={styles.rowText}>
        <span className={styles.rowLabel}>{source.label}</span>
        <span className={styles.rowUrl}>{source.url}</span>
      </div>
      {type !== 'youtube' && (
        <select className={styles.topicSelect} value={type} onChange={(e) => handleKind(e.target.value as 'rss' | 'webpage')} title="Source kind">
          <option value="rss">Feed</option>
          <option value="webpage">Webpage</option>
        </select>
      )}
      {type === 'youtube' && <span className={styles.hint}>{KIND_LABEL[type]}</span>}
      <TopicPicker topics={topics} value={topic} onChange={handleTopic} />
      <button type="button" className={styles.removeBtn} onClick={handleDelete}>
        Remove
      </button>
    </div>
  );
}

function AddSourceForm({ topics }: { topics: TopicDef[] }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<'feed' | 'webpage'>('feed');
  const [topic, setTopic] = useState('interesting');
  const [status, setStatus] = useState<string | null>(null);
  const [presets, setPresets] = useState<{ group: string; feeds: { label: string; url: string }[] }[]>([]);

  useEffect(() => {
    fetchFeedPresets().then((res) => setPresets(res.presets), () => {});
  }, []);

  async function handleAdd() {
    if (!label.trim() || !url.trim()) return;
    setStatus('Adding…');
    // "Webpage" is explicit - the user picked it, so it's sent as-is. A
    // "feed" URL still auto-detects youtube vs rss the way it always has,
    // since most people pasting a feed URL never think about which kind
    // it technically is.
    const type = kind === 'webpage' ? 'webpage' : /youtube\.com|youtu\.be/i.test(url) ? 'youtube' : 'rss';
    const res = await addSource(label.trim(), url.trim(), type, topic).catch(() => ({ ok: false, error: 'Failed to add' }));
    if (res.ok) {
      setStatus('Added.');
      setLabel('');
      setUrl('');
    } else {
      setStatus(res.error || 'Failed to add');
    }
  }

  async function handlePresetAdd(preset: { label: string; url: string }) {
    setStatus(`Adding ${preset.label}…`);
    const type = /youtube\.com|youtu\.be/i.test(preset.url) ? 'youtube' : 'rss';
    const res = await addSource(preset.label, preset.url, type, 'interesting').catch(() => ({ ok: false, error: 'Failed to add' }));
    setStatus(res.ok ? `Added ${preset.label}.` : res.error || 'Failed to add');
  }

  return (
    <div className={styles.addForm}>
      <div className={styles.kindTabs}>
        <button type="button" className={[styles.kindTab, kind === 'feed' ? styles.kindTabActive : ''].join(' ')} onClick={() => setKind('feed')}>
          RSS/XML feed
        </button>
        <button type="button" className={[styles.kindTab, kind === 'webpage' ? styles.kindTabActive : ''].join(' ')} onClick={() => setKind('webpage')}>
          Webpage
        </button>
      </div>
      {kind === 'webpage' && (
        <p className={styles.hint}>
          For a regular news/article page with no feed - Control Center inspects the page and extracts its article listing automatically.
        </p>
      )}
      <div className={styles.field}>
        <input type="text" className={styles.input} placeholder="Label (e.g. The Verge)" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className={styles.field}>
        <input
          type="text"
          className={styles.input}
          placeholder={kind === 'webpage' ? 'Page URL (an article/news listing page)' : 'Feed URL (RSS/Atom, or a YouTube channel feed)'}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <TopicPicker topics={topics} value={topic} onChange={setTopic} />
      </div>
      <button type="button" className={styles.primaryBtn} onClick={handleAdd} disabled={!label.trim() || !url.trim()}>
        Add source
      </button>
      {status && <span className={styles.hint}>{status}</span>}

      {presets.length > 0 && (
        <div className={styles.presets}>
          <span className={styles.presetsHeading}>Or browse suggested sources</span>
          {presets.map((group) => (
            <div key={group.group} className={styles.presetGroup}>
              <span className={styles.presetGroupLabel}>{group.group}</span>
              <div className={styles.presetChips}>
                {group.feeds.map((feed) => (
                  <button type="button" key={feed.url} className={styles.presetChip} onClick={() => handlePresetAdd(feed)}>
                    + {feed.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Remove the topic vocabulary itself - creation lives directly in
// Reading's sidebar now (the "Add topic" row right under the topic list,
// see ReadingSidebarNav), so a topic exists the instant you make it
// instead of needing this sheet first. "interesting" is the one entry
// with no Remove control - it's the fallback every invalid/removed topic
// reassigns to (see reading_remove_topic()), so it must always exist.
// Removing a topic in use reassigns its sources/bookmarks to
// "interesting" automatically - shown here so it isn't a silent surprise.
function TopicManager({ topics, sources }: { topics: TopicDef[]; sources: ReadingSource[] }) {
  const [status, setStatus] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function usageCount(id: string) {
    return sources.filter((s) => s.topic === id).length;
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    setStatus(null);
    const res = await removeTopic(id).catch(() => ({ ok: false as const, error: 'Failed to remove' }));
    setRemovingId(null);
    if (!res.ok) setStatus(res.error || 'Failed to remove');
  }

  return (
    <div className={styles.addForm}>
      <p className={styles.hint}>Remove a topic here - to add one, use "Add topic" right under the topic list in Reading's sidebar.</p>
      {status && <span className={styles.hint}>{status}</span>}

      <div className={styles.list}>
        {topics.map((t) => {
          const count = usageCount(t.id);
          return (
            <div key={t.id} className={styles.row}>
              <div className={styles.rowText}>
                <span className={styles.rowLabel}>{t.label}</span>
                <span className={styles.rowUrl}>
                  {count === 0 ? 'Not used by any source' : `${count} source${count === 1 ? '' : 's'}`}
                </span>
              </div>
              {t.id === 'interesting' ? (
                <span className={styles.hint}>Default</span>
              ) : (
                <button type="button" className={styles.removeBtn} onClick={() => handleRemove(t.id)} disabled={removingId === t.id}>
                  {removingId === t.id ? '…' : 'Remove'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ImportSubscriptions() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleImport() {
    if (!text.trim()) return;
    setBusy(true);
    setStatus(null);
    const res = await importSubscriptions(text).catch(() => ({ ok: false as const, error: 'Import failed' }));
    setBusy(false);
    if (res.ok) {
      setStatus(`Added ${res.added} of ${res.found} channels found.`);
      setText('');
    } else {
      setStatus(res.error || 'Import failed');
    }
  }

  return (
    <div className={styles.importForm}>
      <p className={styles.hint}>
        Paste a YouTube "Takeout" subscriptions.csv export, or an OPML export from YouTube's subscription manager - every channel found gets added
        as a source.
      </p>
      <textarea className={styles.textarea} placeholder="Paste export contents here…" value={text} onChange={(e) => setText(e.target.value)} rows={8} />
      <button type="button" className={styles.primaryBtn} onClick={handleImport} disabled={!text.trim() || busy}>
        {busy ? 'Importing…' : 'Import'}
      </button>
      {status && <span className={styles.hint}>{status}</span>}
    </div>
  );
}
