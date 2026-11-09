import { BURN_DEPTH_MAP, INTAKE_LABEL, MECHANISM_OPTIONS, METHOD_LABEL, OUTPUT_LABEL, SEX_OPTIONS, TBSA_TOTAL_DECIMALS, TIMELINE_LABEL, type ObservationParameterDef } from '@/constants/clinical';
import type { AppSettings } from '@/constants/settings';
import { patientAgeYears } from '@/utils/patient';
import { bucketByDay, bucketByHour, computeTotals, totalsByCategory } from '@/engines/fluid-balance';
import { depthBySegment } from '@/engines/tbsa';
import { evaluateThresholds } from '@/engines/thresholds';
import { regionsToItems } from '@/features/burn-assessment/assessmentView';
import type { Assessment, ReferenceDataset } from '@/types/domain';
import { addHoursIso, formatDate, formatDateTime, formatDuration, type DateDisplayPrefs } from '@/utils/dates';
import { formatCompact, formatNumber } from '@/utils/rounding';
import { temperatureToDisplay } from '@/utils/units';
import type { PdfBuilder } from './builder';
import type { PatientReportData } from './reportData';

export interface SectionContext {
  b: PdfBuilder;
  data: PatientReportData;
  prefs: DateDisplayPrefs;
  settings: AppSettings;
  params: ObservationParameterDef[];
  datasets: Map<string, ReferenceDataset>;
}

const dt = (ctx: SectionContext, iso: string | null | undefined) => formatDateTime(iso, ctx.prefs);
const currentAssessments = (ctx: SectionContext) => ctx.data.assessments.filter((a) => !a.supersededById);

export function patientSection(ctx: SectionContext) {
  const p = ctx.data.patient;
  const age = patientAgeYears(p);
  ctx.b.section('Patient');
  ctx.b.keyValues([
    ['Name / identifier', p.name],
    ['Patient ID', p.code],
    ['Date of birth', p.dateOfBirth ? formatDate(p.dateOfBirth, ctx.prefs) : '-'],
    ['Age', age.age !== null ? `${age.age} years (${age.source === 'date-of-birth' ? 'from DOB' : 'recorded'})` : 'Unknown'],
    ['Sex', SEX_OPTIONS.find((s) => s.id === p.sex)?.label ?? p.sex],
    ['Status', p.status],
    ['Weight', p.weightKg !== null ? `${formatCompact(p.weightKg, 2)} kg` : '-'],
    ['Height', p.heightCm !== null ? `${formatCompact(p.heightCm, 1)} cm` : '-'],
    ['Admission', dt(ctx, p.admissionDate)],
    ['Injury', p.injuryDate ? dt(ctx, p.injuryDate) : '-'],
    ['Mechanism', [MECHANISM_OPTIONS.find((m) => m.id === p.mechanism)?.label, p.mechanismDetails].filter(Boolean).join(' - ') || '-'],
    ['Diagnosis', p.diagnosis || '-'],
  ]);
  ctx.b.keyValues(
    [
      ['Drug allergies', p.allergies || '-'],
      ['Medications', p.medications || '-'],
      ['Medical history', p.medicalHistory || '-'],
      ['Surgical history', p.surgicalHistory || '-'],
      ['Clinical notes', p.notes || '-'],
    ],
    1,
  );
}

export function summarySection(ctx: SectionContext) {
  const latest = currentAssessments(ctx).at(-1);
  const totals = computeTotals(ctx.data.patient.id, ctx.data.intake, ctx.data.output);
  const calc = ctx.data.fluidCalculations.at(-1);
  ctx.b.section('Summary');
  ctx.b.keyValues([
    ['Latest TBSA', latest ? `${formatCompact(latest.tbsaTotal, 1)}% (${METHOD_LABEL[latest.method]}, ${dt(ctx, latest.assessmentDate)})` : 'No assessment'],
    ['Indeterminate', latest ? `${formatCompact(latest.tbsaIndeterminate, 1)}% (not included)` : '-'],
    ['Assessments', String(ctx.data.assessments.length)],
    ['Fluid estimate', calc ? `${formatNumber(calc.resultData.totalVolumeMl)} mL (${calc.protocolName} v${calc.protocolVersion})` : 'None saved'],
    ['Total intake', `${formatNumber(totals.intakeMl)} mL`],
    ['Total output', `${formatNumber(totals.outputMl)} mL`],
    ['Net balance', `${formatNumber(totals.netMl)} mL`],
    ['Observations', String(ctx.data.observations.length)],
  ]);
}

