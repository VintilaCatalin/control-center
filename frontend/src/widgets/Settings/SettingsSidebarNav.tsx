import { GearIcon, PlugIcon, SlidersIcon } from '../../shell/icons';
import type { SettingsSection } from './types';
import type { SaveStatus } from './useSettingsData';
import styles from './SettingsSidebarNav.module.css';

interface SettingsSidebarNavProps {
  active: SettingsSection;
  onSelect: (section: SettingsSection) => void;
  status: SaveStatus;
  collapsed?: boolean;
}

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Could not save',
};

// Settings' own sidebar content, branding-led like Reading/Plex's own
// (see ReadingSidebarNav) - "Back to Main Menu" above this is rendered
// generically by MainSidebar itself the same way it is for every other
// application, not rebuilt here.
export function SettingsSidebarNav({ active, onSelect, status, collapsed }: SettingsSidebarNavProps) {
  return (
    <div className={styles.nav} data-collapsed={collapsed ? '' : undefined}>
      <div className={styles.brand}>
        <span className={styles.brandGlyph}>
          <GearIcon />
        </span>
        <span className={styles.brandCopy}><strong>Settings</strong><small>Control Center</small></span>
      </div>

      <button type="button" className={[styles.item, active === 'settings' ? styles.itemActive : ''].join(' ')} onClick={() => onSelect('settings')} title={collapsed ? 'Settings' : undefined}>
        <span className={styles.icon}>
          <GearIcon />
        </span>
        <span className={styles.label}>Appearance</span>
      </button>
      <button type="button" className={[styles.item, active === 'system' ? styles.itemActive : ''].join(' ')} onClick={() => onSelect('system')} title={collapsed ? 'System & Preferences' : undefined}>
        <span className={styles.icon}>
          <SlidersIcon />
        </span>
        <span className={styles.label}>System</span>
      </button>
      <button
        type="button"
        className={[styles.item, active === 'integrations' ? styles.itemActive : ''].join(' ')}
        onClick={() => onSelect('integrations')}
        title={collapsed ? 'Integrations' : undefined}
      >
        <span className={styles.icon}>
          <PlugIcon />
        </span>
        <span className={styles.label}>Integrations</span>
      </button>

      {!collapsed && status !== 'idle' && (
        <div className={styles.footer}>
          <span className={[styles.statusChip, styles[`status_${status}`]].join(' ')}>{STATUS_LABEL[status]}</span>
        </div>
      )}
    </div>
  );
}
