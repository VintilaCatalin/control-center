import { useMemo, type CSSProperties } from 'react';
import type { SettingsFieldSchema, SettingsResponse } from '../../api/types';
import { BackgroundImageField } from './BackgroundImageField';
import { SettingsField } from './SettingsField';
import styles from './SettingsPages.module.css';

interface SettingsPageProps {
  data: SettingsResponse;
  getValue: (key: string) => string;
  origin: (key: string) => string;
  onChange: (key: string, value: string, opts?: { immediate?: boolean }) => void;
  setLocal: (key: string, value: string) => void;
}

// Appearance/sidebar/motion/notifications - application-level presentation
// preferences, all backed by the same SETTINGS_SCHEMA + /api/settings/save
// path every other field in this app already uses (see server.py's new
// "Interface" group). Nothing here is a separate local-only toggle that
// forgets itself on reload.
export function SettingsPage({ data, getValue, origin, onChange, setLocal }: SettingsPageProps) {
  const fieldMap = useMemo(() => {
    const map = new Map<string, SettingsFieldSchema>();
    for (const group of data.schema) for (const key of group.keys) map.set(key.key, key);
    return map;
  }, [data.schema]);

  const theme = fieldMap.get('_profile_theme');
  const material = fieldMap.get('material_style');
  const accent = fieldMap.get('accent_override');
  const sidebar = fieldMap.get('sidebar_default_collapsed');
  const motion = fieldMap.get('reduced_motion');
  const accentValue = getValue('accent_override');
  const materialValue = getValue('material_style') || 'liquid_glass';

  function chooseMaterial(value: 'blur_cyberpunk' | 'liquid_glass') {
    // Optimistic application keeps this tactile; AtmosphereProvider repeats
    // the same assignment from the persisted snapshot after the save lands.
    document.documentElement.dataset.material = value === 'blur_cyberpunk' ? 'blur' : 'liquid';
    onChange('material_style', value, { immediate: true });
  }

  const backgroundMode = fieldMap.get('background_mode');
  const backgroundColor = fieldMap.get('background_color');
  const backgroundModeValue = getValue('background_mode') || 'wallpaper';
  const backgroundColorValue = getValue('background_color') || '#0b0d12';
  const backgroundImageValue = getValue('background_image');

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <h1 className={styles.pageTitle}>Settings</h1>
        <p className={styles.pageSub}>Appearance and interface preferences for Control Center itself.</p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Appearance</h2>
        <div className={styles.card}>
          {material && (
            <div className={styles.materialField}>
              <div className={styles.materialHeading}>
                <span>Material style</span>
                <small>Applied across Control Center, including Tasks</small>
              </div>
              <div className={styles.materialChoices} role="radiogroup" aria-label="Material style">
                <button
                  type="button"
                  className={`${styles.materialOption} ${materialValue === 'blur_cyberpunk' ? styles.materialSelected : ''}`}
                  role="radio"
                  aria-checked={materialValue === 'blur_cyberpunk'}
                  onClick={() => chooseMaterial('blur_cyberpunk')}
                >
                  <span className={`${styles.materialPreview} ${styles.cyberpunkPreview}`} aria-hidden="true">
                    <span className={styles.previewRail} />
                    <span className={styles.previewSurface}><i /><i /><i /></span>
                  </span>
                  <span className={styles.materialCopy}>
                    <strong>Blur Cyberpunk <em>Old</em></strong>
                    <small>Airy, translucent and atmosphere-forward.</small>
                  </span>
                  <span className={styles.materialCheck} aria-hidden="true">✓</span>
                </button>
                <button
                  type="button"
                  className={`${styles.materialOption} ${materialValue === 'liquid_glass' ? styles.materialSelected : ''}`}
                  role="radio"
                  aria-checked={materialValue === 'liquid_glass'}
                  onClick={() => chooseMaterial('liquid_glass')}
                >
                  <span className={`${styles.materialPreview} ${styles.liquidPreview}`} aria-hidden="true">
                    <span className={styles.previewRail} />
                    <span className={styles.previewSurface}><i /><i /><i /></span>
                  </span>
                  <span className={styles.materialCopy}>
                    <strong>Liquid Glass Mac <em>New</em></strong>
                    <small>Richer graphite, floating depth and clearer type.</small>
                  </span>
                  <span className={styles.materialCheck} aria-hidden="true">✓</span>
                </button>
              </div>
            </div>
          )}
          <div className={styles.grid2}>
            {theme && <SettingsField field={theme} value={getValue('_profile_theme')} isSecret={false} origin={origin('_profile_theme')} onChange={(v, o) => onChange('_profile_theme', v, o)} />}
            {accent && (
              <div>
                <SettingsField field={accent} value={accentValue} isSecret={false} origin={origin('accent_override')} onChange={(v, o) => onChange('accent_override', v, o)} />
                <div className={styles.swatchRow}>
                  <span className={styles.swatch} style={{ '--swatch': /^#[0-9a-fA-F]{6}$/.test(accentValue) ? accentValue : 'var(--accent)' } as CSSProperties} />
                  <span className={styles.swatchLabel}>{accentValue ? 'Manual accent' : 'Following your wallpaper'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Background</h2>
        <div className={styles.card}>
          <div className={styles.grid2}>
            {backgroundMode && (
              <SettingsField
                field={backgroundMode}
                value={backgroundModeValue}
                isSecret={false}
                origin={origin('background_mode')}
                onChange={(v, o) => onChange('background_mode', v, o)}
              />
            )}
            {backgroundModeValue === 'color' && backgroundColor && (
              <div>
                <SettingsField
                  field={backgroundColor}
                  value={backgroundColorValue}
                  isSecret={false}
                  origin={origin('background_color')}
                  onChange={(v, o) => onChange('background_color', v, o)}
                />
                <div className={styles.swatchRow}>
                  <span className={styles.swatch} style={{ '--swatch': /^#[0-9a-fA-F]{6}$/.test(backgroundColorValue) ? backgroundColorValue : 'var(--accent)' } as CSSProperties} />
                  <span className={styles.swatchLabel}>Background colour</span>
                </div>
              </div>
            )}
          </div>
          {backgroundModeValue === 'image' && <BackgroundImageField imageUrl={backgroundImageValue} onChanged={(url) => setLocal('background_image', url ?? '')} />}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Sidebar</h2>
        <div className={styles.card}>{sidebar && <SettingsField field={sidebar} value={getValue('sidebar_default_collapsed')} isSecret={false} origin={origin('sidebar_default_collapsed')} onChange={(v, o) => onChange('sidebar_default_collapsed', v, o)} />}</div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Motion</h2>
        <div className={styles.card}>{motion && <SettingsField field={motion} value={getValue('reduced_motion')} isSecret={false} origin={origin('reduced_motion')} onChange={(v, o) => onChange('reduced_motion', v, o)} />}</div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Notifications</h2>
        <div className={styles.noteCard}>Control Center doesn't send system notifications yet - there's nothing to configure here for now.</div>
      </section>
    </div>
  );
}
