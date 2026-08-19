import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { NoteEntry } from '../../api/types';
import { duration, ease } from '../../tokens/motion';
import { buildFolderTree, collectAllTreePaths, collectSubtreePaths, type FolderNode } from './folderTree';
import { CaptureIcon, ChevronIcon, ClockIcon, FolderIcon, FolderPlusIcon, NoteIcon, SearchIcon, StackIcon, StarIcon } from './icons';
import styles from './Sidebar.module.css';

interface SidebarProps {
  notes: NoteEntry[];
  folders: string[];
  selectedRel: string | null;
  onSelect: (rel: string) => void;
  onTogglePin: (rel: string, pinned: boolean) => void;
  onOpenSearch: () => void;
  onQuickCapture: () => void;
  onAddFolder: () => void;
  collapsed?: boolean;
}

type SectionId = 'recent' | 'pinned' | 'all';

// A real navigation column, not a list of tiny text rows - every top
// action and section header carries an icon, has real click-target
// height, and real vertical rhythm between groups. Search/Capture are
// nav rows that open full app-level overlays (see SearchOverlay/
// QuickCapture) rather than living as squeezed-in inline controls;
// New Note lives outside this component entirely now (the floating
// button in NotesShell) so this column is purely "find/organize", not
// "find + create + capture" crammed into one row.
export function Sidebar({ notes, folders, selectedRel, onSelect, onTogglePin, onOpenSearch, onQuickCapture, onAddFolder, collapsed }: SidebarProps) {
  // Recent starts collapsed - a compact nav item until asked for, not a
  // permanently-expanded block. Pinned is genuinely independent data too,
  // not just a separately-rendered view of the same list: a pinned note
  // that's also recently touched shows up in Pinned only, so the two
  // sections never duplicate the same row.
  const [open, setOpen] = useState<Set<SectionId>>(new Set(['pinned']));

  const pinned = useMemo(() => notes.filter((n) => n.pinned), [notes]);
  const recent = useMemo(() => notes.filter((n) => !n.pinned).slice(0, 6), [notes]);
  const tree = useMemo(() => buildFolderTree(folders, notes), [folders, notes]);
  // The set of paths to seed "start collapsed" from - deliberately the
  // tree's OWN paths, not the raw `folders` prop. server.py's folders
  // list only contains folders that directly hold a note; an ancestor
  // folder holding only subfolders (no notes of its own) is missing
  // from it even though buildFolderTree still creates a real node for
  // it, so seeding from `folders` directly left exactly those
  // note-less ancestor folders expanded on first load (see
  // folderTree.ts's collectAllTreePaths for the full explanation).
  const allTreePaths = useMemo(() => collectAllTreePaths(tree), [tree]);

  // Every folder starts collapsed - opening Notes shouldn't dump the
  // whole vault tree open. `knownFolders` tracks which paths have
  // already been folded into `collapsedFolders` once, so a later poll
  // tick (the tree is rebuilt fresh every time notes/folders arrive,
  // even when unchanged) only collapses genuinely *new* folders instead
  // of re-collapsing ones the user just expanded by hand.
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set(allTreePaths));
  const knownFolders = useRef<Set<string>>(new Set(allTreePaths));

  useEffect(() => {
    const fresh = allTreePaths.filter((f) => !knownFolders.current.has(f));
    if (fresh.length === 0) return;
    fresh.forEach((f) => knownFolders.current.add(f));
    setCollapsedFolders((prev) => new Set([...prev, ...fresh]));
  }, [allTreePaths]);

  // Notes with no folder ('' - vault root) never appear inside a
  // FolderRow (there's no tree node for ""), so without this they only
  // ever showed up in Recent/Pinned/All Notes - invisible on a normal
  // day if a root note wasn't touched recently. Rendered as its own
  // always-visible group above the folder tree, not folded into it.
  const rootNotes = useMemo(() => notes.filter((n) => !n.folder), [notes]);

  function toggleSection(id: SectionId) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Expanding only reveals this one level (children stay in whatever
  // state they're already in, same as most file trees). Collapsing
  // takes the whole subtree with it - without that, an expanded child
  // folder was invisibly preserved open underneath its collapsed
  // parent, and reappeared open the moment the parent was reopened.
  function toggleFolder(node: FolderNode) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(node.path)) next.delete(node.path);
      else collectSubtreePaths(node).forEach((p) => next.add(p));
      return next;
    });
  }

  const rowProps = { selectedRel, onSelect, onTogglePin };

  return (
    <nav className={styles.sidebar} data-collapsed={collapsed ? '' : undefined}>
      <div className={styles.brand}>
        <span className={styles.brandGlyph}><NoteIcon size={18} /></span>
        <span className={styles.brandCopy}>
          <strong>Notes</strong>
          <small>{notes.length} {notes.length === 1 ? 'note' : 'notes'}</small>
        </span>
      </div>

      <div className={styles.top}>
        <button type="button" className={`${styles.navRow} ${styles.searchRow}`} onClick={onOpenSearch} title={collapsed ? 'Find a note' : undefined}>
          <span className={styles.navIcon}>
            <SearchIcon />
          </span>
          <span className={styles.navLabel}>Find a note</span>
        </button>
        <button type="button" className={`${styles.navRow} ${styles.captureRow}`} onClick={onQuickCapture} title={collapsed ? 'Quick Capture' : undefined}>
          <span className={`${styles.navIcon} ${styles.captureIcon}`}>
            <CaptureIcon />
          </span>
          <span className={styles.navLabel}>Quick Capture</span>
        </button>
        {collapsed && (
          <button type="button" className={styles.navRow} onClick={onAddFolder} title="Add folder">
            <span className={styles.navIcon}>
              <FolderPlusIcon />
            </span>
            <span className={styles.navLabel}>Add folder</span>
          </button>
        )}
      </div>

      {/* The folder tree/sections have no meaningful icon-only form (file
          trees don't collapse into a rail the way a flat nav list does) -
          collapsed mode shows just the actions above; expanding is how
          you get back to browsing, same as any collapsed nav. */}
      {!collapsed && (
        <div className={styles.scroll}>
          <div className={styles.groupLabel}>Library</div>
          {pinned.length > 0 && (
            <Section id="pinned" icon={<StarIcon />} label="Pinned" count={pinned.length} open={open.has('pinned')} onToggle={toggleSection}>
              <Rows notes={pinned} {...rowProps} />
            </Section>
          )}

          <Section id="recent" icon={<ClockIcon />} label="Recent" count={recent.length} open={open.has('recent')} onToggle={toggleSection}>
            <Rows notes={recent} {...rowProps} />
          </Section>

          <Section id="all" icon={<StackIcon />} label="All Notes" count={notes.length} open={open.has('all')} onToggle={toggleSection}>
            <Rows notes={notes} {...rowProps} />
          </Section>

          <div className={styles.foldersHead}>
            <span className={styles.foldersCopy}>
              <strong>Folders</strong>
              <small>Collections and loose notes</small>
            </span>
            <button type="button" className={styles.addFolderBtn} onClick={onAddFolder} title="Add folder">
              <FolderPlusIcon />
            </button>
          </div>
          {tree.length === 0 && rootNotes.length === 0 ? (
            <div className={styles.emptyFolders}>
              <strong>No folders yet</strong>
              <span>Create one to organize related notes.</span>
              <button type="button" onClick={onAddFolder}>Create folder</button>
            </div>
          ) : <>
            {tree.map((node) => (
              <FolderRow key={node.path} node={node} depth={0} collapsed={collapsedFolders} onToggle={toggleFolder} {...rowProps} showIcon />
            ))}
            {rootNotes.length > 0 && <div className={styles.looseNotes}><Rows notes={rootNotes} {...rowProps} /></div>}
          </>}
        </div>
      )}
    </nav>
  );
}

