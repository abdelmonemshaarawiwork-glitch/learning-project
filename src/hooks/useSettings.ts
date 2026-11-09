import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo } from 'react';
import { db } from '@/database/db';
import { setSetting } from '@/database/repositories/settings';
import { BUILT_IN_OBSERVATION_PARAMETERS, type ObservationParameterDef } from '@/constants/clinical';
import { DEFAULT_SETTINGS, type AppSettings, type SettingKey } from '@/constants/settings';

export function mergeSettings(rows: { key: string; value: unknown }[] | undefined): AppSettings {
  const out: AppSettings = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows ?? []) {
    if (r.key in out) {
      const def = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[r.key];
      const value =
        def && typeof def === 'object' && !Array.isArray(def) && r.value && typeof r.value === 'object'
          ? { ...(def as object), ...(r.value as object) }
          : r.value;
      (out as unknown as Record<string, unknown>)[r.key] = value;
    }
  }
  return out;
}

export function useSettings() {
  const rows = useLiveQuery(() => db.settings.toArray(), []);
  const settings = useMemo(() => mergeSettings(rows), [rows]);
  const update = useCallback(<K extends SettingKey>(key: K, value: AppSettings[K]) => setSetting(key, value), []);
  return { settings, loaded: rows !== undefined, update };
}

export function useObservationParameters(): ObservationParameterDef[] {
  const { settings } = useSettings();
  return useMemo(() => [...BUILT_IN_OBSERVATION_PARAMETERS, ...settings.customObservationParameters], [settings.customObservationParameters]);
}
