import { useEffect, useMemo, useState } from 'react';
import { addArea, addProject, editArea, editProject, removeArea, removeProject } from '../../api/actions/tasks';
import type { AreaEntry, ProjectEntry, TaskEntry } from '../../api/types';
import { Menu, type MenuItem } from '../../primitives/Menu/Menu';
import { useMenu } from '../../primitives/Menu/useMenu';
import { ChevronIcon, TasksIcon } from '../../shell/icons';
import { PlusIcon } from '../Reading/icons';
import { TOPIC_ICON_IDS, TopicIcon } from '../Reading/topicIcons';
import { SMART_VIEWS, tasksForSmartView, type Selection, type SmartViewId } from './taskViews';
import styles from './TasksSidebarNav.module.css';

function iconLabel(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function SmartViewGlyph({ id }: { id: SmartViewId }) {
  const paths: Record<SmartViewId, string> = {
    inbox: 'M3 12l2.5-7A1 1 0 0 1 6.4 4h11.2a1 1 0 0 1 .9.6L21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6ZM3 12h5.5l1 2h5l1-2H21',
    today: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    upcoming: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
    anytime: 'M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5',
    someday: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z',
    logbook: 'M9 6h11M9 12h11M9 18h11M4.5 6l1 1 2-2M4.5 12l1 1 2-2M4.5 18l1 1 2-2',
  };
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[id]} />
    </svg>
  );
}

interface TasksSidebarNavProps {
  tasks: TaskEntry[];
  areas: AreaEntry[];
  projects: ProjectEntry[];
  selection: Selection;
  onSelect: (sel: Selection) => void;
  collapsed?: boolean;
}

