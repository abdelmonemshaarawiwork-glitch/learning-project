import { useLiveQuery } from 'dexie-react-hooks';
import { UserPlus, Users } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/states';
import { db } from '@/database/db';
import { useFormatters } from '@/hooks/useFormatters';
import { useUiStore } from '@/stores/ui';
import type { Patient } from '@/types/domain';
import { patientAgeYears } from '@/utils/patient';

export { patientAgeYears };

/** Returns the active patient (from ?patient= or the remembered selection). */
export function useActivePatient(): { patient: Patient | null | undefined; patients: Patient[] | undefined; setPatientId: (id: string | null) => void } {
  const [params, setParams] = useSearchParams();
  const { activePatientId, setActivePatientId } = useUiStore();
  const fromUrl = params.get('patient');
  useEffect(() => {
    if (fromUrl && fromUrl !== activePatientId) setActivePatientId(fromUrl);
  }, [fromUrl, activePatientId, setActivePatientId]);
  const id = fromUrl ?? activePatientId;
  const patients = useLiveQuery(() => db.patients.toArray(), []);
  const patient = patients === undefined ? undefined : (patients.find((p) => p.id === id) ?? null);
  const setPatientId = (pid: string | null) => {
    setActivePatientId(pid);
    if (params.has('patient')) {
      const next = new URLSearchParams(params);
      if (pid) next.set('patient', pid);
      else next.delete('patient');
      setParams(next, { replace: true });
    }
  };
  return { patient, patients, setPatientId };
}

export function PatientSelect({ patients, value, onChange, id = 'patient-select' }: { patients: Patient[]; value: string | null; onChange: (id: string | null) => void; id?: string }) {
  const sorted = [...patients].sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'admitted' ? -1 : 1));
  return (
    <Select id={id} aria-label="Select patient" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className="sm:w-80">
      <option value="">Select a patient…</option>
      {sorted.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} · {p.code}
          {p.status !== 'admitted' ? ` (${p.status})` : ''}
        </option>
      ))}
    </Select>
  );
}

/** Patient selector + summary shown at the top of every patient-scoped module. */
export function PatientContextBar({ patient, patients, setPatientId }: ReturnType<typeof useActivePatient>) {
  const f = useFormatters();
  if (patients === undefined) return null;
  if (patients.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title="No patients registered yet"
        description="Add a patient first. All records in this module belong to one patient."
        action={
          <Button asChild>
            <Link to="/patients/new">
              <UserPlus /> Add patient
            </Link>
          </Button>
        }
      />
    );
  }
  const age = patient ? patientAgeYears(patient) : null;
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-[var(--radius-card)] border bg-card p-3 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:p-4">
      <PatientSelect patients={patients} value={patient?.id ?? null} onChange={setPatientId} />
      {patient && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm" data-testid="patient-context">
          <Link to={`/patients/${patient.id}`} className="font-semibold hover:underline">
            {patient.name}
          </Link>
          <Badge variant="outline" className="font-mono">
            {patient.code}
          </Badge>
          <span className="text-muted-foreground">Age: {age?.age ?? '—'}</span>
          <span className="text-muted-foreground">Weight: {f.weight(patient.weightKg)}</span>
          <Badge variant={patient.status === 'admitted' ? 'primary' : 'neutral'}>{patient.status}</Badge>
        </div>
      )}
    </div>
  );
}