function assessmentHeader(ctx: SectionContext, a: Assessment) {
  ctx.b.keyValues([
    ['Assessment time', dt(ctx, a.assessmentDate)],
    ['Method', METHOD_LABEL[a.method]],
    ['Reference', a.referenceName ? `${a.referenceName} v${a.referenceVersion}` : a.palmReference ?? '-'],
    ['Age column', a.ageColumnLabel ?? '-'],
    ['Age at assessment', a.ageAtAssessment !== null ? `${a.ageAtAssessment} years` : 'Unknown'],
    ['Assessor', a.assessor || '-'],
    ['Type', a.supersededById ? 'Superseded (amended later)' : a.kind === 'initial' ? 'Initial' : 'Repeat'],
    ['Palm-equivalent', a.palmPercent !== null ? `${a.palmPercent}% TBSA` : '-'],
  ]);
}

function tbsaResultTable(ctx: SectionContext, a: Assessment) {
  ctx.b.table({
    head: [['TBSA (eligible)', 'Indeterminate (not included)', 'Upper bound', 'Superficial (excluded)']],
    body: [[`${formatCompact(a.tbsaTotal, 1)}%`, `${formatCompact(a.tbsaIndeterminate, 1)}%`, `${formatCompact(a.tbsaUpperBound, 1)}%`, `${formatCompact(a.tbsaSuperficialExcluded, 1)}%`]],
    bodyStyles: { fontSize: 11, fontStyle: 'bold', halign: 'center' },
    headStyles: { halign: 'center' },
  });
}

function breakdownTable(ctx: SectionContext, a: Assessment) {
  const regions = ctx.data.regionsByAssessment.get(a.id) ?? [];
  if (!regions.length) {
    ctx.b.paragraph('No burned regions recorded (TBSA 0%).', { muted: true });
    return;
  }
  const palm = a.method === 'palm';
  ctx.b.table({
    head: [['Region', 'Depth', palm ? 'Palm-eq.' : 'Involved', palm ? '% per palm' : 'Region %', 'Contribution', 'Counted', 'Notes']],
    body: regions.map((r) => [
      r.label,
      BURN_DEPTH_MAP[r.depth].label,
      palm ? formatCompact(r.palmEquivalents, 2) : `${formatCompact(r.involvementPercent, 2)}%`,
      `${formatCompact(r.referencePercent, 3)}%`,
      `${formatCompact(r.tbsaContribution, 2)}%`,
      r.eligible ? 'Yes' : r.depth === 'indeterminate' ? 'Flagged' : 'No',
      r.notes,
    ]),
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  });
}

export function assessmentSection(ctx: SectionContext, a: Assessment, opts: { map?: boolean } = {}) {
  ctx.b.section(`Burn assessment - ${dt(ctx, a.assessmentDate)}`);
  assessmentHeader(ctx, a);
  tbsaResultTable(ctx, a);
  for (const w of a.warnings) ctx.b.callout(w, 'warning');
  ctx.b.paragraph('Regional breakdown', { bold: true });
  breakdownTable(ctx, a);
  if (a.notes) ctx.b.paragraph(`Notes: ${a.notes}`);
  if (opts.map !== false) {
    ctx.b.paragraph('Burn mapping (2D)', { bold: true });
    ctx.b.bodyMap(depthBySegment(regionsToItems(ctx.data.regionsByAssessment.get(a.id) ?? [])));
  }
}

