import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteNote, fetchNote, moveNote, pinNote, renameNote, saveNote } from '../../api/actions/notes';
import { useSnapshotData } from '../../api/SnapshotProvider';
import type { NoteEntry } from '../../api/types';
import { FolderSetup } from '../../primitives/FolderSetup/FolderSetup';
import { Menu, type MenuItem } from '../../primitives/Menu/Menu';
import { useMenu } from '../../primitives/Menu/useMenu';
import { Sheet } from '../../primitives/Sheet/Sheet';
import { useToast } from '../../primitives/Toast/ToastProvider';
import { usePublishAppSidebar } from '../../shell/AppChromeContext';
import { useSidebarCollapsed } from '../../shell/SidebarCollapseContext';
import { duration, ease } from '../../tokens/motion';
import { AddFolderSheet } from './AddFolderSheet';
import { DocumentView } from './DocumentView';
import { PlusIcon } from './icons';
import { NewNoteSheet } from './NewNoteSheet';
import { NoteLibrary } from './NoteLibrary';
import { MoveNoteSheet } from './MoveNoteSheet';
import sheetStyles from './NoteSheets.module.css';
import styles from './NotesShell.module.css';
import { QuickCapture } from './QuickCapture';
import { RemoveFolderSheet } from './RemoveFolderSheet';
import { RenameFolderSheet } from './RenameFolderSheet';
import { RenameNoteSheet } from './RenameNoteSheet';
import { SearchOverlay } from './SearchOverlay';
import { Sidebar, type NotesCollection } from './Sidebar';

const EMPTY_NOTES: NoteEntry[] = [];
const EMPTY_FOLDERS: string[] = [];

