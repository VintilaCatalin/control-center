import { useState } from 'react';
import { pickPath } from '../../api/actions/filePicker';
import type { SettingsFieldSchema } from '../../api/types';
import styles from './SettingsField.module.css';

interface SettingsFieldProps {
  field: SettingsFieldSchema;
  value: string;
  isSecret: boolean;
  origin: string;
  onChange: (value: string, opts?: { immediate?: boolean }) => void;
}

// One renderer for every field type SETTINGS_SCHEMA declares (server.py)
// - text/secret/number/select/bool/folder/lines/image - so Settings,
// System & Preferences and Integrations all render forms from the exact
// same component instead of three hand-built ones drifting apart.
export function SettingsField({ field, value, isSecret, origin, onChange }: SettingsFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const [editingSecret, setEditingSecret] = useState(false);

  const overridden = origin === 'panel';

  async function handleBrowse() {
    const r = await pickPath('folder');
    if (r.path) onChange(r.path, { immediate: true });
  }

  return (
    <div className={styles.field}>
      <div className={styles.fieldHead}>
        <label className={styles.label}>{field.label}</label>
        {overridden && field.type !== 'bool' && (
          <button type="button" className={styles.resetBtn} onClick={() => onChange('', { immediate: true })} title="Clear override, fall back to default/config.ini">
            Reset
          </button>
        )}
      </div>

      {field.type === 'bool' ? (
        <button
          type="button"
          role="switch"
          aria-checked={value === 'true'}
          className={[styles.switch, value === 'true' ? styles.switchOn : ''].join(' ')}
          onClick={() => onChange(value === 'true' ? 'false' : 'true', { immediate: true })}
        >
          <span className={styles.switchKnob} />
        </button>
      ) : field.type === 'select' ? (
        <select className={styles.input} value={value} onChange={(e) => onChange(e.target.value, { immediate: true })}>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </option>
          ))}
        </select>
      ) : field.type === 'folder' ? (
        <div className={styles.folderRow}>
          <input
            className={styles.input}
            type="text"
            value={value}
            placeholder={field.hint}
            onChange={(e) => onChange(e.target.value)}
          />
          <button type="button" className={styles.browseBtn} onClick={handleBrowse}>
            Browse…
          </button>
        </div>
      ) : field.type === 'lines' ? (
        <textarea
          className={styles.textarea}
          rows={4}
          value={value}
          placeholder={field.hint}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === 'secret' && isSecret && !editingSecret ? (
        <div className={styles.secretRow}>
          <span className={styles.secretMask}>{value ? (revealed ? value : '•'.repeat(Math.min(24, Math.max(8, value.length)))) : 'Not set'}</span>
          {value && (
            <button type="button" className={styles.secretBtn} onClick={() => setRevealed((r) => !r)}>
              {revealed ? 'Hide' : 'Reveal'}
            </button>
          )}
          <button type="button" className={styles.secretBtn} onClick={() => setEditingSecret(true)}>
            {value ? 'Change' : 'Set'}
          </button>
        </div>
      ) : (
        <input
          className={styles.input}
          type={field.type === 'number' ? 'number' : 'text'}
          value={value}
          placeholder={field.hint}
          autoFocus={editingSecret}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            if (editingSecret) setEditingSecret(false);
          }}
        />
      )}

      {field.hint && field.type !== 'lines' && <span className={styles.hint}>{field.hint}</span>}
    </div>
  );
}
