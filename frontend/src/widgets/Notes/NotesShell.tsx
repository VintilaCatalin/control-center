import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteNote, fetchNote, pinNote, saveNote } from '../../api/actions/notes';
import { useSnapshotData } from '../../api/SnapshotProvider';
import { FolderSetup } from '../../primitives/FolderSetup/FolderSetup';
import { Menu, type MenuItem } from '../../primitives/Menu/Menu';
import { useMenu } from '../../primitives/Menu/useMenu';
import { Sheet } from '../../primitives/Sheet/Sheet';
import { usePublishAppSidebar } from '../../shell/AppChromeContext';
import { useSidebarCollapsed } from '../../shell/SidebarCollapseContext';
import { duration, ease } from '../../tokens/motion';
import { AddFolderSheet } from './AddFolderSheet';
import { DocumentView } from './DocumentView';
import { PlusIcon } from './icons';
import { NewNoteSheet } from './NewNoteSheet';
import sheetStyles from './NoteSheets.module.css';
import styles from './NotesShell.module.css';
import { QuickCapture } from './QuickCapture';
import { RenameNoteSheet } from './RenameNoteSheet';
import { SearchOverlay } from './SearchOverlay';
import { Sidebar } from './Sidebar';

// Owns everything Notes needs: which note is selected, its live text
// (fetched on demand - the snapshot only ever carries previews), and the
// transient surfaces (new/rename/delete/folder, quick capture, search).
// The Sidebar is no longer rendered here directly - it's published up to
// the shell's AppSidebar via usePublishAppSidebar, since the global shell
// now owns the left column for every application (see shell/AppShell).
// This component's own return value is purely the content pane.
export function NotesShell() {
  const { snapshot } = useSnapshotData();
  const { collapsed } = useSidebarCollapsed();
  const notes = snapshot?.notes?.notes ?? [];
  const folders = snapshot?.notes?.folders ?? [];
  const notesConfigured = snapshot?.notes?.configured;
  const notesError = snapshot?.notes?.error;

  const [selectedRel, setSelectedRel] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [loadingNote, setLoadingNote] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [addFolderOpen, setAddFolderOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const noteMenu = useMenu();

  const selected = notes.find((n) => n.rel === selectedRel) ?? null;

  useEffect(() => {
    if (!selectedRel) return;
    let cancelled = false;
    setLoadingNote(true);
    fetchNote(selectedRel).then((res) => {
      if (cancelled) return;
      setNoteText(res.ok ? res.text : '');
      setLoadingNote(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedRel]);

  async function handleTextChange(text: string) {
    if (!selectedRel) return;
    setNoteText(text);
    setSaving(true);
    try {
      await saveNote(selectedRel, text);
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
    await deleteNote(selected.rel);
    setDeleteOpen(false);
    setSelectedRel(null);
  }

  function handleOpenInObsidian() {
    if (!selected) return;
    window.location.href = `obsidian://open?file=${encodeURIComponent(selected.rel.replace(/\.md$/i, ''))}`;
  }

  const noteMenuItems: MenuItem[] = [
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

  usePublishAppSidebar(
    useMemo(
      () => (
        <Sidebar
          notes={notes}
          folders={folders}
          selectedRel={selectedRel}
          onSelect={setSelectedRel}
          onTogglePin={handleTogglePinRow}
          onOpenSearch={handleOpenSearch}
          onQuickCapture={handleQuickCapture}
          onAddFolder={handleAddFolder}
          collapsed={collapsed}
        />
      ),
      [notes, folders, selectedRel, handleTogglePinRow, handleOpenSearch, handleQuickCapture, handleAddFolder, collapsed],
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
        <div className={styles.empty}>
          <button type="button" className={styles.emptyBtn} onClick={() => setNewNoteOpen(true)}>
            <PlusIcon />
            Add a new note
          </button>
        </div>
      ) : (
        <DocumentView
          note={selected}
          text={noteText}
          loading={loadingNote}
          saving={saving}
          onTextChange={handleTextChange}
          onTogglePin={handleTogglePin}
          onWikiLink={handleWikiLink}
          onOpenMenu={noteMenu.openAt}
        />
      )}

      <motion.button
        type="button"
        className={styles.fab}
        onClick={() => setNewNoteOpen(true)}
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

      <NewNoteSheet open={newNoteOpen} onClose={() => setNewNoteOpen(false)} folders={folders} onCreated={setSelectedRel} />
      <QuickCapture open={captureOpen} onClose={() => setCaptureOpen(false)} onCreated={setSelectedRel} />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} notes={notes} onSelect={setSelectedRel} />
      <AddFolderSheet open={addFolderOpen} onClose={() => setAddFolderOpen(false)} onCreated={setSelectedRel} />
      {selected && (
        <RenameNoteSheet
          open={renameOpen}
          onClose={() => setRenameOpen(false)}
          rel={selected.rel}
          currentName={selected.name}
          onRenamed={setSelectedRel}
        />
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