// Owns everything Notes needs: which note is selected, its live text
// (fetched on demand - the snapshot only ever carries previews), and the
// transient surfaces (new/rename/delete/folder, quick capture, search).
// The Sidebar is no longer rendered here directly - it's published up to
// the shell's AppSidebar via usePublishAppSidebar, since the global shell
// now owns the left column for every application (see shell/AppShell).
// This component's own return value is purely the content pane.
export function NotesShell() {
  const { push } = useToast();
  const { snapshot } = useSnapshotData();
  const { collapsed } = useSidebarCollapsed();
  const notes = snapshot?.notes?.notes ?? EMPTY_NOTES;
  const folders = snapshot?.notes?.folders ?? EMPTY_FOLDERS;
  const notesConfigured = snapshot?.notes?.configured;
  const notesError = snapshot?.notes?.error;

  const [selectedRel, setSelectedRel] = useState<string | null>(null);
  const [selectedFallback, setSelectedFallback] = useState<NoteEntry | null>(null);
  const [noteText, setNoteText] = useState('');
  const [loadingNote, setLoadingNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeCollection, setActiveCollection] = useState<NotesCollection>('recent');
  const [newNoteFolder, setNewNoteFolder] = useState<string | undefined>();

  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [addFolderOpen, setAddFolderOpen] = useState(false);
  const [removeFolder, setRemoveFolder] = useState<string | null>(null);
  const [renameFolder, setRenameFolder] = useState<string | null>(null);
  const [sidebarRevision, setSidebarRevision] = useState(0);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<NoteEntry | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const noteMenu = useMenu();

  const selected = notes.find((n) => n.rel === selectedRel) ?? (selectedFallback?.rel === selectedRel ? selectedFallback : null);

  useEffect(() => {
    if (selectedFallback && notes.some((note) => note.rel === selectedFallback.rel)) setSelectedFallback(null);
  }, [notes, selectedFallback]);

  useEffect(() => {
    if (!selectedRel) return;
    let cancelled = false;
    setLoadingNote(true);
    fetchNote(selectedRel)
      .then((res) => {
        if (cancelled) return;
        setNoteText(res.ok ? res.text : '');
        if (!res.ok) setSaveError(res.error ?? "Couldn't open that note");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Couldn't open that note";
        setSaveError(message);
        push(message, 'error');
      })
      .finally(() => { if (!cancelled) setLoadingNote(false); });
    return () => {
      cancelled = true;
    };
  }, [selectedRel, push]);

  async function handleTextChange(rel: string, text: string) {
    if (selectedRel === rel) setNoteText(text);
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveNote(rel, text);
      if (!result.ok) throw new Error("Couldn't save this note");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't save this note";
      setSaveError(message);
      push(message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleTogglePin() {
    if (!selected) return;
    pinNote(selected.rel, !selected.pinned);
  }

  function handleWikiLink(name: string) {
    const target = notes.find((n) => n.name.toLowerCase() === name.toLowerCase());
    if (target) setSelectedRel(target.rel);
  }

  async function handleDelete() {
    if (!selected) return;
    try {
      const result = await deleteNote(selected.rel);
      if (!result.ok) throw new Error(result.error ?? "Couldn't delete this note");
      setDeleteOpen(false);
      setSelectedRel(null);
    } catch (error) {
      push(error instanceof Error ? error.message : "Couldn't delete this note", 'error');
    }
  }

  async function handleInlineRename(name: string) {
    if (!selected) return;
    try {
      const result = await renameNote(selected.rel, name);
      if (!result.ok || !result.rel) throw new Error(result.error ?? "Couldn't rename this note");
      const nextName = result.rel.slice(result.rel.lastIndexOf('/') + 1).replace(/\.(?:md|markdown|txt)$/i, '');
      setSelectedFallback({ ...selected, rel: result.rel, name: nextName });
      setSelectedRel(result.rel);
    } catch (error) {
      push(error instanceof Error ? error.message : "Couldn't rename this note", 'error');
    }
  }

  function handleOpenInObsidian() {
    if (!selected) return;
    window.location.href = `obsidian://open?file=${encodeURIComponent(selected.rel.replace(/\.md$/i, ''))}`;
  }

  const noteMenuItems: MenuItem[] = [
    { label: 'Move to folder…', onClick: () => selected && setMoveTarget(selected) },
    { label: 'Rename…', onClick: () => setRenameOpen(true) },
    { label: 'Open in Obsidian', onClick: handleOpenInObsidian },
    { sep: true },
    { label: 'Delete', danger: true, onClick: () => setDeleteOpen(true) },
  ];

  // Stable identities so the memoized sidebar element below only changes
  // when data genuinely changing (notes/folders/selection) demands a
  // republish - see AppChromeContext's usePublishAppSidebar contract.
  const handleTogglePinRow = useCallback((rel: string, pinned: boolean) => pinNote(rel, pinned), []);
  const handleOpenSearch = useCallback(() => setSearchOpen(true), []);
  const handleQuickCapture = useCallback(() => setCaptureOpen(true), []);
  const handleAddFolder = useCallback(() => setAddFolderOpen(true), []);
  const handleOpenCollection = useCallback((collection: NotesCollection) => {
    setActiveCollection(collection);
    setSelectedRel(null);
  }, []);
  const handleNewNote = useCallback((folder?: string) => {
    setNewNoteFolder(folder);
    setNewNoteOpen(true);
  }, []);
  const handleMoveNoteToFolder = useCallback(async (rel: string, folder: string) => {
    const note = notes.find((candidate) => candidate.rel === rel);
    if (!note || note.folder === folder) return;
    try {
      const result = await moveNote(rel, folder);
      if (!result.ok || !result.rel) throw new Error(result.error ?? "Couldn't move that note");
      if (selectedRel === rel) {
        setSelectedFallback({ ...note, rel: result.rel, folder });
        setSelectedRel(result.rel);
      }
      push(`Moved “${note.name}” to ${folder || 'Unfiled'}`);
    } catch (error) {
      push(error instanceof Error ? error.message : "Couldn't move that note", 'error');
    }
  }, [notes, push, selectedRel]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      } else if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        if (event.shiftKey) setCaptureOpen(true);
        else handleNewNote(selected?.folder || (activeCollection.startsWith('folder:') ? activeCollection.slice(7) : undefined));
      }
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [activeCollection, handleNewNote, selected?.folder]);

  usePublishAppSidebar(
    useMemo(
      () => (
        <Sidebar
          key={sidebarRevision}
          notes={notes}
          folders={folders}
          activeCollection={activeCollection}
          onOpenCollection={handleOpenCollection}
          onOpenSearch={handleOpenSearch}
          onQuickCapture={handleQuickCapture}
          onAddFolder={handleAddFolder}
          onMoveNote={handleMoveNoteToFolder}
          onRemoveFolder={setRemoveFolder}
          onRenameFolder={setRenameFolder}
          collapsed={collapsed}
        />
      ),
      [notes, folders, activeCollection, handleOpenCollection, handleOpenSearch, handleQuickCapture, handleAddFolder, handleMoveNoteToFolder, collapsed, sidebarRevision],
    ),
  );

  return (
    <div className={styles.main}>
      {notesConfigured === false ? (
        <FolderSetup
          settingKey="notes_dir"
          title="Choose your notes folder"
          description="Control Center reads plain Markdown (.md) files straight from a folder you pick — no Obsidian required. If you already use Obsidian, point it at the same folder and both apps stay in sync."
        />
      ) : notesError ? (
        <div className={styles.state}>{notesError}</div>
      ) : !selected ? (
        <NoteLibrary collection={activeCollection} notes={notes} onSelect={setSelectedRel} onNew={handleNewNote} onTogglePin={handleTogglePinRow} onRequestMove={setMoveTarget} />
      ) : (
        <DocumentView
          note={selected}
          text={noteText}
          loading={loadingNote}
          saving={saving}
          saveError={saveError}
          onTextChange={handleTextChange}
          onTogglePin={handleTogglePin}
          onMove={() => setMoveTarget(selected)}
          onRename={handleInlineRename}
          onWikiLink={handleWikiLink}
          onOpenMenu={noteMenu.openAt}
        />
      )}

      <motion.button
        type="button"
        className={styles.fab}
        onClick={() => handleNewNote(selected?.folder || (activeCollection.startsWith('folder:') ? activeCollection.slice(7) : undefined))}
        aria-label="New note"
        title="New note"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        transition={{ duration: duration.fast, ease }}
      >
        <motion.span className={styles.fabIcon} whileHover={{ rotate: 90 }} transition={{ duration: duration.base, ease }}>
          <PlusIcon />
        </motion.span>
      </motion.button>

      <Menu open={noteMenu.open} x={noteMenu.x} y={noteMenu.y} items={noteMenuItems} onClose={noteMenu.close} />

      <NewNoteSheet open={newNoteOpen} onClose={() => setNewNoteOpen(false)} folders={folders} defaultFolder={newNoteFolder} onCreated={setSelectedRel} />
      <QuickCapture open={captureOpen} onClose={() => setCaptureOpen(false)} onCreated={setSelectedRel} />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} notes={notes} onSelect={setSelectedRel} />
      <AddFolderSheet open={addFolderOpen} onClose={() => setAddFolderOpen(false)} onCreated={setSelectedRel} />
      <RemoveFolderSheet
        folder={removeFolder}
        folders={folders}
        notes={notes}
        onClose={() => setRemoveFolder(null)}
        onRemoved={(folder, moved) => {
          if (activeCollection === `folder:${folder}` || activeCollection.startsWith(`folder:${folder}/`)) setActiveCollection('all');
          const selectedMove = moved.find((item) => item.from === selectedRel);
          if (selectedMove) setSelectedRel(selectedMove.to);
          updateStoredFolderIcons(folder, null);
          setSidebarRevision((current) => current + 1);
          push(`Removed “${folder.split('/').at(-1)}” without deleting its notes`);
        }}
      />
      <RenameFolderSheet
        folder={renameFolder}
        onClose={() => setRenameFolder(null)}
        onRenamed={(from, to) => {
          if (activeCollection === `folder:${from}` || activeCollection.startsWith(`folder:${from}/`)) setActiveCollection(`folder:${to}${activeCollection.slice(`folder:${from}`.length)}` as NotesCollection);
          if (selectedRel === from || selectedRel?.startsWith(`${from}/`)) setSelectedRel(`${to}${selectedRel.slice(from.length)}`);
          updateStoredFolderIcons(from, to);
          setSidebarRevision((current) => current + 1);
          push(`Renamed folder to “${to.split('/').at(-1)}”`);
        }}
      />
      {moveTarget && (
        <MoveNoteSheet
          open
          onClose={() => setMoveTarget(null)}
          rel={moveTarget.rel}
          currentFolder={moveTarget.folder}
          folders={folders}
          onMoved={(rel) => {
            const nextFolder = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
            if (selectedRel === moveTarget.rel) {
              setSelectedFallback({ ...moveTarget, rel, folder: nextFolder });
              setSelectedRel(rel);
              setActiveCollection(nextFolder ? `folder:${nextFolder}` : 'unfiled');
            }
            setMoveTarget(null);
          }}
        />
      )}
      {selected && (
        <>
          <RenameNoteSheet
            open={renameOpen}
            onClose={() => setRenameOpen(false)}
            rel={selected.rel}
            currentName={selected.name}
            onRenamed={(rel) => {
              const nextName = rel.slice(rel.lastIndexOf('/') + 1).replace(/\.(?:md|markdown|txt)$/i, '');
              setSelectedFallback({ ...selected, rel, name: nextName });
              setSelectedRel(rel);
            }}
          />
        </>
      )}

      <Sheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this note?"
        size="compact"
        subtitle={selected ? `"${selected.name}" will be permanently removed from the vault.` : undefined}
        actions={
          <>
            <button type="button" className={sheetStyles.btn} onClick={() => setDeleteOpen(false)}>
              Cancel
            </button>
            <button type="button" className={`${sheetStyles.btn} ${sheetStyles.danger}`} onClick={handleDelete}>
              Delete
            </button>
          </>
        }
      >
        <span className={sheetStyles.hint}>This can't be undone from here - the file is gone, not moved to a recycle bin.</span>
      </Sheet>
    </div>
  );
}

function updateStoredFolderIcons(from: string, to: string | null) {
  try {
    const current = JSON.parse(localStorage.getItem('control-center.notes.folder-icons.v1') || '{}') as Record<string, string>;
    const next: Record<string, string> = {};
    for (const [path, icon] of Object.entries(current)) {
      if (path === from || path.startsWith(`${from}/`)) {
        if (to) next[`${to}${path.slice(from.length)}`] = icon;
      } else next[path] = icon;
    }
    localStorage.setItem('control-center.notes.folder-icons.v1', JSON.stringify(next));
  } catch {
    // A corrupt cosmetic preference must never block folder operations.
  }
}
