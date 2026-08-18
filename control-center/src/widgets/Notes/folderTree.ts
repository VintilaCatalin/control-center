import type { NoteEntry } from '../../api/types';

export interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  notes: NoteEntry[];
}

// server.py's `folders` list is already a flat set of full paths
// ("Projects", "Projects/Sub") - this turns that plus each note's own
// `folder` into a real nested tree the sidebar can render as a
// collapsible outline, without inventing a folder entity server-side
// (there still isn't one - a folder only exists because a note's path
// implies it).
export function buildFolderTree(folders: string[], notes: NoteEntry[]): FolderNode[] {
  const root: FolderNode = { name: '', path: '', children: [], notes: [] };
  const byPath = new Map<string, FolderNode>([['', root]]);

  for (const folder of [...folders].sort((a, b) => a.localeCompare(b))) {
    const parts = folder.split('/');
    let parentPath = '';
    for (let i = 0; i < parts.length; i++) {
      const path = parts.slice(0, i + 1).join('/');
      if (!byPath.has(path)) {
        const node: FolderNode = { name: parts[i], path, children: [], notes: [] };
        byPath.get(parentPath)!.children.push(node);
        byPath.set(path, node);
      }
      parentPath = path;
    }
  }

  for (const note of notes) {
    const node = byPath.get(note.folder) ?? root;
    node.notes.push(note);
  }

  return root.children;
}

// Every path in a node's own subtree, itself included - used when
// collapsing a folder so its descendants collapse with it (see
// Sidebar.tsx's toggleFolder), not just the clicked node, so
// re-expanding it later starts from a clean fully-collapsed subtree
// instead of resurrecting whatever expand state the children happened
// to be left in.
export function collectSubtreePaths(node: FolderNode): string[] {
  return [node.path, ...node.children.flatMap(collectSubtreePaths)];
}

// Every folder path that actually exists in the tree, at every depth -
// deliberately NOT the same as the raw `folders` prop server.py sends
// (server.py:784's `{n["folder"] for n in notes if n["folder"]}` only
// ever contains folders that directly hold at least one note; an
// ancestor folder that holds only subfolders, no notes of its own, is
// never in that set, even though buildFolderTree still synthesises a
// real node for it). Sidebar.tsx has to seed its "start collapsed" set
// from THIS, not from `folders` directly, or exactly those
// note-less ancestor folders start expanded on first load.
export function collectAllTreePaths(tree: FolderNode[]): string[] {
  return tree.flatMap(collectSubtreePaths);
}