export function tbsaCalculationSection(ctx: SectionContext, a: Assessment) {
  ctx.b.section('TBSA calculation details');
  const regions = ctx.data.regionsByAssessment.get(a.id) ?? [];
  const ds = a.referenceDatasetId ? ctx.datasets.get(a.referenceDatasetId) : undefined;
  ctx.b.keyValues(
    [
      ['Method', METHOD_LABEL[a.method]],
      ['Dataset', ds ? `${ds.name} v${ds.version} (${ds.id})` : a.method === 'palm' ? a.palmReference ?? '-' : `${a.referenceName ?? '-'} v${a.referenceVersion ?? '-'}`],
      ['Source', ds?.source ?? '-'],
      ['Verification', ds?.verification ? `${ds.verification.verifiedBy} (${ds.verification.role}), ${formatDate(ds.verification.verificationDate, ctx.prefs)} - hash ${ds.verification.contentHash.slice(0, 16)}...` : a.method === 'palm' ? 'Clinician-entered palm value' : 'Not available'],
    ],
    1,
  );
  const lines = regions.map((r) =>
    a.method === 'palm'
      ? `${r.label} - ${BURN_DEPTH_MAP[r.depth].label}: ${formatCompact(r.palmEquivalents, 2)} x ${formatCompact(r.referencePercent, 3)}% = ${formatCompact(r.tbsaContribution, 4)}%${r.eligible ? '' : ' (excluded)'}`
      : `${r.label} - ${BURN_DEPTH_MAP[r.depth].label}: ${formatCompact(r.referencePercent, 3)}% x ${formatCompact(r.involvementPercent, 2)}% = ${formatCompact(r.tbsaContribution, 4)}%${r.eligible ? '' : ' (excluded)'}`,
  );
  for (const l of lines) ctx.b.paragraph(l, { size: 8 });
  ctx.b.paragraph(
    `Eligible TBSA = sum of superficial-partial, deep-partial and full-thickness contributions = ${formatCompact(a.tbsaExact, 4)}% -> ${formatCompact(a.tbsaTotal, TBSA_TOTAL_DECIMALS)}% (rounded once, half away from zero, to ${TBSA_TOTAL_DECIMALS} decimal). Superficial burns are excluded; indeterminate areas are reported separately and are not included.`,
    { size: 8.5 },
  );
}

export function bodyMapSection(ctx: SectionContext, a: Assessment) {
  ctx.b.section(`Burn mapping - ${dt(ctx, a.assessmentDate)}`);
  ctx.b.paragraph(`${METHOD_LABEL[a.method]} - TBSA ${formatCompact(a.tbsaTotal, 1)}% (indeterminate ${formatCompact(a.tbsaIndeterminate, 1)}%).`);
  ctx.b.bodyMap(depthBySegment(regionsToItems(ctx.data.regionsByAssessment.get(a.id) ?? [])), 140);
  ctx.b.paragraph('Mapped regions', { bold: true });
  breakdownTable(ctx, a);
}

export function fluidSection(ctx: SectionContext) {
  ctx.b.section('Fluid management');
  ctx.b.callout('Calculation support for clinician review only. Estimates require clinical assessment and monitoring and are not prescriptions, orders or infusion-pump settings.', 'warning');
  const calcs = ctx.data.fluidCalculations;
  if (!calcs.length) {
    ctx.b.paragraph('No saved fluid calculations in this period.', { muted: true });
    return;
  }
  const c = calcs.at(-1)!;
  const r = c.resultData;
  ctx.b.paragraph(`Latest saved calculation (${dt(ctx, c.calculationDate)})`, { bold: true });
  ctx.b.keyValues([
    ['Protocol', `${c.protocolName} v${c.protocolVersion}`],
    ['Formula', r.formulaText],
    ['Weight used', `${formatCompact(c.inputData.weightKg, 2)} kg`],
    ['TBSA used', `${formatCompact(c.inputData.tbsaPercent, 2)}%`],
    ['Time of injury', dt(ctx, c.inputData.injuryTime)],
    ['Resuscitation start', c.inputData.resuscitationStartTime ? dt(ctx, c.inputData.resuscitationStartTime) : 'Not entered'],
    ['Time since injury', formatDuration(r.hoursSinceInjury)],
    ['Since resuscitation', r.hoursSinceResuscitationStart === null ? '-' : formatDuration(r.hoursSinceResuscitationStart)],
    ['Estimated volume', `${formatNumber(r.totalVolumeMl)} mL`],
    ['Administered', `${formatNumber(r.administeredMl)} mL`],
    ['Remaining estimate', `${formatNumber(r.remainingMl)} mL`],
    ['Schedule cumulative', `${formatNumber(r.scheduledCumulativeMl)} mL`],
  ]);
  ctx.b.table({
    head: [['Phase', 'Window', 'Volume', 'Arithmetic average*', 'Status at calculation']],
    body: r.phases.map((ph) => [ph.label, `${dt(ctx, ph.start)} -> ${dt(ctx, ph.end)}`, `${formatNumber(ph.volumeMl)} mL`, `${formatNumber(ph.averageMlPerHour)} mL/h`, ph.status]),
  });
  ctx.b.paragraph('* Volume divided by window length. Descriptive only; not an infusion rate.', { size: 7.5, muted: true });
  for (const w of r.warnings) ctx.b.callout(w, 'warning');
  ctx.b.paragraph('Assumptions', { bold: true });
  for (const a of r.assumptions) ctx.b.paragraph(`- ${a}`, { size: 8 });
  if (calcs.length > 1) {
    ctx.b.paragraph('All saved calculations', { bold: true });
    ctx.b.table({
      head: [['Calculated', 'Protocol', 'Weight', 'TBSA', 'Estimate', 'Administered', 'Remaining']],
      body: calcs.map((x) => [dt(ctx, x.calculationDate), `${x.protocolName} v${x.protocolVersion}`, `${formatCompact(x.inputData.weightKg, 1)} kg`, `${formatCompact(x.inputData.tbsaPercent, 1)}%`, `${formatNumber(x.resultData.totalVolumeMl)} mL`, `${formatNumber(x.resultData.administeredMl)} mL`, `${formatNumber(x.resultData.remainingMl)} mL`]),
    });
  }
}

