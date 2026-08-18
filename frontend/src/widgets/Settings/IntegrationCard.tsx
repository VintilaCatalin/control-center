import { useState } from 'react';
import { testConnection } from '../../api/actions/settings';
import type { SettingsFieldSchema } from '../../api/types';
import { SettingsField } from './SettingsField';
import type { IntegrationStatus } from './integrations';
import styles from './IntegrationCard.module.css';

interface IntegrationCardProps {
  name: string;
  blurb: string;
  status: IntegrationStatus;
  errorText?: string;
  fields?: SettingsFieldSchema[];
  getValue?: (key: string) => string;
  isSecret?: (key: string) => boolean;
  origin?: (key: string) => string;
  onChange?: (key: string, value: string, opts?: { immediate?: boolean }) => void;
  probeMs?: number | null;
  testUrl?: string;
}

type TestState = { phase: 'idle' } | { phase: 'testing' } | { phase: 'done'; ok: boolean; detail: string };

const STATUS_LABEL: Record<IntegrationStatus, string> = {
  connected: 'Connected',
  not_connected: 'Not connected',
  error: 'Error',
  unknown: 'Probe only',
};

function monogram(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function IntegrationCard({ name, blurb, status, errorText, fields, getValue, isSecret, origin, onChange, probeMs, testUrl }: IntegrationCardProps) {
  const [open, setOpen] = useState(false);
  const [test, setTest] = useState<TestState>({ phase: 'idle' });
  const configurable = !!fields && fields.length > 0;

  async function runTest() {
    if (!testUrl) return;
    setTest({ phase: 'testing' });
    const res = await testConnection(testUrl);
    if (res.ok) setTest({ phase: 'done', ok: true, detail: `${res.status ?? 200} · ${res.ms}ms` });
    else setTest({ phase: 'done', ok: false, detail: res.error ?? 'Unreachable' });
  }

  return (
    <div className={styles.card}>
      <button type="button" className={styles.head} onClick={() => configurable && setOpen((o) => !o)} disabled={!configurable}>
        <span className={styles.avatar} data-status={status}>
          {monogram(name)}
        </span>
        <span className={styles.info}>
          <span className={styles.name}>{name}</span>
          <span className={styles.blurb}>{blurb}</span>
        </span>
        <span className={styles.statusWrap}>
          <span className={styles.statusPill} data-status={status}>
            <span className={styles.statusDot} data-status={status} />
            {STATUS_LABEL[status]}
          </span>
          {probeMs != null && <span className={styles.probeMs}>{Math.round(probeMs)} ms</span>}
          {configurable && (
            <span className={[styles.chevron, open ? styles.chevronOpen : ''].join(' ')} aria-hidden="true">
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          )}
        </span>
      </button>

      {status === 'error' && errorText && <div className={styles.errorNote}>{errorText}</div>}

      {open && configurable && getValue && onChange && isSecret && origin && (
        <div className={styles.body}>
          {fields!.map((f) => (
            <SettingsField key={f.key} field={f} value={getValue(f.key)} isSecret={isSecret(f.key)} origin={origin(f.key)} onChange={(v, opts) => onChange(f.key, v, opts)} />
          ))}
          {testUrl && (
            <div className={styles.testRow}>
              <button type="button" className={styles.testBtn} onClick={runTest} disabled={test.phase === 'testing'}>
                {test.phase === 'testing' ? 'Testing…' : 'Test connection'}
              </button>
              {test.phase === 'done' && (
                <span className={styles.testResult} data-ok={test.ok}>
                  {test.ok ? 'Reachable' : 'Failed'} · {test.detail}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
