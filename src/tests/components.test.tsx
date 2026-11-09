import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ALL_SEGMENT_KEYS } from '@/constants/clinical';
import { BodyMap2D } from '@/features/body-mapping/BodyMap2D';
import { RegionalEditor } from '@/features/burn-assessment/components/RegionEditors';
import { compareRegions } from '@/features/burn-assessment/AssessmentHistoryPage';
import { filterAndSortPatients } from '@/features/patients/PatientsListPage';
import { calculateRegionalTbsa } from '@/engines/tbsa';
import { LUND_BROWDER_TEMPLATE } from '@/reference-data/tbsa-templates';
import type { AssessmentRegion, Patient } from '@/types/domain';

describe('BodyMap2D', () => {
  it('renders every segment surface and selects by click and keyboard', async () => {
    const onSelect = vi.fn();
    const { container } = render(<BodyMap2D depthBySegment={new Map([['trunk:anterior', 'full-thickness']])} onSelectSegment={onSelect} />);
    const paths = container.querySelectorAll('path[data-segment]');
    expect([...paths].map((p) => p.getAttribute('data-segment')).sort()).toEqual([...ALL_SEGMENT_KEYS].sort());
    expect(container.querySelector('path[data-segment="trunk:anterior"]')!.getAttribute('data-depth')).toBe('full-thickness');
    await userEvent.click(screen.getByRole('button', { name: /Left thigh \(anterior\)/ }));
    expect(onSelect).toHaveBeenCalledWith('thigh-left:anterior');
    screen.getByRole('button', { name: /Right hand \(posterior\)/ }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith('hand-right:posterior');
  });
  it('is not interactive in read-only mode', () => {
    render(<BodyMap2D depthBySegment={new Map()} readOnly />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('ConfirmDialog', () => {
  it('requires the confirmation phrase before confirming', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open onOpenChange={() => {}} title="Delete?" requireText="BT-123" destructive confirmLabel="Delete" onConfirm={onConfirm} />);
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Type/), 'BT-123');
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe('RegionalEditor', () => {
  it('shows engine validation for involvement above 100%', () => {
    const entries = [{ id: 'e1', regionId: 'trunk', surface: 'anterior' as const, depth: 'deep-partial' as const, involvementPercent: 120 }];
    const result = calculateRegionalTbsa({ data: LUND_BROWDER_TEMPLATE.data, columnId: 'adult', entries });
    render(
      <RegionalEditor data={LUND_BROWDER_TEMPLATE.data} columnId="adult" regionId="trunk" surface="anterior" entries={entries} issues={result.issues} onUpsert={() => {}} onRemove={() => {}} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('cannot exceed 100%');
    expect(screen.getByText(/Whole region =/)).toHaveTextContent('13% TBSA');
    expect(screen.getByRole('button', { name: 'Add Deep partial thickness' })).toBeDisabled();
  });
  it('adds an entry with an explicitly chosen depth and no assumed involvement', async () => {
    const onUpsert = vi.fn();
    render(<RegionalEditor data={LUND_BROWDER_TEMPLATE.data} columnId="adult" regionId="neck" surface="anterior" entries={[]} issues={[]} onUpsert={onUpsert} onRemove={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add Indeterminate' }));
    expect(onUpsert.mock.calls[0]![0]).toMatchObject({ regionId: 'neck', surface: 'anterior', depth: 'indeterminate' });
    expect(Number.isNaN(onUpsert.mock.calls[0]![0].involvementPercent)).toBe(true);
  });
});

describe('list helpers', () => {
  const mk = (name: string, status: Patient['status'], admissionDate: string) => ({ id: name, code: name, name, status, admissionDate, updatedAt: admissionDate, diagnosis: '', mechanismDetails: '', mechanism: 'flame' }) as Patient;
  it('filters and sorts patients', () => {
    const list = [mk('Zed', 'admitted', '2026-01-02'), mk('Amy', 'discharged', '2026-01-03'), mk('Bob', 'admitted', '2026-01-01')];
    expect(filterAndSortPatients(list, { query: '', status: 'admitted', mechanism: '', sort: 'name' }).map((p) => p.name)).toEqual(['Bob', 'Zed']);
    expect(filterAndSortPatients(list, { query: 'am', status: '', mechanism: '', sort: 'admission-desc' }).map((p) => p.name)).toEqual(['Amy']);
    expect(filterAndSortPatients(list, { query: '', status: '', mechanism: '', sort: 'admission-asc' })[0]!.name).toBe('Bob');
  });
  it('compares regions between assessments', () => {
    const r = (regionId: string, c: number, depth: AssessmentRegion['depth'] = 'deep-partial') => ({ regionId, surface: 'anterior', label: regionId, depth, tbsaContribution: c, eligible: depth !== 'superficial' && depth !== 'indeterminate' }) as AssessmentRegion;
    const diff = compareRegions([r('trunk', 6.5)], [r('trunk', 13), r('neck', 1)]);
    expect(diff.find((d) => d.key === 'trunk:anterior')!.delta).toBe(6.5);
    expect(diff.find((d) => d.key === 'neck:anterior')!.before).toBe(0);
  });
});
