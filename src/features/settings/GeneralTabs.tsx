import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { PRIVACY_POINTS } from '@/app/providers/DisclaimerGate';
import { ConfigStatusBadge } from '@/components/common/ClinicalNotices';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Checkbox, Input, Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { APP_NAME, APP_SUBTITLE, APP_VERSION, ASSESSMENT_METHODS, CLINICAL_DISCLAIMER } from '@/constants/clinical';
import type { AttentionFlagConfig } from '@/constants/settings';
import { db } from '@/database/db';
import { CURRENT_SCHEMA_VERSION } from '@/database/migrations';
import { parseNumberInput } from '@/features/burn-assessment/components/RegionEditors';
import { useFormatters } from '@/hooks/useFormatters';
import { useSettings } from '@/hooks/useSettings';
import type { AssessmentMethod } from '@/types/domain';

export function PreferencesTab() {
  const { settings, update } = useSettings();
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Application</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Theme" htmlFor="pref-theme">
            <Select id="pref-theme" value={settings.theme} onChange={(e) => void update('theme', e.target.value as typeof settings.theme)}>
              <option value="system">Follow device</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </Select>
          </Field>
          <Field label="Default assessment method" htmlFor="pref-method">
            <Select id="pref-method" value={settings.defaultAssessmentMethod} onChange={(e) => void update('defaultAssessmentMethod', e.target.value as AssessmentMethod)}>
              {ASSESSMENT_METHODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox checked={settings.prefer2DMap} onChange={(e) => void update('prefer2DMap', e.target.checked)} />
            Open the 2D anatomical map by default instead of the 3D model
          </label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Units &amp; formats</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Weight" htmlFor="pref-wu" hint="Calculations always use kg internally.">
            <Select id="pref-wu" value={settings.weightUnit} onChange={(e) => void update('weightUnit', e.target.value as 'kg' | 'lb')}>
              <option value="kg">Kilograms (kg)</option>
              <option value="lb">Pounds (lb)</option>
            </Select>
          </Field>
          <Field label="Height" htmlFor="pref-hu">
            <Select id="pref-hu" value={settings.heightUnit} onChange={(e) => void update('heightUnit', e.target.value as 'cm' | 'in')}>
              <option value="cm">Centimetres (cm)</option>
              <option value="in">Inches (in)</option>
            </Select>
          </Field>
          <Field label="Temperature" htmlFor="pref-tu" hint="Stored in °C.">
            <Select id="pref-tu" value={settings.temperatureUnit} onChange={(e) => void update('temperatureUnit', e.target.value as 'C' | 'F')}>
              <option value="C">Celsius (°C)</option>
              <option value="F">Fahrenheit (°F)</option>
            </Select>
          </Field>
          <Field label="Volumes" htmlFor="pref-vol" hint="All volumes are in millilitres.">
            <Input id="pref-vol" value="Millilitres (mL)" disabled />
          </Field>
          <Field label="Date format" htmlFor="pref-df">
            <Select id="pref-df" value={settings.dateFormat} onChange={(e) => void update('dateFormat', e.target.value as typeof settings.dateFormat)}>
              <option value="dd/MM/yyyy">31/12/2026</option>
              <option value="MM/dd/yyyy">12/31/2026</option>
              <option value="yyyy-MM-dd">2026-12-31</option>
            </Select>
          </Field>
          <Field label="Time format" htmlFor="pref-tf">
            <Select id="pref-tf" value={settings.timeFormat} onChange={(e) => void update('timeFormat', e.target.value as '24h' | '12h')}>
              <option value="24h">24-hour (14:30)</option>
              <option value="12h">12-hour (2:30 PM)</option>
            </Select>
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}

function NumberOrOff({ id, label, value, onChange, suffix }: { id: string; label: string; value: number | null; onChange: (v: number | null) => void; suffix: string }) {
  // Enabling does NOT invent a value: the rule only becomes active once a number is entered.
  const [enabled, setEnabled] = useState(value !== null);
  const [text, setText] = useState(value === null ? '' : String(value));
  return (
    <div className="flex flex-col flex-wrap gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
      <label className="flex items-center gap-2 text-sm" htmlFor={`${id}-on`}>
        <Checkbox
          id={`${id}-on`}
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            if (!e.target.checked) {
              setText('');
              onChange(null);
            }
          }}
        />
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          aria-label={label}
          className="w-28"
          inputMode="decimal"
          disabled={!enabled}
          value={text}
          placeholder={enabled ? 'enter value' : 'off'}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const n = parseNumberInput(text);
            if (Number.isFinite(n) && n >= 0) onChange(n);
          }}
        />
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
      {enabled && value === null && <p className="text-xs text-warning sm:basis-full">Rule inactive until a value is entered.</p>}
    </div>
  );
}

