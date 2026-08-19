import { type DragEvent, useMemo, useState } from 'react';
import { addArea, addProject, editArea, editProject, removeArea, removeProject, reorderAreas, reorderProjects } from '../../api/actions/tasks';
import type { AreaEntry, ProjectEntry, TaskEntry } from '../../api/types';
import { GlyphIcon } from '../../primitives/GlyphPicker/glyphs';
import { Menu, type MenuItem } from '../../primitives/Menu/Menu';
import { useMenu } from '../../primitives/Menu/useMenu';
import { useToast } from '../../primitives/Toast/ToastProvider';
import { TasksIcon } from '../../shell/icons';
import { ProjectProgressRing } from './ProjectProgressRing';
import { SMART_VIEWS, tasksForSmartView, type Selection, type SmartViewId } from './taskViews';
import styles from './TasksSidebarNav.module.css';

function PlusIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>; }
function SearchIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></svg>; }
function AreaChevronIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>; }
function MoreIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>; }
function GripIcon() { return <svg width="12" height="14" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="3" r="1.2" /><circle cx="9" cy="3" r="1.2" /><circle cx="3" cy="8" r="1.2" /><circle cx="9" cy="8" r="1.2" /><circle cx="3" cy="13" r="1.2" /><circle cx="9" cy="13" r="1.2" /></svg>; }
function SmartViewGlyph({ id }: { id: SmartViewId }) {
  const paths: Record<SmartViewId, string> = {
    inbox: 'M3 12l2.5-7A1 1 0 0 1 6.4 4h11.2a1 1 0 0 1 .9.6L21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6ZM3 12h5.5l1 2h5l1-2H21',
    today: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    upcoming: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
    anytime: 'M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5',
    someday: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z',
    logbook: 'M9 6h11M9 12h11M9 18h11M4.5 6l1 1 2-2M4.5 12l1 1 2-2M4.5 18l1 1 2-2',
  };
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[id]} /></svg>;
}

interface Props {
  tasks: TaskEntry[]; areas: AreaEntry[]; projects: ProjectEntry[]; selection: Selection; collapsed?: boolean;
  searchQuery: string; onSearchChange: (query: string) => void;
  onMoveTask: (id: string, home: { kind: 'area' | 'project'; id: string } | null) => void;
  onSelect: (selection: Selection) => void; onAreasChanged: (areas: AreaEntry[]) => void; onProjectsChanged: (projects: ProjectEntry[]) => void;
}

type EntityTarget = { kind: 'area' | 'project'; id: string };
type Creating = { kind: 'area' } | { kind: 'project'; areaId: string | null };
type DragEntity = EntityTarget | { kind: 'task'; id: string };
type DropTarget = { kind: 'area' | 'project'; id: string; edge?: 'before' | 'after' } | { kind: 'unassigned' };

const AREA_TYPE = 'application/x-control-center-area';
const PROJECT_TYPE = 'application/x-control-center-project';
const TASK_TYPE = 'application/x-control-center-task';

