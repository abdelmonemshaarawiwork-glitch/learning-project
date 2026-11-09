import { useMemo } from 'react';
import { formatDate, formatDateTime, formatTime, type DateDisplayPrefs } from '@/utils/dates';
import { formatCompact, formatNumber } from '@/utils/rounding';
import { heightToDisplay, temperatureToDisplay, weightToDisplay } from '@/utils/units';
import { useSettings } from './useSettings';

export function useFormatters() {
  const { settings } = useSettings();
  return useMemo(() => {
    const prefs: DateDisplayPrefs = { dateFormat: settings.dateFormat, timeFormat: settings.timeFormat };
    return {
      prefs,
      settings,
      dateTime: (iso: string | null | undefined) => formatDateTime(iso, prefs),
      date: (iso: string | null | undefined) => formatDate(iso, prefs),
      time: (iso: string | null | undefined) => formatTime(iso, prefs),
      weight: (kg: number | null | undefined) =>
        kg === null || kg === undefined ? '—' : `${formatCompact(weightToDisplay(kg, settings.weightUnit), 1)} ${settings.weightUnit}`,
      height: (cm: number | null | undefined) =>
        cm === null || cm === undefined ? '—' : `${formatCompact(heightToDisplay(cm, settings.heightUnit), 1)} ${settings.heightUnit}`,
      temperature: (c: number) => `${formatCompact(temperatureToDisplay(c, settings.temperatureUnit), 1)} °${settings.temperatureUnit}`,
      ml: (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${formatNumber(v)} mL`),
      tbsa: (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${formatCompact(v, 1)}%`),
    };
  }, [settings]);
}