export function FlagsTab() {
  const { settings, update } = useSettings();
  const cfg = settings.attentionFlags;
  const set = (changes: Partial<AttentionFlagConfig>) => void update('attentionFlags', { ...cfg, ...changes });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dashboard attention flags</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert variant="info">
          Flags prompt review; they are not diagnoses. Numeric rules have no default value — enable them only with values taken from your local policy. Every flag displays the rule
          that produced it.
        </Alert>
        {(
          [
            ['indeterminateDepth', 'Latest assessment contains indeterminate burn depth'],
            ['observationOutsideThreshold', 'Latest observation outside a configured warning threshold'],
            ['urineBelowVerifiedTarget', 'Latest urine output below a VERIFIED target'],
            ['unconfiguredReferences', 'Clinical references or protocols that are NOT CONFIGURED'],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 rounded-xl border p-3 text-sm">
            <Checkbox checked={cfg[k]} onChange={(e) => set({ [k]: e.target.checked })} />
            {label}
          </label>
        ))}
        <NumberOrOff id="flag-tbsa" label="Latest TBSA at or above" value={cfg.tbsaAtLeast} onChange={(v) => set({ tbsaAtLeast: v })} suffix="% TBSA" />
        <NumberOrOff id="flag-assess" label="No burn assessment within" value={cfg.assessmentOlderThanHours} onChange={(v) => set({ assessmentOlderThanHours: v })} suffix="hours" />
        <NumberOrOff id="flag-io" label="No intake/output record within" value={cfg.noFluidRecordHours} onChange={(v) => set({ noFluidRecordHours: v })} suffix="hours" />
      </CardContent>
    </Card>
  );
}

export function AboutTab() {
  const f = useFormatters();
  const datasets = useLiveQuery(() => db.referenceDatasets.toArray(), []);
  const protocols = useLiveQuery(() => db.fluidProtocols.toArray(), []);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Privacy notice</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            {PRIVACY_POINTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
            <li>The application makes no network requests for patient data. The only network activity is loading application updates from the site it was installed from.</li>
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Medical disclaimer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="rounded-xl bg-warning-soft p-3 font-medium text-warning">{CLINICAL_DISCLAIMER}</p>
          <p>
            {APP_NAME} has <strong>not</strong> undergone formal clinical validation or regulatory review. It does not prescribe, order or adjust treatment. All clinical reference data
            must be verified locally before use (see docs/CLINICAL_VALIDATION.md).
          </p>
          <p className="text-muted-foreground">
            {APP_NAME} {APP_VERSION} — {APP_SUBTITLE}. Database schema v{CURRENT_SCHEMA_VERSION}.
          </p>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Configured reference datasets &amp; protocols</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Version</TH>
                <TH>Type</TH>
                <TH>Status</TH>
                <TH>Verification</TH>
              </TR>
            </THead>
            <TBody>
              {[...(datasets ?? []).map((d) => ({ ...d, type: d.kind })), ...(protocols ?? []).map((p) => ({ ...p, type: 'fluid protocol' }))].map((x) => (
                <TR key={x.id}>
                  <TD>{x.name}</TD>
                  <TD className="font-mono text-xs">{x.version}</TD>
                  <TD className="text-xs">{x.type}</TD>
                  <TD>
                    <ConfigStatusBadge status={x.status} />
                  </TD>
                  <TD className="text-xs">{x.verification ? `${x.verification.verifiedBy}, ${f.date(x.verification.verificationDate)}` : '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
