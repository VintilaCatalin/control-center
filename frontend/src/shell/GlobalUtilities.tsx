import { useState } from 'react';
import { useSnapshotData } from '../api/SnapshotProvider';
import { Menu, type MenuItem } from '../primitives/Menu/Menu';
import { Overlay } from '../primitives/Overlay/Overlay';
import { CaptureIcon } from '../widgets/Notes/icons';
import { QuickCapture } from '../widgets/Notes/QuickCapture';
import { TasksPanel } from '../widgets/Tasks/TasksPanel';
import { useAppNavigation } from './AppNavigationContext';
import { GlobalSearchOverlay } from './GlobalSearchOverlay';
import { ChevronIcon, GearIcon, GridIcon, LockIcon, PlugIcon, SearchIcon, SlidersIcon, TasksIcon } from './icons';
import { usePanelsControl } from './PanelsControlContext';
import { useSidebarCollapsed } from './SidebarCollapseContext';
import { useSidebarAnchor } from './useSidebarAnchor';
import { WeatherPopover } from './WeatherPopover';
import styles from './GlobalUtilities.module.css';

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Morning';
  if (h < 18) return 'Afternoon';
  return 'Evening';
}

// Quick Tasks, Quick Note, Weather, Panels (when the active application
// has any) and Profile - global utilities, not Notes-specific or tied
// to any one application. Always the bottom strip of the one persistent
// MainSidebar, regardless of whether it's showing the root app list or
// an application's own secondary nav (see MainSidebar.tsx). Quick Tasks
// and Quick Note both open the same shared Overlay modal (centred, same
// surface/motion as every other modal in the app) rather than a
// sidebar-anchored popover - a floating panel pinned to a bottom-of-a-
// tall-column trigger read as heavier and less consistent than just
// reusing the one modal language the rest of the app already has.
// Weather/Profile/Panels stay as adjacent popovers (useSidebarAnchor) -
// they're quick glances/menus, not a whole interactive panel like Tasks.
//
// `collapsed` mirrors MainSidebar's own effectiveCollapsed - icon-only
// when true, every trigger keeps its `title` tooltip so the strip stays
// fully usable, not just decorative.
export function GlobalUtilities({ collapsed = false }: { collapsed?: boolean }) {
  const { toggle: toggleSidebar } = useSidebarCollapsed();
  const { openSettings: navigateToSettings } = useAppNavigation();
  const { snapshot } = useSnapshotData();
  const profile = snapshot?.ui?.profile;
  const tasks = snapshot?.tasks?.tasks ?? [];
  const openTaskCount = tasks.filter((t) => !t.done).length;
  const panelsControl = usePanelsControl();

  const profileMenu = useSidebarAnchor<HTMLButtonElement>();
  const panelsMenu = useSidebarAnchor<HTMLButtonElement>();
  const [tasksOpen, setTasksOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const name = profile?.name;
  const initial = (name || 'V').slice(0, 1).toUpperCase();
  const greeting = name ? `${timeGreeting()}, ${name}` : timeGreeting();

  function openSettings(section: Parameters<typeof navigateToSettings>[0]) {
    profileMenu.close();
    navigateToSettings(section);
  }

  // Settings/System & Preferences/Integrations are three sections of the
  // same real page (see App.tsx/SettingsView) - never duplicated into any
  // application's own sidebar content, always reached from here.
  const profileMenuItems: MenuItem[] = [
    { heading: greeting },
    { sep: true },
    { label: 'Settings', icon: <GearIcon />, onClick: () => openSettings('settings') },
    { label: 'System & Preferences', icon: <SlidersIcon />, onClick: () => openSettings('system') },
    { label: 'Integrations', icon: <PlugIcon />, onClick: () => openSettings('integrations') },
  ];

  // "Lock layout" first, then a separator, then the usual show/hide list -
  // the lock toggle is always reachable from here even while locked (it's
  // the one way back out), it just also hides every drag/resize/rename
  // affordance on the canvas itself while active.
  const panelsMenuItems: MenuItem[] = panelsControl
    ? [
        {
          label: panelsControl.locked ? 'Unlock layout' : 'Lock layout',
          hint: panelsControl.locked ? 'Locked' : undefined,
          icon: <LockIcon locked={panelsControl.locked} />,
          onClick: panelsControl.toggleLock,
        },
        { sep: true },
        ...panelsControl.items.map((p) => ({
          label: p.label,
          hint: p.hidden ? 'Hidden' : undefined,
          icon: <span className={styles.panelDot} data-hidden={p.hidden ? '' : undefined} />,
          onClick: () => panelsControl.toggle(p.id),
        })),
      ]
    : [];

  const avatarInner = profile?.photo ? <img className={styles.avatarImg} src={profile.photo} alt="" /> : initial;

  return (
    <div className={styles.stack} data-collapsed={collapsed ? '' : undefined}>
      <div className={styles.group}>
        <button type="button" className={styles.utilityBtn} onClick={() => setSearchOpen(true)} aria-haspopup="dialog" aria-expanded={searchOpen} title="Search">
          <span className={styles.iconSlot}>
            <SearchIcon />
          </span>
          <span className={styles.utilityLabel}>Search</span>
        </button>

        <WeatherPopover collapsed={collapsed} />

        <button
          type="button"
          className={styles.utilityBtn}
          onClick={() => setTasksOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={tasksOpen}
          title="Quick Tasks"
        >
          <span className={styles.iconSlot}>
            <TasksIcon />
          </span>
          <span className={styles.utilityLabel}>Quick Tasks</span>
          {openTaskCount > 0 && <span className={styles.utilityBadge}>{openTaskCount}</span>}
        </button>

        <button type="button" className={styles.utilityBtn} onClick={() => setCaptureOpen(true)} title="Quick Note">
          <span className={styles.iconSlot}>
            <CaptureIcon />
          </span>
          <span className={styles.utilityLabel}>Quick Note</span>
        </button>

        {/* Application-level (Panels only makes sense for whichever
            application currently has a PanelGrid mounted), but it's a
            global-utility-shaped control, not part of any one
            application's own sidebar nav - see usePanelsControl. */}
        {panelsControl && panelsControl.items.length > 0 && (
          <button
            ref={panelsMenu.ref}
            type="button"
            className={styles.utilityBtn}
            onClick={panelsMenu.toggle}
            aria-haspopup="menu"
            aria-expanded={panelsMenu.open}
            title="Show or hide panels"
          >
            <span className={styles.iconSlot}>
              <GridIcon />
            </span>
            <span className={styles.utilityLabel}>Panels</span>
          </button>
        )}

        {/* A normal utility row, not a floating handle on the viewport
            edge - same icon size/typography/row height/hover/surface as
            every other row here. Icon-only (with a tooltip) once
            collapsed, exactly like its neighbours. */}
        <button
          type="button"
          className={styles.utilityBtn}
          onClick={toggleSidebar}
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          <span className={styles.iconSlot}>
            <span className={styles.collapseIcon} data-collapsed={collapsed ? '' : undefined}>
              <ChevronIcon />
            </span>
          </span>
          <span className={styles.utilityLabel}>{collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}</span>
        </button>
      </div>

      <button
        ref={profileMenu.ref}
        type="button"
        className={styles.avatarBtn}
        onClick={profileMenu.toggle}
        aria-haspopup="menu"
        aria-expanded={profileMenu.open}
        title={name ?? 'Profile'}
      >
        <span className={styles.avatarCircle}>{avatarInner}</span>
        <span className={styles.utilityLabel}>{name ?? 'Profile'}</span>
      </button>

      <Menu
        open={panelsMenu.open}
        x={panelsMenu.x}
        y={panelsMenu.y}
        items={panelsMenuItems}
        onClose={panelsMenu.close}
        ignoreRef={panelsMenu.ref}
      />
      <Menu
        open={profileMenu.open}
        x={profileMenu.x}
        y={profileMenu.y}
        items={profileMenuItems}
        onClose={profileMenu.close}
        ignoreRef={profileMenu.ref}
      />

      <Overlay open={tasksOpen} onClose={() => setTasksOpen(false)} title="Quick Tasks" icon={<TasksIcon />}>
        <TasksPanel tasks={tasks} />
      </Overlay>

      <QuickCapture open={captureOpen} onClose={() => setCaptureOpen(false)} onCreated={() => setCaptureOpen(false)} />
      <GlobalSearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
