import { useEffect, useState } from 'react';
import { addSource, deleteSource, editSource, fetchFeedPresets, importSubscriptions } from '../../api/actions/reading';
import type { ReadingSource } from '../../api/types';
import { Sheet } from '../../primitives/Sheet/Sheet';
import { TOPIC_LABELS, TOPIC_ORDER } from './topics';
import styles from './SourceManagerSheet.module.css';

interface SourceManagerSheetProps {
  open: boolean;
  onClose: () => void;
  sources: ReadingSource[];
}

type Tab = 'sources' | 'add' | 'import';

// Everything needed to shape what feeds into Reading, in one place: the
// current source list (enable/retag/remove), a manual-add form plus a
// one-click browser over the curated FEED_PRESETS, and a YouTube
// subscriptions import. The feed/sidebar themselves never need to know
// this exists - sources changing just means different content on the
// next poll.
export function SourceManagerSheet({ open, onClose, sources }: SourceManagerSheetProps) {
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
        <button type="button" className={[styles.tab, tab === 'import' ? styles.tabActive : ''].join(' ')} onClick={() => setTab('import')}>
          Import YouTube
        </button>
      </div>

      {tab === 'sources' && <SourceList sources={sources} />}
      {tab === 'add' && <AddSourceForm />}
      {tab === 'import' && <ImportSubscriptions />}
    </Sheet>
  );
}

function SourceList({ sources }: { sources: ReadingSource[] }) {
  if (sources.length === 0) {
    return <p className={styles.hint}>No sources yet - add one from the "Add source" tab.</p>;
  }
  return (
    <div className={styles.list}>
      {sources.map((source) => (
        <SourceRow key={source.id} source={source} />
      ))}
    </div>
  );
}

const KIND_LABEL: Record<ReadingSource['type'], string> = { rss: 'Feed', youtube: 'YouTube', webpage: 'Webpage' };

function SourceRow({ source }: { source: ReadingSource }) {
  const [enabled, setEnabled] = useState(source.enabled);
  const [topic, setTopic] = useState(source.topic);
  const [type, setType] = useState(source.type);
  const [removed, setRemoved] = useState(false);

  function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    editSource(source.id, { enabled: next }).catch(() => {});
  }

  function handleTopic(next: ReadingSource['topic']) {
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
      <select className={styles.topicSelect} value={topic} onChange={(e) => handleTopic(e.target.value as ReadingSource['topic'])}>
        {TOPIC_ORDER.map((t) => (
          <option key={t} value={t}>
            {TOPIC_LABELS[t]}
          </option>
        ))}
      </select>
      <button type="button" className={styles.removeBtn} onClick={handleDelete}>
        Remove
      </button>
    </div>
  );
}

function AddSourceForm() {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<'feed' | 'webpage'>('feed');
  const [topic, setTopic] = useState<ReadingSource['topic']>('interesting');
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
        <select className={styles.topicSelect} value={topic} onChange={(e) => setTopic(e.target.value as ReadingSource['topic'])}>
          {TOPIC_ORDER.map((t) => (
            <option key={t} value={t}>
              {TOPIC_LABELS[t]}
            </option>
          ))}
        </select>
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