export function intakeOutputSection(ctx: SectionContext) {
  const { intake, output, patient } = ctx.data;
  ctx.b.section('Intake & output');
  const totals = computeTotals(patient.id, intake, output);
  ctx.b.table({
    head: [['Total intake', 'Total output', 'Net balance (intake - output)']],
    body: [[`${formatNumber(totals.intakeMl)} mL`, `${formatNumber(totals.outputMl)} mL`, `${formatNumber(totals.netMl)} mL`]],
    bodyStyles: { fontStyle: 'bold', halign: 'center', fontSize: 10 },
    headStyles: { halign: 'center' },
  });
  if (!intake.length && !output.length) {
    ctx.b.paragraph('No intake or output recorded in this period.', { muted: true });
    return;
  }
  const byIn = totalsByCategory(intake);
  const byOut = totalsByCategory(output);
  ctx.b.table({
    head: [['Category', 'Type', 'Total']],
    body: [
      ...Object.entries(byIn).map(([k, v]) => [INTAKE_LABEL[k as keyof typeof INTAKE_LABEL] ?? k, 'Intake', `${formatNumber(v)} mL`]),
      ...Object.entries(byOut).map(([k, v]) => [OUTPUT_LABEL[k as keyof typeof OUTPUT_LABEL] ?? k, 'Output', `${formatNumber(v)} mL`]),
    ],
  });
  const all = [...intake, ...output].map((r) => r.dateTime).sort();
  const start = ctx.data.range.start ?? all[0]!;
  const end = ctx.data.range.end ?? addHoursIso(all.at(-1)!, 1);
  const daily = bucketByDay(patient.id, intake, output, start, end).filter((b) => b.intakeMl || b.outputMl);
  ctx.b.paragraph('Daily balance', { bold: true });
  ctx.b.table({
    head: [['Day', 'Intake', 'Output', 'Balance', 'Cumulative balance']],
    body: daily.map((d) => [formatDate(d.start, ctx.prefs), formatNumber(d.intakeMl), formatNumber(d.outputMl), formatNumber(d.netMl), formatNumber(d.cumulativeNetMl)]),
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  });
  const hourly = bucketByHour(patient.id, intake, output, start, end).filter((b) => b.intakeMl || b.outputMl);
  ctx.b.paragraph('Hourly balance (hours with records)', { bold: true });
  ctx.b.table({
    head: [['Hour starting', 'Intake (mL)', 'Output (mL)', 'Balance (mL)', 'Cumulative (mL)']],
    body: hourly.map((h) => [dt(ctx, h.start), formatNumber(h.intakeMl), formatNumber(h.outputMl), formatNumber(h.netMl), formatNumber(h.cumulativeNetMl)]),
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
  });
  ctx.b.paragraph('Records', { bold: true });
  ctx.b.table({
    head: [['Date / time', 'Type', 'Category', 'Amount', 'Details / notes']],
    body: [...intake.map((r) => ({ ...r, t: 'Intake', c: INTAKE_LABEL[r.category] })), ...output.map((r) => ({ ...r, t: 'Output', c: OUTPUT_LABEL[r.category] }))]
      .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
      .map((r) => [dt(ctx, r.dateTime), r.t, r.c, `${formatNumber(r.amountMl)} mL`, [r.source, r.notes].filter(Boolean).join(' - ')]),
  });
}

