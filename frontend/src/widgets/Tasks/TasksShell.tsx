import { useMemo, useState } from 'react';
import { useSnapshotData } from '../../api/SnapshotProvider';
import { usePublishAppSidebar } from '../../shell/AppChromeContext';
import { useSidebarCollapsed } from '../../shell/SidebarCollapseContext';
import { TaskListView } from './TaskListView';
import { TasksSidebarNav } from './TasksSidebarNav';
import type { Selection } from './taskViews';
import styles from './TasksShell.module.css';

// Owns the active selection (a smart view, or an Area/Project) and hosts
// the content pane - the sidebar is published up to the shell's
// AppSidebar via usePublishAppSidebar, same mechanism NotesShell uses,
// since the global shell owns the left column for every application.
export function TasksShell() {
  const { snapshot } = useSnapshotData();
  const { collapsed } = useSidebarCollapsed();
  const tasks = snapshot?.tasks?.tasks ?? [];
  const areas = snapshot?.tasks?.areas ?? [];
  const projects = snapshot?.tasks?.projects ?? [];

  const [selection, setSelection] = useState<Selection>({ kind: 'smart', id: 'today' });

  usePublishAppSidebar(
    useMemo(
      () => <TasksSidebarNav tasks={tasks} areas={areas} projects={projects} selection={selection} onSelect={setSelection} collapsed={collapsed} />,
      [tasks, areas, projects, selection, collapsed],
    ),
  );

  return (
    <div className={styles.main}>
      <TaskListView selection={selection} tasks={tasks} areas={areas} projects={projects} />
    </div>
  );
}
