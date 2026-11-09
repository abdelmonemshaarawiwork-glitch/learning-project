import { zodResolver } from '@hookform/resolvers/zod';
import { useLiveQuery } from 'dexie-react-hooks';
import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/common/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { LoadingState } from '@/components/ui/states';
import { MECHANISM_OPTIONS, SEX_OPTIONS, STATUS_OPTIONS } from '@/constants/clinical';
import { db } from '@/database/db';
import { createPatient, findPotentialDuplicates, updatePatient, type PatientInput } from '@/database/repositories/patients';
import { useFormatters } from '@/hooks/useFormatters';
import { useSettings } from '@/hooks/useSettings';
import { useUiStore } from '@/stores/ui';
import type { Patient } from '@/types/domain';
import { fromLocalInputValue } from '@/utils/dates';
import { describeError } from '@/utils/logger';
import { emptyPatientForm, formToPatientInput, patientFormSchema, patientToForm, type PatientFormValues } from './patientForm';

export default function PatientFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const existing = useLiveQuery(() => (id ? db.patients.get(id) : undefined), [id]);
  if (editing && existing === undefined) return <LoadingState />;
  return <PatientForm key={existing?.id ?? 'new'} existing={existing ?? null} />;
}

function PatientForm({ existing }: { existing: Patient | null }) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const f = useFormatters();
  const setActive = useUiStore((s) => s.setActivePatientId);
  const wu = settings.weightUnit;
  const hu = settings.heightUnit;
  const [duplicates, setDuplicates] = useState<Patient[] | null>(null);
  const [pending, setPending] = useState<PatientInput | null>(null);

  const form = useForm<PatientFormValues>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: existing ? patientToForm(existing, wu, hu) : emptyPatientForm(),
    mode: 'onBlur',
  });
  const { register, handleSubmit, formState, watch } = form;
  const e = formState.errors;

  useEffect(() => {
    if (existing && !formState.isDirty) form.reset(patientToForm(existing, wu, hu));
  }, [wu, hu]); // eslint-disable-line react-hooks/exhaustive-deps

  const injury = fromLocalInputValue(watch('injuryDate'));
  const admission = fromLocalInputValue(watch('admissionDate'));
  const injuryAfterAdmission = injury && admission && injury > admission;

  async function persist(input: PatientInput) {
    try {
      const saved = existing ? await updatePatient(existing.id, input) : await createPatient(input);
      setActive(saved.id);
      toast.success(existing ? 'Patient updated.' : `Patient created (${saved.code}).`);
      navigate(`/patients/${saved.id}`);
    } catch (err) {
      toast.error('Could not save the patient.', { description: describeError(err) });
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    const input = formToPatientInput(values, wu, hu);
    const dups = await findPotentialDuplicates(input.name, input.dateOfBirth, existing?.id);
    if (dups.length > 0) {
      setPending(input);
      setDuplicates(dups);
      return;
    }
    await persist(input);
  });

  return (
    <>
      <PageHeader
        title={existing ? `Edit patient ${existing.code}` : 'Add patient'}
        description="Use an anonymised identifier where possible. Store only the identifiers your service requires."
      />
      <form onSubmit={onSubmit} noValidate className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Identification &amp; demographics</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Patient name or anonymised identifier" htmlFor="name" required error={e.name?.message} className="sm:col-span-2">
                <Input id="name" autoComplete="off" aria-invalid={!!e.name} {...register('name')} />
              </Field>
              <Field label="Date of birth" htmlFor="dateOfBirth" error={e.dateOfBirth?.message} hint="Preferred: age is then calculated at each assessment.">
                <Input id="dateOfBirth" type="date" aria-invalid={!!e.dateOfBirth} {...register('dateOfBirth')} />
              </Field>
              <Field label="Age (years)" htmlFor="ageYears" error={e.ageYears?.message} hint="Use when the date of birth is unknown.">
                <Input id="ageYears" inputMode="decimal" aria-invalid={!!e.ageYears} {...register('ageYears')} />
              </Field>
              <Field label="Sex" htmlFor="sex">
                <Select id="sex" {...register('sex')}>
                  {SEX_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status" htmlFor="status">
                <Select id="status" {...register('status')}>
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={`Weight (${wu})`} htmlFor="weight" error={e.weight?.message} hint="Required for fluid and urine-output calculations.">
                <Input id="weight" inputMode="decimal" aria-invalid={!!e.weight} {...register('weight')} />
              </Field>
              <Field label={`Height (${hu})`} htmlFor="height" error={e.height?.message}>
                <Input id="height" inputMode="decimal" aria-invalid={!!e.height} {...register('height')} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Injury &amp; admission</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Admission date and time" htmlFor="admissionDate" required error={e.admissionDate?.message}>
                <Input id="admissionDate" type="datetime-local" aria-invalid={!!e.admissionDate} {...register('admissionDate')} />
              </Field>
              <Field label="Injury date and time" htmlFor="injuryDate" error={e.injuryDate?.message} hint="Fluid estimates are timed from injury.">
                <Input id="injuryDate" type="datetime-local" aria-invalid={!!e.injuryDate} {...register('injuryDate')} />
              </Field>
              {injuryAfterAdmission && (
                <Alert variant="warning" className="sm:col-span-2" title="Injury time is after admission">
                  Check the times. This is only expected for injuries sustained in hospital.
                </Alert>
              )}
              <Field label="Mechanism of injury" htmlFor="mechanism">
                <Select id="mechanism" {...register('mechanism')}>
                  <option value="">Not recorded</option>
                  {MECHANISM_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Mechanism details" htmlFor="mechanismDetails">
                <Input id="mechanismDetails" {...register('mechanismDetails')} />
              </Field>
              <Field label="Admission diagnosis" htmlFor="diagnosis" className="sm:col-span-2">
                <Input id="diagnosis" {...register('diagnosis')} />
              </Field>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field label="Drug allergies" htmlFor="allergies">
                <Textarea id="allergies" rows={2} {...register('allergies')} />
              </Field>
              <Field label="Current medications" htmlFor="medications">
                <Textarea id="medications" rows={2} {...register('medications')} />
              </Field>
              <Field label="Medical history" htmlFor="medicalHistory">
                <Textarea id="medicalHistory" rows={2} {...register('medicalHistory')} />
              </Field>
              <Field label="Surgical history" htmlFor="surgicalHistory">
                <Textarea id="surgicalHistory" rows={2} {...register('surgicalHistory')} />
              </Field>
              <Field label="Clinical notes" htmlFor="notes">
                <Textarea id="notes" rows={3} {...register('notes')} />
              </Field>
            </CardContent>
          </Card>
          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <Button type="submit" size="lg" disabled={formState.isSubmitting}>
              <Save /> {existing ? 'Save changes' : 'Create patient'}
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link to={existing ? `/patients/${existing.id}` : '/patients'}>Cancel</Link>
            </Button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={duplicates !== null}
        onOpenChange={(o) => !o && (setDuplicates(null), setPending(null))}
        title="Possible duplicate patient"
        description="A patient with the same name (and compatible date of birth) already exists:"
        consequences={(duplicates ?? []).map((d) => `${d.name} · ${d.code} · admitted ${f.dateTime(d.admissionDate)} · ${d.status}`)}
        confirmLabel={existing ? 'Save anyway' : 'Create anyway'}
        onConfirm={async () => {
          if (pending) await persist(pending);
        }}
      />
    </>
  );
}