export function urineSection(ctx: SectionContext) {
  ctx.b.section('Urine output');
  const obs = ctx.data.observations.filter((o) => o.parameter === 'urine-output');
  const urine = ctx.data.output.filter((r) => r.category === 'urine');
  if (!obs.length) ctx.b.paragraph('No urine-output rate calculations saved in this period.', { muted: true });
  else
    ctx.b.table({
      head: [['Measurement end', 'Rate', 'Volume', 'Duration', 'Weight', 'Notes']],
      body: obs.map((o) => {
        const m = (o.meta ?? {}) as { volumeMl?: number; durationHours?: number; weightKg?: number };
        return [dt(ctx, o.dateTime), `${formatCompact(o.value, 2)} mL/kg/h`, m.volumeMl !== undefined ? `${formatCompact(m.volumeMl, 1)} mL` : '-', m.durationHours !== undefined ? formatDuration(m.durationHours) : '-', m.weightKg !== undefined ? `${formatCompact(m.weightKg, 2)} kg` : '-', o.notes];
      }),
    });
  ctx.b.paragraph('Rate = urine volume (mL) / weight (kg) / measurement duration (h). Results are labelled against a target only when a verified, age-specific target is configured.', { size: 8, muted: true });
  if (urine.length) {
    ctx.b.paragraph('Recorded urine volumes', { bold: true });
    ctx.b.table({ head: [['Date / time', 'Volume', 'Details']], body: urine.map((r) => [dt(ctx, r.dateTime), `${formatNumber(r.amountMl)} mL`, [r.source, r.notes].filter(Boolean).join(' - ')]) });
  }
}

export function monitoringSection(ctx: SectionContext) {
  ctx.b.section('Clinical monitoring');
  const obs = ctx.data.observations;
  if (!obs.length) {
    ctx.b.paragraph('No observations recorded in this period.', { muted: true });
    return;
  }
  const label = (id: string) => ctx.params.find((p) => p.id === id)?.label ?? id;
  const fmtVal = (o: (typeof obs)[number]) =>
    o.parameter === 'temperature' && o.unit === '°C'
      ? `${formatCompact(temperatureToDisplay(o.value, ctx.settings.temperatureUnit), 1)} deg ${ctx.settings.temperatureUnit}`
      : `${formatCompact(o.value, 2)}${o.value2 !== null ? `/${formatCompact(o.value2, 2)}` : ''} ${o.unit}`;
  ctx.b.table({
    head: [['Date / time', 'Parameter', 'Value', 'Configured threshold check', 'Notes']],
    body: obs.map((o) => {
      const flags = evaluateThresholds(o, ctx.settings.observationThresholds).filter((e) => e.status !== 'within');
      return [dt(ctx, o.dateTime), label(o.parameter), fmtVal(o), flags.length ? flags.map((f) => `${f.status.toUpperCase()}: ${f.thresholdText}`).join('; ') : '-', o.notes];
    }),
  });
  ctx.b.paragraph('Threshold checks compare values with user-configured thresholds only. They are not diagnoses.', { size: 7.5, muted: true });
}

export function timelineSection(ctx: SectionContext) {
  ctx.b.section('Clinical timeline');
  if (!ctx.data.events.length) {
    ctx.b.paragraph('No timeline events in this period.', { muted: true });
    return;
  }
  ctx.b.table({
    head: [['Date / time', 'Event', 'Description', 'Notes']],
    body: ctx.data.events.map((e) => [dt(ctx, e.dateTime), TIMELINE_LABEL[e.eventType], e.description, e.notes]),
    columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 34 } },
  });
}