function Section({
  id,
  icon,
  label,
  count,
  open,
  onToggle,
  children,
}: {
  id: SectionId;
  icon: React.ReactNode;
  label: string;
  count: number;
  open: boolean;
  onToggle: (id: SectionId) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.section}>
      <button type="button" className={styles.sectionHead} aria-expanded={open} onClick={() => onToggle(id)}>
        <ChevronIcon open={open} />
        <span className={styles.navIcon}>{icon}</span>
        <span className={styles.sectionLabel}>{label}</span>
        <span className={styles.sectionCount}>{count}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: duration.base, ease }}
            style={{ overflow: 'hidden' }}
          >
            <div className={styles.sectionBody}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FolderRow({
  node,
  depth,
  collapsed,
  onToggle,
  showIcon,
  ...rowProps
}: {
  node: FolderNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (node: FolderNode) => void;
  showIcon?: boolean;
} & Pick<SidebarProps, 'selectedRel' | 'onSelect' | 'onTogglePin'>) {
  const isOpen = !collapsed.has(node.path);
  return (
    <div>
      <button type="button" className={styles.folderRow} style={{ paddingLeft: 10 + depth * 16 }} onClick={() => onToggle(node)}>
        <ChevronIcon open={isOpen} size={10} />
        {showIcon && (
          <span className={styles.folderIcon}>
            <FolderIcon />
          </span>
        )}
        <span className={styles.folderName}>{node.name}</span>
        <span className={styles.folderCount}>{node.notes.length}</span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: duration.fast, ease }}
            style={{ overflow: 'hidden' }}
          >
            <Rows notes={node.notes} depth={depth + 1} {...rowProps} />
            {node.children.map((child) => (
              <FolderRow key={child.path} node={child} depth={depth + 1} collapsed={collapsed} onToggle={onToggle} showIcon={showIcon} {...rowProps} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Rows({
  notes,
  depth = 0,
  selectedRel,
  onSelect,
  onTogglePin,
}: {
  notes: NoteEntry[];
  depth?: number;
} & Pick<SidebarProps, 'selectedRel' | 'onSelect' | 'onTogglePin'>) {
  return (
    <>
      {notes.map((n) => (
        <div
          key={n.rel}
          role="button"
          tabIndex={0}
          className={[styles.row, n.rel === selectedRel ? styles.rowActive : ''].filter(Boolean).join(' ')}
          style={{ paddingLeft: 10 + depth * 16 + (depth > 0 ? 16 : 0) }}
          onClick={() => onSelect(n.rel)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(n.rel);
            }
          }}
        >
          <span className={styles.rowMain}>
            <span className={styles.rowIcon}>
              <NoteIcon size={14} />
            </span>
            <span className={styles.rowName}>{n.name}</span>
          </span>
          <span className={styles.rowMeta}>
            <button
              type="button"
              className={[styles.pinBtn, n.pinned ? styles.pinBtnActive : ''].filter(Boolean).join(' ')}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(n.rel, !n.pinned);
              }}
              title={n.pinned ? 'Unpin' : 'Pin'}
            >
              <StarIcon filled={n.pinned} size={12} />
            </button>
          </span>
        </div>
      ))}
    </>
  );
}