// Fixed smart views up top (Inbox/Today/Upcoming/Anytime/Someday, each
// with a live count - Logbook sits de-emphasized at the very bottom,
// same placement Things gives it), then Areas with nested Projects -
// mirrors Notes' Sidebar.tsx depth-indent pattern but only ever one real
// level deep, so a plain flat render is enough, no recursive tree needed.
export function TasksSidebarNav({ tasks, areas, projects, selection, onSelect, collapsed }: TasksSidebarNavProps) {
  // Same optimistic-until-reconciled shape as ReadingSidebarNav's
  // override state - a create/rename/reorder writes through the backend
  // then waits for the next ~2s poll to land in `areas`/`projects`, which
  // reads as "nothing happened" for a beat without this.
  const [areaOverride, setAreaOverride] = useState<AreaEntry[] | null>(null);
  const [projectOverride, setProjectOverride] = useState<ProjectEntry[] | null>(null);
  const liveAreas = areaOverride ?? areas;
  const liveProjects = projectOverride ?? projects;

  useEffect(() => {
    if (!areaOverride) return;
    if (areaOverride.length === areas.length && areaOverride.every((a) => areas.some((x) => x.id === a.id))) setAreaOverride(null);
  }, [areas, areaOverride]);

  useEffect(() => {
    if (!projectOverride) return;
    if (projectOverride.length === projects.length && projectOverride.every((p) => projects.some((x) => x.id === p.id))) setProjectOverride(null);
  }, [projects, projectOverride]);

  const [addingArea, setAddingArea] = useState(false);
  const [newAreaLabel, setNewAreaLabel] = useState('');
  const [addingProjectIn, setAddingProjectIn] = useState<string | 'unsectioned' | null>(null);
  const [newProjectLabel, setNewProjectLabel] = useState('');
  const [collapsedAreas, setCollapsedAreas] = useState<Set<string>>(new Set());

  const areaMenu = useMenu();
  const [areaMenuTarget, setAreaMenuTarget] = useState<string | null>(null);
  const projectMenu = useMenu();
  const [projectMenuTarget, setProjectMenuTarget] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<SmartViewId, number>();
    for (const v of SMART_VIEWS) m.set(v.id, tasksForSmartView(v.id, tasks).length);
    return m;
  }, [tasks]);

  const projectsByArea = useMemo(() => {
    const m = new Map<string | null, ProjectEntry[]>();
    for (const p of liveProjects) {
      const key = p.area_id;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(p);
    }
    return m;
  }, [liveProjects]);

  async function handleCreateArea() {
    const label = newAreaLabel.trim();
    if (!label) return;
    const res = await addArea(label).catch(() => ({ ok: false as const, id: undefined as string | undefined }));
    if (res.ok && res.id) {
      setAreaOverride([...liveAreas, { id: res.id, label, icon: 'folder' }]);
      setNewAreaLabel('');
      setAddingArea(false);
    }
  }

  async function handleCreateProject(areaId: string | null) {
    const label = newProjectLabel.trim();
    if (!label) return;
    const res = await addProject(label, areaId).catch(() => ({ ok: false as const, id: undefined as string | undefined }));
    if (res.ok && res.id) {
      setProjectOverride([...liveProjects, { id: res.id, label, area_id: areaId, icon: 'folder', notes: '' }]);
      setNewProjectLabel('');
      setAddingProjectIn(null);
      onSelect({ kind: 'project', id: res.id });
    }
  }

  function toggleAreaCollapsed(id: string) {
    setCollapsedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const areaMenuItems: MenuItem[] = useMemo(() => {
    if (!areaMenuTarget) return [];
    const area = liveAreas.find((a) => a.id === areaMenuTarget);
    if (!area) return [];
    const items: MenuItem[] = [{ heading: area.label }, { sep: true }, { heading: 'Icon' }];
    for (const iconId of TOPIC_ICON_IDS) {
      items.push({
        label: iconLabel(iconId),
        icon: <TopicIcon icon={iconId} />,
        onClick: async () => {
          setAreaOverride(liveAreas.map((a) => (a.id === area.id ? { ...a, icon: iconId } : a)));
          await editArea(area.id, { icon: iconId }).catch(() => {});
        },
      });
    }
    items.push({ sep: true }, {
      label: 'Delete area',
      danger: true,
      onClick: async () => {
        setAreaOverride(liveAreas.filter((a) => a.id !== area.id));
        if (selection.kind === 'area' && selection.id === area.id) onSelect({ kind: 'smart', id: 'inbox' });
        await removeArea(area.id).catch(() => {});
      },
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaMenuTarget, liveAreas, selection]);

  const projectMenuItems: MenuItem[] = useMemo(() => {
    if (!projectMenuTarget) return [];
    const project = liveProjects.find((p) => p.id === projectMenuTarget);
    if (!project) return [];
    const items: MenuItem[] = [{ heading: project.label }, { sep: true }, { heading: 'Icon' }];
    for (const iconId of TOPIC_ICON_IDS) {
      items.push({
        label: iconLabel(iconId),
        icon: <TopicIcon icon={iconId} />,
        onClick: async () => {
          setProjectOverride(liveProjects.map((p) => (p.id === project.id ? { ...p, icon: iconId } : p)));
          await editProject(project.id, { icon: iconId }).catch(() => {});
        },
      });
    }
    items.push({ sep: true }, {
      label: 'Delete project',
      danger: true,
      onClick: async () => {
        setProjectOverride(liveProjects.filter((p) => p.id !== project.id));
        if (selection.kind === 'project' && selection.id === project.id) onSelect({ kind: 'smart', id: 'inbox' });
        await removeProject(project.id).catch(() => {});
      },
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectMenuTarget, liveProjects, selection]);

  function isActive(sel: Selection): boolean {
    return selection.kind === sel.kind && selection.id === sel.id;
  }

  function renderProjectRow(p: ProjectEntry, indent: boolean) {
    return (
      <button
        key={p.id}
        type="button"
        className={[styles.item, styles.projectItem, indent ? styles.indented : '', isActive({ kind: 'project', id: p.id }) ? styles.itemActive : ''].filter(Boolean).join(' ')}
        onClick={() => onSelect({ kind: 'project', id: p.id })}
        onContextMenu={(e) => {
          setProjectMenuTarget(p.id);
          projectMenu.openAt(e);
        }}
        title={collapsed ? p.label : undefined}
      >
        <span className={styles.icon}>
          <TopicIcon icon={p.icon} />
        </span>
        <span className={styles.label}>{p.label}</span>
      </button>
    );
  }

  return (
    <div className={styles.nav} data-collapsed={collapsed ? '' : undefined}>
      <div className={styles.brand}>
        <span className={styles.brandGlyph}>
          <TasksIcon />
        </span>
        <span className={styles.brandLabel}>Tasks</span>
      </div>

      {SMART_VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          className={[styles.item, isActive({ kind: 'smart', id: v.id }) ? styles.itemActive : ''].filter(Boolean).join(' ')}
          onClick={() => onSelect({ kind: 'smart', id: v.id })}
          title={collapsed ? v.label : undefined}
        >
          <span className={styles.icon}>
            <SmartViewGlyph id={v.id} />
          </span>
          <span className={styles.label}>{v.label}</span>
          <span className={styles.count}>{counts.get(v.id)}</span>
        </button>
      ))}

      <div className={styles.groupLabel}>Areas</div>

      {/* Unsectioned projects (no area) render first, flush left like a
          "no area" bucket. */}
      {(projectsByArea.get(null) ?? []).map((p) => renderProjectRow(p, false))}

      {liveAreas.map((area) => {
        const areaProjects = projectsByArea.get(area.id) ?? [];
        const isCollapsed = collapsedAreas.has(area.id);
        return (
          <div key={area.id}>
            <button
              type="button"
              className={[styles.item, styles.areaItem, isActive({ kind: 'area', id: area.id }) ? styles.itemActive : ''].filter(Boolean).join(' ')}
              onClick={() => onSelect({ kind: 'area', id: area.id })}
              onContextMenu={(e) => {
                setAreaMenuTarget(area.id);
                areaMenu.openAt(e);
              }}
              title={collapsed ? area.label : undefined}
            >
              {!collapsed && areaProjects.length > 0 && (
                <span
                  className={[styles.disclosure, isCollapsed ? styles.disclosureCollapsed : ''].filter(Boolean).join(' ')}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleAreaCollapsed(area.id);
                  }}
                >
                  <ChevronIcon />
                </span>
              )}
              <span className={styles.icon}>
                <TopicIcon icon={area.icon} />
              </span>
              <span className={styles.label}>{area.label}</span>
            </button>
            {!isCollapsed && areaProjects.map((p) => renderProjectRow(p, true))}
            {!collapsed && addingProjectIn === area.id ? (
              <div className={[styles.addRow, styles.indented].join(' ')}>
                <input
                  type="text"
                  className={styles.addInput}
                  placeholder="Project name"
                  value={newProjectLabel}
                  onChange={(e) => setNewProjectLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateProject(area.id);
                    if (e.key === 'Escape') setAddingProjectIn(null);
                  }}
                  autoFocus
                />
              </div>
            ) : (
              !collapsed && (
                <button type="button" className={[styles.item, styles.indented, styles.addProjectBtn].join(' ')} onClick={() => setAddingProjectIn(area.id)}>
                  <span className={styles.icon}>
                    <PlusIcon />
                  </span>
                  <span className={styles.label}>Add project</span>
                </button>
              )
            )}
          </div>
        );
      })}

      <Menu open={areaMenu.open} x={areaMenu.x} y={areaMenu.y} onClose={areaMenu.close} items={areaMenuItems} />
      <Menu open={projectMenu.open} x={projectMenu.x} y={projectMenu.y} onClose={projectMenu.close} items={projectMenuItems} />

      {addingArea ? (
        <div className={styles.addRow}>
          <input
            type="text"
            className={styles.addInput}
            placeholder="Area name"
            value={newAreaLabel}
            onChange={(e) => setNewAreaLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateArea();
              if (e.key === 'Escape') setAddingArea(false);
            }}
            autoFocus
          />
        </div>
      ) : (
        !collapsed && (
          <button type="button" className={styles.item} onClick={() => setAddingArea(true)}>
            <span className={styles.icon}>
              <PlusIcon />
            </span>
            <span className={styles.label}>Add area</span>
          </button>
        )
      )}
      {!collapsed && (
        <button type="button" className={styles.item} onClick={() => setAddingProjectIn('unsectioned')}>
          <span className={styles.icon}>
            <PlusIcon />
          </span>
          <span className={styles.label}>Add project</span>
        </button>
      )}
      {!collapsed && addingProjectIn === 'unsectioned' && (
        <div className={styles.addRow}>
          <input
            type="text"
            className={styles.addInput}
            placeholder="Project name"
            value={newProjectLabel}
            onChange={(e) => setNewProjectLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateProject(null);
              if (e.key === 'Escape') setAddingProjectIn(null);
            }}
            autoFocus
          />
        </div>
      )}

      <button
        type="button"
        className={[styles.item, styles.logbookItem, isActive({ kind: 'smart', id: 'logbook' }) ? styles.itemActive : ''].filter(Boolean).join(' ')}
        onClick={() => onSelect({ kind: 'smart', id: 'logbook' })}
        title={collapsed ? 'Logbook' : undefined}
      >
        <span className={styles.icon}>
          <SmartViewGlyph id="logbook" />
        </span>
        <span className={styles.label}>Logbook</span>
      </button>
    </div>
  );
}
