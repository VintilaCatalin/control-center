import { useMemo } from 'react';
import { useSnapshotData } from '../../api/SnapshotProvider';
import type { SettingsFieldSchema, SettingsResponse } from '../../api/types';
import { IntegrationCard } from './IntegrationCard';
import { INTEGRATIONS, PROBE_ONLY_INTEGRATIONS, probeStatus } from './integrations';
import styles from './SettingsPages.module.css';

interface IntegrationsPageProps {
  data: SettingsResponse;
  getValue: (key: string) => string;
  isSecret: (key: string) => boolean;
  origin: (key: string) => string;
  onChange: (key: string, value: string, opts?: { immediate?: boolean }) => void;
}

// Every external service this app actually talks to, in one place - each
// card's status comes straight from that integration's own collector
// (server.py's collect_*, already flowing through the live snapshot),
// and each card's fields are the exact same SETTINGS_SCHEMA entries the
// old settings screen used, just grouped per-service instead of
// per-schema-group. No second integration/config system invented here.
const RAINDROP_FIELD: SettingsFieldSchema = {
  key: 'raindrop_token',
  label: 'Raindrop token',
  type: 'secret',
  hint: 'app.raindrop.io → Settings → Integrations → Create app → Test token',
};

export function IntegrationsPage({ data, getValue, isSecret, origin, onChange }: IntegrationsPageProps) {
  const { snapshot } = useSnapshotData();

  const fieldMap = useMemo(() => {
    const map = new Map<string, SettingsFieldSchema>();
    for (const group of data.schema) for (const key of group.keys) map.set(key.key, key);
    return map;
  }, [data.schema]);

  const values = data.values;
  const networkIntegrations = INTEGRATIONS.filter((def) => !def.local);
  const localIntegrations = INTEGRATIONS.filter((def) => def.local);

  function renderCard(def: (typeof INTEGRATIONS)[number]) {
    let fields = def.keys.map((k) => fieldMap.get(k)).filter((f): f is SettingsFieldSchema => !!f);
    if (fields.length === 0 && def.id === 'raindrop') fields = [RAINDROP_FIELD];
    const testUrl = def.testUrlKey ? getValue(def.testUrlKey) : undefined;
    return (
      <IntegrationCard
        key={def.id}
        name={def.name}
        blurb={def.blurb}
        status={def.status(snapshot, values)}
        errorText={def.errorText?.(snapshot)}
        fields={fields}
        getValue={getValue}
        isSecret={(key) => isSecret(key) || key === 'raindrop_token'}
        origin={origin}
        onChange={onChange}
        testUrl={testUrl || undefined}
      />
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Integrations</h1>
        <p className={styles.pageSub}>Every external service Control Center can connect to, and whether it currently is.</p>
      </header>

      <div className={styles.cardList}>{networkIntegrations.map(renderCard)}</div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Local folders</h2>
        <p className={styles.sectionSub}>Read straight off disk - no network connection to test, just whether anything was actually found there. Notes and Wallpapers also offer this same folder picker directly from their own empty state on first use.</p>
        <div className={styles.cardList}>{localIntegrations.map(renderCard)}</div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Probed only</h2>
        <p className={styles.sectionSub}>
          These have no dedicated API integration - AdGuard needs a session login and Nginx Proxy Manager needs a JWT, neither has stored credentials here.
          They show up as a real online/offline row when added to the <code className={styles.code}>services</code> list under Homelab.
        </p>
        <div className={styles.cardList}>
          {PROBE_ONLY_INTEGRATIONS.map((p) => {
            const { status, ms } = probeStatus(snapshot, p.match);
            return (
              <IntegrationCard
                key={p.id}
                name={p.name}
                blurb={status === 'unknown' ? 'Not added to the Services list yet.' : 'TCP-probed, same as any other Homelab service.'}
                status={status}
                probeMs={ms}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
