import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Checkbox, Input, Select } from '@/components/ui/input';
import { describeThreshold, type ObservationThreshold } from '@/engines/thresholds';
import { parseNumberInput } from '@/features/burn-assessment/components/RegionEditors';
import { useObservationParameters, useSettings } from '@/hooks/useSettings';
import { newId } from '@/utils/ids';

export function ThresholdsTab() {
  const { settings, update } = useSettings();
  const params = useObservationParameters();
  const thresholds = settings.observationThresholds;
  const [paramId, setParamId] = useState(params[0]?.id ?? '');
  const [field, setField] = useState<'value' | 'value2'>('value');
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');
  const [source, setSource] = useState('');
  const def = params.find((p) => p.id === paramId);
  const lowN = low.trim() === '' ? null : parseNumberInput(low);
  const highN = high.trim() === '' ? null : parseNumberInput(high);
  const valid = def && (lowN !== null || highN !== null) && (lowN === null || Number.isFinite(lowN)) && (highN === null || Number.isFinite(highN)) && !(lowN !== null && highN !== null && lowN > highN);

  const [customLabel, setCustomLabel] = useState('');
  const [customUnit, setCustomUnit] = useState('');

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Observation warning thresholds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="info">
            No thresholds are provided by default. Thresholds you add are shown transparently with every warning (e.g. “above the configured upper threshold of 120 bpm”) and never
            generate a diagnosis. Values below <em>low</em> or above <em>high</em> are flagged.
          </Alert>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
            <Field label="Parameter" htmlFor="th-param" className="lg:col-span-2">
              <Select id="th-param" value={paramId} onChange={(e) => setParamId(e.target.value)}>
                {params.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({p.unit})
                  </option>
                ))}
              </Select>
            </Field>
            {def?.kind === 'bp' && (
              <Field label="Value" htmlFor="th-field">
                <Select id="th-field" value={field} onChange={(e) => setField(e.target.value as 'value' | 'value2')}>
                  <option value="value">Systolic</option>
                  <option value="value2">Diastolic</option>
                </Select>
              </Field>
            )}
            <Field label={`Low (${def?.unit ?? ''})`} htmlFor="th-low">
              <Input id="th-low" inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} />
            </Field>
            <Field label={`High (${def?.unit ?? ''})`} htmlFor="th-high">
              <Input id="th-high" inputMode="decimal" value={high} onChange={(e) => setHigh(e.target.value)} />
            </Field>
            <Field label="Source / rationale" htmlFor="th-src">
              <Input id="th-src" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Local policy ref." />
            </Field>
          </div>
          <Button
            disabled={!valid}
            onClick={() => {
              const t: ObservationThreshold = { id: newId(), parameterId: paramId, field: def?.kind === 'bp' ? field : 'value', unit: def!.unit, low: lowN, high: highN, source, enabled: true };
              void update('observationThresholds', [...thresholds, t]);
              setLow('');
              setHigh('');
              setSource('');
              toast.success('Threshold added.');
            }}
            data-testid="add-threshold"
          >
            <Plus /> Add threshold
          </Button>
          <div className="divide-y rounded-xl border">
            {thresholds.length === 0 && <p className="p-4 text-sm text-muted-foreground">No thresholds configured.</p>}
            {thresholds.map((t) => {
              const p = params.find((x) => x.id === t.parameterId);
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <Checkbox
                    aria-label="Enabled"
                    checked={t.enabled}
                    onChange={(e) => void update('observationThresholds', thresholds.map((x) => (x.id === t.id ? { ...x, enabled: e.target.checked } : x)))}
                  />
                  <span className="font-medium">
                    {p?.label ?? t.parameterId}
                    {t.field === 'value2' ? ' (diastolic)' : p?.kind === 'bp' ? ' (systolic)' : ''}
                  </span>
                  <span className="text-muted-foreground">{describeThreshold(t)}</span>
                  {t.source && <span className="text-xs text-muted-foreground">· {t.source}</span>}
                  <Button className="ml-auto" size="icon-sm" variant="ghost" aria-label="Remove threshold" onClick={() => void update('observationThresholds', thresholds.filter((x) => x.id !== t.id))}>
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Additional observation parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
            <Field label="Parameter name" htmlFor="cp-label">
              <Input id="cp-label" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="e.g. Haemoglobin" />
            </Field>
            <Field label="Unit" htmlFor="cp-unit">
              <Input id="cp-unit" value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} placeholder="e.g. g/L" />
            </Field>
            <Button
              disabled={!customLabel.trim() || !customUnit.trim()}
              onClick={() => {
                void update('customObservationParameters', [
                  ...settings.customObservationParameters,
                  { id: `custom-${newId().slice(0, 8)}`, label: customLabel.trim(), unit: customUnit.trim(), decimals: 2, kind: 'single', builtIn: false },
                ]);
                setCustomLabel('');
                setCustomUnit('');
              }}
            >
              <Plus /> Add parameter
            </Button>
          </div>
          <ul className="divide-y rounded-xl border text-sm">
            {settings.customObservationParameters.length === 0 && <li className="p-3 text-muted-foreground">None added.</li>}
            {settings.customObservationParameters.map((p) => (
              <li key={p.id} className="flex items-center justify-between p-3">
                <span>
                  {p.label} <span className="text-muted-foreground">({p.unit})</span>
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove parameter"
                  onClick={() => void update('customObservationParameters', settings.customObservationParameters.filter((x) => x.id !== p.id))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Removing a parameter does not delete observations already recorded with it.</p>
        </CardContent>
      </Card>
    </div>
  );
}
