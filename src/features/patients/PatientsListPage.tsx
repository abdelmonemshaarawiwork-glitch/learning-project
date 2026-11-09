import { useLiveQuery } from 'dexie-react-hooks';
import { Search, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PageHeader } from '@/components/common/PageHeader';
import { patientAgeYears } from '@/components/common/PatientContextBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { EmptyState, LoadingState } from '@/components/ui/states';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { MECHANISM_OPTIONS, STATUS_OPTIONS } from '@/constants/clinical';
import { db } from '@/database/db';
import { useLatestAssessments } from '@/features/burn-assessment/queries';
import { useFormatters } from '@/hooks/useFormatters';
import type { Patient } from '@/types/domain';

type SortKey = 'admission-desc' | 'admission-asc' | 'name' | 'updated' | 'tbsa';

export function filterAndSortPatients(
  patients: Patient[],
  opts: { query: string; status: string; mechanism: string; sort: SortKey },
  tbsaByPatient: Map<string, number> = new Map(),
): Patient[] {
  const q = opts.query.trim().toLowerCase();
  const list = patients.filter((p) => {
    if (opts.status && p.status !== opts.status) return false;
    if (opts.mechanism && p.mechanism !== opts.mechanism) return false;
    if (!q) return true;
    return [p.name, p.code, p.diagnosis, p.mechanismDetails].some((s) => s.toLowerCase().includes(q));
  });
  const cmp: Record<SortKey, (a: Patient, b: Patient) => number> = {
    'admission-desc': (a, b) => b.admissionDate.localeCompare(a.admissionDate),
    'admission-asc': (a, b) => a.admissionDate.localeCompare(b.admissionDate),
    name: (a, b) => a.name.localeCompare(b.name),
    updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    tbsa: (a, b) => (tbsaByPatient.get(b.id) ?? -1) - (tbsaByPatient.get(a.id) ?? -1),
  };
  return list.sort(cmp[opts.sort]);
}

export default function PatientsListPage() {
  const patients = useLiveQuery(() => db.patients.toArray(), []);
  const latest = useLatestAssessments();
  const f = useFormatters();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [mechanism, setMechanism] = useState('');
  const [sort, setSort] = useState<SortKey>('admission-desc');

  const tbsa = useMemo(() => new Map([...(latest ?? new Map()).entries()].map(([k, v]) => [k, v.tbsaTotal])), [latest]);
  const list = useMemo(() => filterAndSortPatients(patients ?? [], { query, status, mechanism, sort }, tbsa), [patients, query, status, mechanism, sort, tbsa]);

  return (
    <>
      <PageHeader
        title="Patients"
        description="Patient records stored locally on this device."
        actions={
          <Button asChild>
            <Link to="/patients/new">
              <UserPlus /> Add patient
            </Link>
          </Button>
        }
      />
      <Card className="mb-4 p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_180px_180px_200px]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search patients"
              placeholder="Search name, ID, diagnosis…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter by mechanism" value={mechanism} onChange={(e) => setMechanism(e.target.value)}>
            <option value="">All mechanisms</option>
            {MECHANISM_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Sort patients" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="admission-desc">Newest admission first</option>
            <option value="admission-asc">Oldest admission first</option>
            <option value="name">Name A–Z</option>
            <option value="updated">Recently updated</option>
            <option value="tbsa">Highest latest TBSA</option>
          </Select>
        </div>
      </Card>

      {patients === undefined ? (
        <LoadingState />
      ) : patients.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No patients yet"
          description="Patients you add are stored only on this device."
          action={
            <Button asChild>
              <Link to="/patients/new">
                <UserPlus /> Add the first patient
              </Link>
            </Button>
          }
        />
      ) : list.length === 0 ? (
        <EmptyState icon={<Search />} title="No matching patients" description="Change the search or filters." />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground" data-testid="patient-count">
            {list.length} of {patients.length} patient{patients.length === 1 ? '' : 's'}
          </p>
          <Card className="hidden md:block">
            <Table>
              <THead>
                <TR>
                  <TH>Patient</TH>
                  <TH>ID</TH>
                  <TH>Age</TH>
                  <TH>Weight</TH>
                  <TH>Admitted</TH>
                  <TH>Latest TBSA</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {list.map((p) => (
                  <TR key={p.id} className="cursor-pointer" onClick={() => navigate(`/patients/${p.id}`)}>
                    <TD className="font-medium">
                      <Link to={`/patients/${p.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                        {p.name}
                      </Link>
                      {p.diagnosis && <p className="max-w-xs truncate text-xs text-muted-foreground">{p.diagnosis}</p>}
                    </TD>
                    <TD className="font-mono text-xs">{p.code}</TD>
                    <TD className="tabular">{patientAgeYears(p).age ?? '—'}</TD>
                    <TD className="tabular">{f.weight(p.weightKg)}</TD>
                    <TD className="tabular whitespace-nowrap">{f.dateTime(p.admissionDate)}</TD>
                    <TD className="tabular">{latest?.has(p.id) ? f.tbsa(latest.get(p.id)!.tbsaTotal) : '—'}</TD>
                    <TD>
                      <Badge variant={p.status === 'admitted' ? 'primary' : 'neutral'}>{p.status}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <div className="grid gap-3 md:hidden">
            {list.map((p) => (
              <Link key={p.id} to={`/patients/${p.id}`} className="rounded-[var(--radius-card)] border bg-card p-4 shadow-[var(--shadow-card)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{p.code}</p>
                  </div>
                  <Badge variant={p.status === 'admitted' ? 'primary' : 'neutral'}>{p.status}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Age {patientAgeYears(p).age ?? '—'}</span>
                  <span>{f.weight(p.weightKg)}</span>
                  <span>TBSA {latest?.has(p.id) ? f.tbsa(latest.get(p.id)!.tbsaTotal) : '—'}</span>
                  <span>Admitted {f.date(p.admissionDate)}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