export function TasksSidebarNav({ tasks, areas, projects, selection, collapsed, searchQuery, onSearchChange, onMoveTask, onSelect, onAreasChanged, onProjectsChanged }: Props) {
  const { push } = useToast();
  const [collapsedAreas, setCollapsedAreas] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<Creating | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [entityError, setEntityError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<EntityTarget & { title: string } | null>(null);
  const [dragging, setDragging] = useState<DragEntity | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const menu = useMenu();
  const [menuTarget, setMenuTarget] = useState<EntityTarget | null>(null);
  const counts = useMemo(() => new Map<SmartViewId, number>([...SMART_VIEWS, { id: 'logbook' as const, label: 'Logbook' }].map((view) => [view.id, tasksForSmartView(view.id, tasks).length])), [tasks]);
  const projectsByArea = useMemo(() => {
    const map = new Map<string | null, ProjectEntry[]>();
    projects.forEach((project) => map.set(project.area_id, [...(map.get(project.area_id) ?? []), project]));
    return map;
  }, [projects]);
  const active = (next: Selection) => selection.kind === next.kind && selection.id === next.id;
  const completelyEmpty = areas.length === 0 && projects.length === 0;

  function beginArea() { setCreating({ kind: 'area' }); setDraft(''); setEntityError(null); }
  function beginProject(areaId?: string | null) {
    const targetArea = areaId !== undefined ? areaId : selection.kind === 'area' ? selection.id : null;
    setCreating({ kind: 'project', areaId: targetArea });
    setDraft(''); setEntityError(null);
    if (targetArea) setCollapsedAreas((value) => { const next = new Set(value); next.delete(targetArea); return next; });
  }

  async function create() {
    const title = draft.trim();
    if (!title || !creating || busy) return;
    setBusy(true); setEntityError(null);
    try {
      if (creating.kind === 'area') {
        const result = await addArea(title, 'folder');
        if (!result.ok || !result.id) throw new Error(result.error || 'Area could not be created');
        const area = result.area ?? { id: result.id, title, notes: '', icon: 'folder', sort_key: areas.length };
        onAreasChanged([...areas, area]);
        onSelect({ kind: 'area', id: area.id });
      } else {
        const result = await addProject(title, creating.areaId, 'folder');
        if (!result.ok || !result.id) throw new Error(result.error || 'Project could not be created');
        const project = result.project ?? { id: result.id, title, notes: '', icon: 'folder', area_id: creating.areaId, sort_key: projects.length };
        onProjectsChanged([...projects, project]);
        onSelect({ kind: 'project', id: project.id });
      }
      setDraft(''); setCreating(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create item';
      setEntityError(message); push(message, 'error');
    } finally { setBusy(false); }
  }

  async function saveRename() {
    if (!renaming || busy) return;
    const title = renaming.title.trim();
    if (!title) { setRenaming(null); return; }
    setBusy(true);
    try {
      if (renaming.kind === 'area') {
        const current = areas.find((area) => area.id === renaming.id);
        const result = await editArea(renaming.id, { title });
        if (!result.ok) throw new Error(result.error || 'Area could not be renamed');
        onAreasChanged(areas.map((area) => area.id === renaming.id ? result.area ?? { ...current!, title } : area));
      } else {
        const current = projects.find((project) => project.id === renaming.id);
        const result = await editProject(renaming.id, { title });
        if (!result.ok) throw new Error(result.error || 'Project could not be renamed');
        onProjectsChanged(projects.map((project) => project.id === renaming.id ? result.project ?? { ...current!, title } : project));
      }
      setRenaming(null);
    } catch (error) {
      push(error instanceof Error ? error.message : 'Could not rename item', 'error');
    } finally { setBusy(false); }
  }

  function dragType(event: DragEvent): DragEntity['kind'] | null {
    if (event.dataTransfer.types.includes(AREA_TYPE)) return 'area';
    if (event.dataTransfer.types.includes(PROJECT_TYPE)) return 'project';
    if (event.dataTransfer.types.includes(TASK_TYPE)) return 'task';
    return null;
  }

  function beginDrag(event: DragEvent, entity: DragEntity) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(entity.kind === 'area' ? AREA_TYPE : entity.kind === 'project' ? PROJECT_TYPE : TASK_TYPE, entity.id);
    setDragging(entity);
  }

  function edgeFor(event: DragEvent<HTMLElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientY < box.top + box.height / 2 ? 'before' as const : 'after' as const;
  }

  function clearDrag() { setDragging(null); setDropTarget(null); }

  async function moveArea(id: string, targetId: string, edge: 'before' | 'after') {
    if (id === targetId) return;
    const previous = areas;
    const next = areas.filter((area) => area.id !== id);
    const targetIndex = next.findIndex((area) => area.id === targetId);
    next.splice(Math.max(0, targetIndex + (edge === 'after' ? 1 : 0)), 0, areas.find((area) => area.id === id)!);
    onAreasChanged(next);
    const result = await reorderAreas(next.map((area) => area.id));
    if (!result.ok) { onAreasChanged(previous); push(result.error ?? 'Could not reorder areas', 'error'); }
  }

  async function moveProject(id: string, areaId: string | null, targetId?: string, edge: 'before' | 'after' = 'after') {
    const moved = projects.find((project) => project.id === id);
    if (!moved || id === targetId) return;
    const previous = projects;
    const next = projects.filter((project) => project.id !== id);
    const updated = { ...moved, area_id: areaId };
    if (targetId) {
      const targetIndex = next.findIndex((project) => project.id === targetId);
      next.splice(Math.max(0, targetIndex + (edge === 'after' ? 1 : 0)), 0, updated);
    } else {
      const lastInGroup = next.reduce((index, project, current) => project.area_id === areaId ? current : index, -1);
      next.splice(lastInGroup + 1, 0, updated);
    }
    onProjectsChanged(next);
    try {
      if (moved.area_id !== areaId) {
        const result = await editProject(id, { area_id: areaId });
        if (!result.ok) throw new Error(result.error || 'Could not move project');
      }
      const ordered = await reorderProjects(next.map((project) => project.id));
      if (!ordered.ok) throw new Error(ordered.error || 'Could not reorder projects');
    } catch (error) {
      onProjectsChanged(previous);
      push(error instanceof Error ? error.message : 'Could not move project', 'error');
    }
  }

  function handleAreaDragOver(event: DragEvent<HTMLDivElement>, area: AreaEntry) {
    const kind = dragType(event);
    if (!kind || kind === 'area' && dragging?.id === area.id) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(kind === 'area' ? { kind: 'area', id: area.id, edge: edgeFor(event) } : { kind: 'area', id: area.id });
  }

  function handleAreaDrop(event: DragEvent<HTMLDivElement>, area: AreaEntry) {
    event.preventDefault();
    event.stopPropagation();
    const kind = dragType(event);
    const id = event.dataTransfer.getData(kind === 'area' ? AREA_TYPE : kind === 'project' ? PROJECT_TYPE : TASK_TYPE);
    const target = dropTarget;
    clearDrag();
    if (!id || !kind) return;
    if (kind === 'area') void moveArea(id, area.id, target?.kind === 'area' && target.edge ? target.edge : 'after');
    if (kind === 'project') void moveProject(id, area.id);
    if (kind === 'task') onMoveTask(id, { kind: 'area', id: area.id });
  }

  function handleProjectDragOver(event: DragEvent<HTMLDivElement>, project: ProjectEntry) {
    const kind = dragType(event);
    if (!kind || kind === 'area' || kind === 'project' && dragging?.id === project.id) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(kind === 'project' ? { kind: 'project', id: project.id, edge: edgeFor(event) } : { kind: 'project', id: project.id });
  }

  function handleProjectDrop(event: DragEvent<HTMLDivElement>, project: ProjectEntry) {
    event.preventDefault();
    event.stopPropagation();
    const kind = dragType(event);
    const id = event.dataTransfer.getData(kind === 'project' ? PROJECT_TYPE : TASK_TYPE);
    const target = dropTarget;
    clearDrag();
    if (!id || !kind) return;
    if (kind === 'project') void moveProject(id, project.area_id, project.id, target?.kind === 'project' && target.edge ? target.edge : 'after');
    if (kind === 'task') onMoveTask(id, { kind: 'project', id: project.id });
  }

  const menuItems: MenuItem[] = (() => {
    if (!menuTarget) return [];
    const entity = menuTarget.kind === 'area' ? areas.find((item) => item.id === menuTarget.id) : projects.find((item) => item.id === menuTarget.id);
    if (!entity) return [];
    const items: MenuItem[] = [{ heading: entity.title }, { sep: true }, { label: 'Rename', onClick: () => setRenaming({ ...menuTarget, title: entity.title }) }];
    if (menuTarget.kind === 'area') items.push({ label: 'New project here', onClick: () => beginProject(entity.id) });
    if (menuTarget.kind === 'project') {
      const project = entity as ProjectEntry;
      items.push({ sep: true }, { heading: 'Move to area' });
      areas.forEach((area) => items.push({ label: area.title, hint: project.area_id === area.id ? 'Current' : undefined, icon: <GlyphIcon icon={area.icon} size={14} />, onClick: () => { if (project.area_id !== area.id) void moveProject(project.id, area.id); } }));
      items.push({ label: 'No area', hint: project.area_id === null ? 'Current' : undefined, icon: <GlyphIcon icon="folder" size={14} />, onClick: () => { if (project.area_id !== null) void moveProject(project.id, null); } });
    }
    items.push({ sep: true }, { label: `Delete ${menuTarget.kind}`, danger: true, onClick: async () => {
      try {
        if (menuTarget.kind === 'area') { const result = await removeArea(entity.id); if (!result.ok) throw new Error(result.error); onAreasChanged(areas.filter((item) => item.id !== entity.id)); }
        else { const result = await removeProject(entity.id); if (!result.ok) throw new Error(result.error); onProjectsChanged(projects.filter((item) => item.id !== entity.id)); }
        if (active({ kind: menuTarget.kind, id: entity.id } as Selection)) onSelect({ kind: 'smart', id: 'inbox' });
      } catch (error) { push(error instanceof Error ? error.message : `Could not delete ${menuTarget.kind}`, 'error'); }
    } });
    return items;
  })();

  function projectRow(project: ProjectEntry, nested = false) {
    if (renaming?.kind === 'project' && renaming.id === project.id && !collapsed) return <RenameInput key={project.id} value={renaming.title} onChange={(title) => setRenaming({ ...renaming, title })} onSave={saveRename} onCancel={() => setRenaming(null)} nested={nested} />;
    const target = dropTarget?.kind === 'project' && dropTarget.id === project.id ? dropTarget : null;
    const projectTasks = tasks.filter((task) => task.project_id === project.id);
    const openCount = projectTasks.filter((task) => task.status === 'open').length;
    const completedCount = projectTasks.length - openCount;
    return <div key={project.id} className={[styles.entityRow, dragging?.kind === 'project' && dragging.id === project.id ? styles.dragging : '', target?.edge === 'before' ? styles.dropBefore : '', target?.edge === 'after' ? styles.dropAfter : '', target && !target.edge ? styles.dropInto : ''].filter(Boolean).join(' ')} onDragOver={(event) => handleProjectDragOver(event, project)} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null); }} onDrop={(event) => handleProjectDrop(event, project)}>
      <button type="button" className={[styles.item, styles.projectItem, nested ? styles.nestedProject : '', active({ kind: 'project', id: project.id }) ? styles.itemActive : ''].filter(Boolean).join(' ')} onClick={() => onSelect({ kind: 'project', id: project.id })} onDoubleClick={() => !collapsed && setRenaming({ kind: 'project', id: project.id, title: project.title })} onContextMenu={(event) => { setMenuTarget({ kind: 'project', id: project.id }); menu.openAt(event); }} title={collapsed ? project.title : undefined}><span className={styles.projectIcon}><ProjectProgressRing completed={completedCount} total={projectTasks.length} size={17} /></span><span className={styles.label}>{project.title}</span>{!collapsed && openCount > 0 && <span className={styles.projectCount}>{openCount}</span>}</button>
      {!collapsed && <span className={styles.rowActions}><span className={styles.dragHandle} draggable onDragStart={(event) => beginDrag(event, { kind: 'project', id: project.id })} onDragEnd={clearDrag} title="Move project" aria-label={`Move ${project.title}`}><GripIcon /></span><button type="button" className={styles.moreButton} onClick={(event) => { setMenuTarget({ kind: 'project', id: project.id }); menu.openAt(event); }} aria-label={`Project actions for ${project.title}`}><MoreIcon /></button></span>}
    </div>;
  }

  function areaBlock(area: AreaEntry) {
    const children = projectsByArea.get(area.id) ?? [];
    const isCollapsed = collapsedAreas.has(area.id);
    const isRenaming = renaming?.kind === 'area' && renaming.id === area.id;
    const target = dropTarget?.kind === 'area' && dropTarget.id === area.id ? dropTarget : null;
    return <div className={[styles.areaBlock, dragging?.kind === 'area' && dragging.id === area.id ? styles.dragging : '', target?.edge === 'before' ? styles.dropBefore : '', target?.edge === 'after' ? styles.dropAfter : '', target && !target.edge ? styles.dropInto : ''].filter(Boolean).join(' ')} key={area.id} onDragOver={(event) => handleAreaDragOver(event, area)} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null); }} onDrop={(event) => handleAreaDrop(event, area)}>
      <div className={styles.areaHeader}>
        {isRenaming && !collapsed ? <RenameInput value={renaming.title} onChange={(title) => setRenaming({ ...renaming, title })} onSave={saveRename} onCancel={() => setRenaming(null)} /> : <button type="button" className={[styles.item, styles.areaItem, active({ kind: 'area', id: area.id }) ? styles.itemActive : ''].filter(Boolean).join(' ')} onClick={() => onSelect({ kind: 'area', id: area.id })} onDoubleClick={() => !collapsed && setRenaming({ kind: 'area', id: area.id, title: area.title })} onContextMenu={(event) => { setMenuTarget({ kind: 'area', id: area.id }); menu.openAt(event); }} title={collapsed ? area.title : undefined}><span className={styles.areaIcon}><GlyphIcon icon={area.icon} size={15} /></span><span className={styles.areaCopy}><span className={styles.label}>{area.title}</span></span></button>}
        {!collapsed && <span className={styles.areaActions}><span className={styles.dragHandle} draggable onDragStart={(event) => beginDrag(event, { kind: 'area', id: area.id })} onDragEnd={clearDrag} title="Move area" aria-label={`Move ${area.title}`}><GripIcon /></span>{children.length > 0 && <button type="button" className={[styles.disclosure, !isCollapsed ? styles.disclosureExpanded : ''].filter(Boolean).join(' ')} onClick={() => setCollapsedAreas((value) => { const next = new Set(value); if (next.has(area.id)) next.delete(area.id); else next.add(area.id); return next; })} aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${area.title}`}><AreaChevronIcon /></button>}</span>}
      </div>
      {!isCollapsed && !collapsed && (children.length > 0 || creating?.kind === 'project' && creating.areaId === area.id) && <div className={styles.areaProjects}>{children.map((project) => projectRow(project, true))}{creating?.kind === 'project' && creating.areaId === area.id && <CreateInput value={draft} onChange={setDraft} onCreate={create} onCancel={() => setCreating(null)} placeholder="Project name" nested busy={busy} error={entityError} />}</div>}
    </div>;
  }

  return <div className={styles.nav} data-collapsed={collapsed ? '' : undefined}>
    <div className={styles.brand}><span className={styles.brandGlyph}><TasksIcon /></span><span className={styles.brandLabel}>Tasks</span></div>
    {!collapsed && <label className={styles.search}><SearchIcon /><input value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} placeholder="Find tasks" aria-label="Search tasks" />{searchQuery && <button type="button" onClick={() => onSearchChange('')} aria-label="Clear search">×</button>}</label>}
    <div className={styles.smartViews}>{SMART_VIEWS.map((view) => <button key={view.id} type="button" className={[styles.item, styles.smartItem, active({ kind: 'smart', id: view.id }) ? styles.itemActive : ''].filter(Boolean).join(' ')} onClick={() => onSelect({ kind: 'smart', id: view.id })} title={collapsed ? view.label : undefined}><span className={styles.icon}><SmartViewGlyph id={view.id} /></span><span className={styles.label}>{view.label}</span>{!!counts.get(view.id) && <span className={styles.count}>{counts.get(view.id)}</span>}</button>)}</div>

    <section className={styles.organization}>
      {!collapsed && <div className={styles.sectionHeading}><span>Areas</span><button type="button" onClick={beginArea} aria-label="New area" title="New area"><PlusIcon /></button></div>}
      {!collapsed && creating?.kind === 'area' && <CreateInput value={draft} onChange={setDraft} onCreate={create} onCancel={() => setCreating(null)} placeholder="Area name" busy={busy} error={entityError} />}
      {areas.length === 0 && !collapsed && creating?.kind !== 'area' && <div className={styles.entityEmpty}><strong>No areas yet</strong><span>Create one to gather related projects</span></div>}
      {areas.map(areaBlock)}

      <div className={[styles.independentSection, dropTarget?.kind === 'unassigned' ? styles.sectionDrop : ''].filter(Boolean).join(' ')} onDragOver={(event) => { if (dragType(event) !== 'project') return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget({ kind: 'unassigned' }); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null); }} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData(PROJECT_TYPE); clearDrag(); if (id) void moveProject(id, null); }}>
        {!collapsed && <div className={styles.sectionHeading}><span>Projects</span><button type="button" onClick={() => beginProject()} aria-label="New project" title="New project"><PlusIcon /></button></div>}
        {(projectsByArea.get(null) ?? []).map((project) => projectRow(project))}
        {completelyEmpty && !collapsed && creating?.kind !== 'project' && <div className={styles.entityEmpty}><strong>No projects yet</strong><span>Start with a clear, finite outcome</span></div>}
        {!collapsed && dragging?.kind === 'project' && (projectsByArea.get(null) ?? []).length === 0 && <div className={styles.unassignedEmpty}>Release from its area</div>}
        {!collapsed && creating?.kind === 'project' && creating.areaId === null && <CreateInput value={draft} onChange={setDraft} onCreate={create} onCancel={() => setCreating(null)} placeholder="Project name" busy={busy} error={entityError} />}
      </div>
    </section>
    <button type="button" className={[styles.item, styles.logbookItem, active({ kind: 'smart', id: 'logbook' }) ? styles.itemActive : ''].filter(Boolean).join(' ')} onClick={() => onSelect({ kind: 'smart', id: 'logbook' })} title={collapsed ? 'Logbook' : undefined}><span className={styles.icon}><SmartViewGlyph id="logbook" /></span><span className={styles.label}>Logbook</span>{!!counts.get('logbook') && <span className={styles.count}>{counts.get('logbook')}</span>}</button>
    <Menu open={menu.open} x={menu.x} y={menu.y} onClose={menu.close} items={menuItems} />
  </div>;
}

function CreateInput({ value, onChange, onCreate, onCancel, placeholder, nested, busy, error }: { value: string; onChange: (value: string) => void; onCreate: () => void; onCancel: () => void; placeholder: string; nested?: boolean; busy: boolean; error: string | null }) {
  return <div className={[styles.editRow, nested ? styles.nestedEdit : ''].filter(Boolean).join(' ')}><input className={styles.addInput} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onCreate(); if (event.key === 'Escape') onCancel(); }} placeholder={placeholder} disabled={busy} aria-invalid={!!error} autoFocus />{error && <span className={styles.entityError} role="alert">{error}</span>}</div>;
}

function RenameInput({ value, onChange, onSave, onCancel, nested }: { value: string; onChange: (value: string) => void; onSave: () => void; onCancel: () => void; nested?: boolean }) {
  return <div className={[styles.editRow, styles.renameRow, nested ? styles.nestedEdit : ''].filter(Boolean).join(' ')}><input className={styles.addInput} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onSave} onKeyDown={(event) => { if (event.key === 'Enter') onSave(); if (event.key === 'Escape') onCancel(); }} autoFocus /></div>;
}
