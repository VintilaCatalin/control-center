import { useMemo, useState } from 'react';
import { usePublishAppSidebar } from '../shell/AppChromeContext';
import { useSidebarCollapsed } from '../shell/SidebarCollapseContext';
import { IntegrationsPage } from '../widgets/Settings/IntegrationsPage';
import { SettingsPage } from '../widgets/Settings/SettingsPage';
import { SettingsSidebarNav } from '../widgets/Settings/SettingsSidebarNav';
import { SystemPage } from '../widgets/Settings/SystemPage';
import type { SettingsSection } from '../widgets/Settings/types';
import { useSettingsData } from '../widgets/Settings/useSettingsData';
import styles from './SettingsView.module.css';

interface SettingsViewProps {
  section: SettingsSection;
}

// A real page living in the main content region, not a modal and not a
// second navigation column - Settings behaves exactly like Notes/Plex/
// Reading: it publishes its own sidebar content (SettingsSidebarNav) into
// the one persistent MainSidebar (see AppChromeContext), "Back to Main
// Menu" comes free from that same mechanism, and the content area gets
// the full available width for real forms instead of sharing it with a
// duplicate nav column.
export function SettingsView({ section: initialSection }: SettingsViewProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const { collapsed } = useSidebarCollapsed();
  const { data, status, loadError, getValue, setValue, setLocal, origin, isSecret } = useSettingsData(true);

  usePublishAppSidebar(
    useMemo(() => <SettingsSidebarNav active={section} onSelect={setSection} status={status} collapsed={collapsed} />, [section, status, collapsed]),
  );

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        {loadError ? (
          <div className={styles.stateWrap}>
            <span className={styles.stateTitle}>Couldn't load settings</span>
            <span className={styles.stateBody}>{loadError}</span>
          </div>
        ) : !data ? (
          <div className={styles.stateWrap}>
            <span className={styles.stateBody}>Loading…</span>
          </div>
        ) : section === 'settings' ? (
          <SettingsPage data={data} getValue={getValue} origin={origin} onChange={setValue} setLocal={setLocal} />
        ) : section === 'system' ? (
          <SystemPage data={data} getValue={getValue} isSecret={isSecret} origin={origin} onChange={setValue} setLocal={setLocal} />
        ) : (
          <IntegrationsPage data={data} getValue={getValue} isSecret={isSecret} origin={origin} onChange={setValue} />
        )}
      </div>
    </div>
  );
}
