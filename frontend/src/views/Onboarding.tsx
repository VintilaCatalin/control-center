import { useMemo, useState } from 'react';
import { completeOnboarding } from '../api/actions/settings';
import { useSnapshotData } from '../api/SnapshotProvider';
import type { SettingsFieldSchema } from '../api/types';
import { IntegrationCard } from '../widgets/Settings/IntegrationCard';
import { INTEGRATIONS } from '../widgets/Settings/integrations';
import { ProfilePhotoField } from '../widgets/Settings/ProfilePhotoField';
import { SettingsField } from '../widgets/Settings/SettingsField';
import settingsStyles from '../widgets/Settings/SettingsPages.module.css';
import { useSettingsData } from '../widgets/Settings/useSettingsData';
import styles from './Onboarding.module.css';

type Step = 'profile' | 'folders' | 'integrations';

const PROFILE_KEYS = ['_profile_name', 'place', 'latitude', 'longitude'];
// Local, not a network integration - Notes and Games both work with
// nothing more than a folder, and both are genuinely optional (skipping
// either just means that app's own "choose a folder" empty state greets
// you later, same as skipping it here would).
const FOLDER_KEYS = ['notes_dir', 'steam_path'];

// First run only - see App.tsx's gate on /api/settings' onboarding_complete.
// Deliberately built from the exact same pieces Settings already uses
// (useSettingsData, SettingsField, ProfilePhotoField, the INTEGRATIONS
// registry + IntegrationCard) rather than a parallel form system: this
// *is* Settings, just walked once in a fixed order with a "skip
// everything" escape hatch, writing through the same /api/settings/save
// path real edits already use. Nothing here is a second config store.
export function Onboarding({ onDone }: { onDone: () => void }) {
  const { snapshot } = useSnapshotData();
  const { data, getValue, setValue, setLocal, isSecret, origin } = useSettingsData(true);
  const [step, setStep] = useState<Step>('profile');
  const [finishing, setFinishing] = useState(false);

  const fieldMap = useMemo(() => {
    const map = new Map<string, SettingsFieldSchema>();
    if (!data) return map;
    for (const group of data.schema) for (const key of group.keys) map.set(key.key, key);
    return map;
  }, [data]);

  async function finish() {
    setFinishing(true);
    try {
      await completeOnboarding();
    } finally {
      onDone();
    }
  }

  if (!data) {
    return (
      <div className={styles.screen}>
        <div className={styles.loading}>Loading…</div>
      </div>
    );
  }

  const photoUrl = getValue('_profile_photo');
  const name = getValue('_profile_name');
  const networkIntegrations = INTEGRATIONS.filter((def) => !def.local);

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.steps}>
          <span className={[styles.stepDot, step === 'profile' ? styles.stepDotActive : styles.stepDotDone].join(' ')} />
          <span
            className={[styles.stepDot, step === 'folders' ? styles.stepDotActive : step === 'integrations' ? styles.stepDotDone : ''].join(' ')}
          />
          <span className={[styles.stepDot, step === 'integrations' ? styles.stepDotActive : ''].join(' ')} />
        </div>

        {step === 'profile' ? (
          <>
            <header className={styles.head}>
              <h1 className={styles.title}>Welcome to Control Center</h1>
              <p className={styles.sub}>Let's set up who you are. Everything here can be changed later in Settings.</p>
            </header>

            <div className={settingsStyles.card}>
              <ProfilePhotoField photoUrl={photoUrl} name={name} onChanged={(url) => setLocal('_profile_photo', url ?? '')} />
              <div className={settingsStyles.grid2}>
                {PROFILE_KEYS.map((key) => {
                  const field = fieldMap.get(key);
                  if (!field) return null;
                  return <SettingsField key={key} field={field} value={getValue(key)} isSecret={isSecret(key)} origin={origin(key)} onChange={(v, o) => setValue(key, v, o)} />;
                })}
              </div>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={() => setStep('folders')}>
                Continue
              </button>
            </div>
          </>
        ) : step === 'folders' ? (
          <>
            <header className={styles.head}>
              <h1 className={styles.title}>Your local content</h1>
              <p className={styles.sub}>Both optional - skip either one and its app shows a "choose a folder" prompt whenever you're ready.</p>
            </header>

            <div className={settingsStyles.card}>
              <div className={settingsStyles.grid2}>
                {FOLDER_KEYS.map((key) => {
                  const field = fieldMap.get(key);
                  if (!field) return null;
                  return <SettingsField key={key} field={field} value={getValue(key)} isSecret={isSecret(key)} origin={origin(key)} onChange={(v, o) => setValue(key, v, o)} />;
                })}
              </div>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.ghost} onClick={() => setStep('profile')}>
                Back
              </button>
              <button type="button" className={styles.primary} onClick={() => setStep('integrations')}>
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <header className={styles.head}>
              <h1 className={styles.title}>Connect what you use</h1>
              <p className={styles.sub}>
                Every card below is optional - Control Center works fine with none of them connected, and you can always add more later in
                Settings → Integrations.
              </p>
            </header>

            <div className={settingsStyles.cardList}>
              {networkIntegrations.map((def) => {
                const fields = def.keys.map((k) => fieldMap.get(k)).filter((f): f is SettingsFieldSchema => !!f);
                const testUrl = def.testUrlKey ? getValue(def.testUrlKey) : undefined;
                return (
                  <IntegrationCard
                    key={def.id}
                    name={def.name}
                    blurb={def.blurb}
                    status={def.status(snapshot, data.values)}
                    errorText={def.errorText?.(snapshot)}
                    fields={fields}
                    getValue={getValue}
                    isSecret={isSecret}
                    origin={origin}
                    onChange={(k, v, o) => setValue(k, v, o)}
                    testUrl={testUrl || undefined}
                  />
                );
              })}
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.ghost} onClick={() => setStep('folders')} disabled={finishing}>
                Back
              </button>
              <button type="button" className={styles.primary} onClick={finish} disabled={finishing}>
                {finishing ? 'Finishing…' : 'Finish setup'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
