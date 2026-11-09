import type { AssessmentMethod } from '@/types/domain';
import type { DateFormatPref, TimeFormatPref } from '@/utils/dates';
import type { HeightUnit, TemperatureUnit, WeightUnit } from '@/utils/units';
import type { ObservationThreshold } from '@/engines/thresholds';
import type { ObservationParameterDef } from './clinical';

export interface AttentionFlagConfig {
  /** Flag patients whose latest assessment contains indeterminate depth (data-quality flag). */
  indeterminateDepth: boolean;
  /** Flag when latest TBSA ≥ value. null = disabled (no default threshold is provided). */
  tbsaAtLeast: number | null;
  /** Flag admitted patients without an assessment within N hours. null = disabled. */
  assessmentOlderThanHours: number | null;
  /** Flag admitted patients with no intake/output record within N hours. null = disabled. */
  noFluidRecordHours: number | null;
  /** Flag latest observation values outside user-configured thresholds. */
  observationOutsideThreshold: boolean;
  /** Flag latest urine output below a VERIFIED target. */
  urineBelowVerifiedTarget: boolean;
  /** Flag reference datasets/protocols that are not configured. */
  unconfiguredReferences: boolean;
}

export interface AppSettings {
  theme: 'system' | 'light' | 'dark';
  weightUnit: WeightUnit;
  heightUnit: HeightUnit;
  temperatureUnit: TemperatureUnit;
  dateFormat: DateFormatPref;
  timeFormat: TimeFormatPref;
  defaultAssessmentMethod: AssessmentMethod;
  prefer2DMap: boolean;
  customObservationParameters: ObservationParameterDef[];
  observationThresholds: ObservationThreshold[];
  attentionFlags: AttentionFlagConfig;
  backupReminderDays: number | null;
  lastBackupAt: string | null;
  disclaimerAcknowledgedAt: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  weightUnit: 'kg',
  heightUnit: 'cm',
  temperatureUnit: 'C',
  dateFormat: 'dd/MM/yyyy',
  timeFormat: '24h',
  defaultAssessmentMethod: 'lund-browder',
  prefer2DMap: false,
  customObservationParameters: [],
  observationThresholds: [],
  attentionFlags: {
    indeterminateDepth: true,
    tbsaAtLeast: null,
    assessmentOlderThanHours: null,
    noFluidRecordHours: null,
    observationOutsideThreshold: true,
    urineBelowVerifiedTarget: true,
    unconfiguredReferences: true,
  },
  backupReminderDays: 7,
  lastBackupAt: null,
  disclaimerAcknowledgedAt: null,
};

export type SettingKey = keyof AppSettings;
