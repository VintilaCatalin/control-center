import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { NoteEntry } from '../../api/types';
import { GlyphPicker } from '../../primitives/GlyphPicker/GlyphPicker';
import { GlyphIcon } from '../../primitives/GlyphPicker/glyphs';
import { Menu, type MenuItem } from '../../primitives/Menu/Menu';
import { useMenu } from '../../primitives/Menu/useMenu';
import { buildFolderTree, collectAllTreePaths, type FolderNode } from './folderTree';
import { CaptureIcon, ChevronIcon, ClockIcon, NoteIcon, SearchIcon, StackIcon, StarIcon } from './icons';
import styles from './Sidebar.module.css';

export type NotesCollection = 'recent' | 'all' | 'pinned' | 'unfiled' | `folder:${string}`;

interface SidebarProps {
  notes: NoteEntry[];
  folders: string[];
  activeCollection: NotesCollection;
  onOpenCollection: (collection: NotesCollection) => void;
  onOpenSearch: () => void;
  onQuickCapture: () => void;
  onAddFolder: () => void;
  onMoveNote: (rel: string, folder: string) => void;
  onRemoveFolder: (folder: string) => void;
  onRenameFolder: (folder: string) => void;
  collapsed?: boolean;
}

export function Sidebar({ notes, folders, activeCollection, onOpenCollection, onOpenSearch, onQuickCapture, onAddFolder, onMoveNote, onRemoveFolder, onRenameFolder, collapsed }: SidebarProps) {
  // Older Quick Capture builds filed notes into a synthetic "Quick Notes"
  // folder. Treat it as a legacy inbox so those files surface in Unfiled
  // without moving user data behind their back.
  const tree = useMemo(() => buildFolderTree(folders.filter((folder) => folder !== 'Quick Notes'), notes.filter((note) => note.folder !== 'Quick Notes')), [folders, notes]);
  const pinnedCount = notes.filter((note) => note.pinned).length;
  const unfiledCount = notes.filter((note) => !note.folder || note.folder === 'Quick Notes').length;
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [folderIcons, setFolderIcons] = useState<Record<string, string>>(readFolderIcons);
  const [iconPicker, setIconPicker] = useState<{ folder: string; x: number; y: number } | null>(null);
  const initializedTree = useRef(false);
  const folderMenu = useMenu();
  const [menuFolder, setMenuFolder] = useState<string | null>(null);

  useEffect(() => {
    if (initializedTree.current || !tree.length) return;
    setCollapsedFolders(new Set(collectAllTreePaths(tree)));
    initializedTree.current = true;
  }, [tree]);

  function toggleFolder(path: string) {
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function openIconPicker(path: string, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const box = event.currentTarget.getBoundingClientRect();
    setIconPicker({ folder: path, x: box.left, y: box.bottom + 8 });
  }

  function setFolderIcon(path: string, icon: string) {
    setFolderIcons((current) => {
      const next = { ...current, [path]: icon };
      localStorage.setItem('control-center.notes.folder-icons.v1', JSON.stringify(next));
      return next;
    });
  }

  const folderMenuItems: MenuItem[] = menuFolder ? [
    { label: 'Change icon…', icon: <GlyphIcon icon={folderIcons[menuFolder] || 'folder'} />, onClick: () => setIconPicker({ folder: menuFolder, x: folderMenu.x, y: folderMenu.y }) },
    { label: 'Rename…', onClick: () => onRenameFolder(menuFolder) },
    { sep: true },
    { label: 'Remove folder…', danger: true, onClick: () => onRemoveFolder(menuFolder) },
  ] : [];

  return (
    <nav className={styles.sidebar} data-collapsed={collapsed ? '' : undefined} aria-label="Notes navigation">
      <button type="button" className={styles.brand} onClick={() => onOpenCollection('recent')} title={collapsed ? 'Notes' : undefined}>
        <span className={styles.brandGlyph}><NoteIcon size={18} /></span>
        <span className={styles.brandCopy}>
          <strong>Notes</strong>
          <small>{notes.length} {notes.length === 1 ? 'note' : 'notes'}</small>
        </span>
      </button>

      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={onOpenSearch} title={collapsed ? 'Find a note' : undefined}>
          <SearchIcon />
          <span>Find a note</span>
          {!collapsed && <kbd>Ctrl K</kbd>}
        </button>
        <button type="button" className={styles.action} onClick={onQuickCapture} title={collapsed ? 'Quick capture' : undefined}>
          <CaptureIcon />
          <span>Quick capture</span>
        </button>
      </div>

      {!collapsed && (
        <div className={styles.scroll}>
          <p className={styles.eyebrow}>Library</p>
          <CollectionRow active={activeCollection === 'recent'} icon={<ClockIcon />} label="Recent" count={Math.min(notes.length, 12)} onClick={() => onOpenCollection('recent')} />
          <CollectionRow active={activeCollection === 'all'} icon={<StackIcon />} label="All notes" count={notes.length} onClick={() => onOpenCollection('all')} />
          <CollectionRow active={activeCollection === 'pinned'} icon={<StarIcon />} label="Pinned" count={pinnedCount} onClick={() => onOpenCollection('pinned')} />
          <CollectionRow active={activeCollection === 'unfiled'} icon={<NoteIcon />} label="Unfiled" count={unfiledCount} onClick={() => onOpenCollection('unfiled')} dropActive={dropTarget === ''} onDragEnter={() => setDropTarget('')} onDragLeave={() => setDropTarget(null)} onDrop={(rel) => { setDropTarget(null); onMoveNote(rel, ''); }} />

          <div className={styles.foldersHead}>
            <p className={styles.eyebrow}>Folders</p>
            <button type="button" className={styles.addFolder} onClick={onAddFolder} title="New folder" aria-label="New folder"><span aria-hidden="true">+</span></button>
          </div>
          {tree.length ? (
            <div className={styles.folderTree}>
              {tree.map((node) => <FolderRow key={node.path} node={node} depth={0} activeCollection={activeCollection} collapsedFolders={collapsedFolders} onToggle={toggleFolder} onOpenCollection={onOpenCollection} onMoveNote={onMoveNote} dropTarget={dropTarget} setDropTarget={setDropTarget} folderIcons={folderIcons} onOpenIconPicker={openIconPicker} onOpenMenu={(path, event) => { setMenuFolder(path); folderMenu.openAt(event); }} />)}
            </div>
          ) : (
            <button type="button" className={styles.emptyFolders} onClick={onAddFolder}>
              <strong>No folders yet</strong>
              <span>Create one when a note needs a home.</span>
            </button>
          )}
        </div>
      )}
      <Menu open={folderMenu.open} x={folderMenu.x} y={folderMenu.y} items={folderMenuItems} onClose={folderMenu.close} />
      <GlyphPicker open={!!iconPicker} x={iconPicker?.x ?? 0} y={iconPicker?.y ?? 0} value={iconPicker ? folderIcons[iconPicker.folder] || 'folder' : 'folder'} onChange={(icon) => { if (iconPicker) setFolderIcon(iconPicker.folder, icon); }} onClose={() => setIconPicker(null)} />
    </nav>
  );
}

function CollectionRow({ active, icon, label, count, onClick, dropActive, onDragEnter, onDragLeave, onDrop }: { active: boolean; icon: React.ReactNode; label: string; count: number; onClick: () => void; dropActive?: boolean; onDragEnter?: () => void; onDragLeave?: () => void; onDrop?: (rel: string) => void }) {
  return (
    <button type="button" className={`${styles.collection} ${active ? styles.active : ''} ${dropActive ? styles.dropActive : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined} onDragOver={onDrop ? (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } : undefined} onDragEnter={onDrop ? (event) => { event.preventDefault(); onDragEnter?.(); } : undefined} onDragLeave={onDrop ? onDragLeave : undefined} onDrop={onDrop ? (event) => { event.preventDefault(); const rel = event.dataTransfer.getData('application/x-control-center-note'); if (rel) onDrop(rel); } : undefined}>
      <span className={styles.rowIcon}>{icon}</span>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.count}>{count}</span>
    </button>
  );
}

function FolderRow({ node, depth, activeCollection, collapsedFolders, onToggle, onOpenCollection, onMoveNote, dropTarget, setDropTarget, folderIcons, onOpenIconPicker, onOpenMenu }: { node: FolderNode; depth: number; activeCollection: NotesCollection; collapsedFolders: Set<string>; onToggle: (path: string) => void; onOpenCollection: (collection: NotesCollection) => void; onMoveNote: (rel: string, folder: string) => void; dropTarget: string | null; setDropTarget: (path: string | null) => void; folderIcons: Record<string, string>; onOpenIconPicker: (path: string, event: MouseEvent<HTMLButtonElement>) => void; onOpenMenu: (path: string, event: React.MouseEvent) => void }) {
  const collection: NotesCollection = `folder:${node.path}`;
  const hasChildren = node.children.length > 0;
  const open = !collapsedFolders.has(node.path);
  return (
    <>
      <div className={`${styles.folderLine} ${dropTarget === node.path ? styles.dropActive : ''}`} style={{ paddingLeft: depth * 15 }} onContextMenu={(event) => onOpenMenu(node.path, event)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDragEnter={(event) => { event.preventDefault(); setDropTarget(node.path); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null); }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const rel = event.dataTransfer.getData('application/x-control-center-note'); setDropTarget(null); if (rel) onMoveNote(rel, node.path); }}>
        {hasChildren ? <button type="button" className={styles.folderToggle} onClick={() => onToggle(node.path)} aria-label={`${open ? 'Collapse' : 'Expand'} ${node.name}`} aria-expanded={open}><ChevronIcon open={open} /></button> : <span className={styles.folderToggleSpace} />}
        <div className={`${styles.collection} ${styles.folder} ${activeCollection === collection ? styles.active : ''}`}>
          <button type="button" className={styles.folderGlyph} onClick={(event) => onOpenIconPicker(node.path, event)} aria-label={`Change ${node.name} icon`} title="Change folder icon"><GlyphIcon icon={folderIcons[node.path] || 'folder'} /></button>
          <button type="button" className={styles.folderOpen} onClick={() => onOpenCollection(collection)} aria-current={activeCollection === collection ? 'page' : undefined}>
            <span className={styles.rowLabel}>{node.name}</span>
            <span className={styles.count}>{countNotes(node)}</span>
          </button>
        </div>
      </div>
      {open && node.children.map((child) => <FolderRow key={child.path} node={child} depth={depth + 1} activeCollection={activeCollection} collapsedFolders={collapsedFolders} onToggle={onToggle} onOpenCollection={onOpenCollection} onMoveNote={onMoveNote} dropTarget={dropTarget} setDropTarget={setDropTarget} folderIcons={folderIcons} onOpenIconPicker={onOpenIconPicker} onOpenMenu={onOpenMenu} />)}
    </>
  );
}

function readFolderIcons(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem('control-center.notes.folder-icons.v1') || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function countNotes(node: FolderNode): number {
  return node.notes.length + node.children.reduce((total, child) => total + countNotes(child), 0);
}
