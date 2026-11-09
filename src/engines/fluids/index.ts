/**
 * Fluid resuscitation ESTIMATE engine.
 *
 * Provides calculation support for clinician review only. It never produces orders,
 * infusion rates for pumps, or automatic adjustments. The protocol parameters are supplied
 * by the caller from a VERIFIED protocol configuration; nothing is assumed here.
 */
import { INTAKE_LABEL } from '@/constants/clinical';
import { validateProtocolParameters } from '@/engines/integrity';
import { addHoursIso, formatDuration, hoursBetween, isValidIso } from '@/utils/dates';
import { formatCompact, formatNumber, isFiniteNumber, preciseSum } from '@/utils/rounding';
import type {
  FluidCalculationInput,
  FluidCalculationOutcome,
  FluidPhaseResult,
  FluidValidationIssue,
} from './types';

export * from './types';

export function validateFluidInput(input: FluidCalculationInput): FluidValidationIssue[] {
  const issues: FluidValidationIssue[] = [];
  if (!isFiniteNumber(input.weightKg) || input.weightKg <= 0)
    issues.push({ field: 'weightKg', message: 'Weight must be a number greater than 0 kg.' });
  if (!isFiniteNumber(input.tbsaPercent) || input.tbsaPercent <= 0 || input.tbsaPercent > 100)
    issues.push({ field: 'tbsaPercent', message: 'TBSA must be greater than 0% and at most 100%.' });
  if (!isValidIso(input.injuryTime)) issues.push({ field: 'injuryTime', message: 'Time of injury is required.' });
  if (!isValidIso(input.asOfTime)) issues.push({ field: 'asOfTime', message: 'Calculation time is invalid.' });
  if (input.resuscitationStartTime !== null && !isValidIso(input.resuscitationStartTime))
    issues.push({ field: 'resuscitationStartTime', message: 'Resuscitation start time is invalid.' });
  if (!isFiniteNumber(input.administeredMl) || input.administeredMl < 0)
    issues.push({ field: 'administeredMl', message: 'Administered volume must be 0 mL or more.' });

  if (isValidIso(input.injuryTime)) {
    if (input.resuscitationStartTime && isValidIso(input.resuscitationStartTime) && hoursBetween(input.injuryTime, input.resuscitationStartTime) < 0)
      issues.push({ field: 'resuscitationStartTime', message: 'Resuscitation cannot start before the time of injury.' });
    if (isValidIso(input.asOfTime) && hoursBetween(input.injuryTime, input.asOfTime) < 0)
      issues.push({ field: 'asOfTime', message: 'Calculation time cannot be before the time of injury.' });
  }

  const params = input.protocol?.parameters;
  if (!params) issues.push({ field: 'protocol', message: 'A verified protocol must be selected.' });
  else {
    for (const m of validateProtocolParameters(params)) issues.push({ field: 'protocol', message: m });
    if (params.timeReference === 'resuscitation-start' && !input.resuscitationStartTime)
      issues.push({ field: 'resuscitationStartTime', message: 'This protocol measures time from the start of resuscitation; enter it.' });
  }
  return issues;
}

export function calculateFluidEstimate(input: FluidCalculationInput): FluidCalculationOutcome {
  const issues = validateFluidInput(input);
  if (issues.length > 0) return { ok: false, issues };

  const p = input.protocol.parameters;
  const coefficient = p.mlPerKgPerPercentTbsa as number;
  const periodHours = p.periodHours as number;
  const totalVolumeMl = coefficient * input.weightKg * input.tbsaPercent;

  const referenceTime = p.timeReference === 'injury' ? input.injuryTime : (input.resuscitationStartTime as string);
  const referenceLabel = p.timeReference === 'injury' ? 'time of injury' : 'start of resuscitation';
  const hoursSinceReference = hoursBetween(referenceTime, input.asOfTime);
  const hoursSinceInjury = hoursBetween(input.injuryTime, input.asOfTime);
  const hoursSinceResuscitationStart = input.resuscitationStartTime
    ? hoursBetween(input.resuscitationStartTime, input.asOfTime)
    : null;

  const sortedPhases = [...p.phases].sort((a, b) => a.startHour - b.startHour);
  const phases: FluidPhaseResult[] = sortedPhases.map((ph) => {
      const durationHours = ph.endHour - ph.startHour;
      const volumeMl = totalVolumeMl * ph.fractionOfTotal;
      const status: FluidPhaseResult['status'] =
        hoursSinceReference >= ph.endHour ? 'completed' : hoursSinceReference >= ph.startHour ? 'current' : 'upcoming';
      return {
        id: ph.id,
        label: ph.label,
        start: addHoursIso(referenceTime, ph.startHour),
        end: addHoursIso(referenceTime, ph.endHour),
        durationHours,
        volumeMl,
        averageMlPerHour: volumeMl / durationHours,
        status,
        hoursRemaining: Math.max(0, ph.endHour - hoursSinceReference),
      };
    });

  const scheduledCumulativeMl = preciseSum(
    phases.map((ph, i) => {
      const fraction = Math.min(1, Math.max(0, (hoursSinceReference - sortedPhases[i]!.startHour) / ph.durationHours));
      return ph.volumeMl * fraction;
    }),
  );

  const remainingMl = totalVolumeMl - input.administeredMl;
  const periodElapsed = hoursSinceReference >= periodHours;

  const warnings: string[] = [];
  if (input.resuscitationStartTime && p.timeReference === 'injury') {
    const delay = hoursBetween(input.injuryTime, input.resuscitationStartTime);
    if (delay > 0) {
      const first = phases[0];
      if (first) {
        const firstEndAfterStart = hoursBetween(input.resuscitationStartTime, first.end);
        warnings.push(
          firstEndAfterStart > 0
            ? `Resuscitation started ${formatDuration(delay)} after injury. Because this protocol measures time from injury, the "${first.label}" window ends ${formatDuration(firstEndAfterStart)} after resuscitation started.`
            : `Resuscitation started ${formatDuration(delay)} after injury — after the end of the "${first.label}" window.`,
        );
      }
    }
  }
  if (!input.resuscitationStartTime) warnings.push('Resuscitation start time has not been entered.');
  if (remainingMl < 0)
    warnings.push(`Administered volume exceeds the estimated ${periodHours}-hour volume by ${formatNumber(-remainingMl)} mL.`);
  if (periodElapsed) warnings.push(`The ${periodHours}-hour estimation period of this protocol has elapsed.`);

  const counted = p.countedIntakeCategories.map((c) => INTAKE_LABEL[c] ?? c).join(', ');
  const assumptions = [
    `Protocol: ${input.protocol.name} v${input.protocol.version} (verified configuration).`,
    `Volume coefficient: ${formatCompact(coefficient, 3)} mL/kg/%TBSA; estimation period ${formatCompact(periodHours, 2)} h measured from the ${referenceLabel}.`,
    `Weight used: ${formatCompact(input.weightKg, 2)} kg. TBSA used: ${formatCompact(input.tbsaPercent, 2)}% (superficial burns excluded).`,
    `Fluid described by protocol: ${p.fluidDescription || 'not specified'}.`,
    `"Administered" counts intake records in: ${counted}, from the ${referenceLabel} up to the calculation time.`,
    'Schedule cumulative assumes even distribution within each phase. Phase averages are arithmetic descriptions of the estimate, not infusion rates or pump settings.',
    'Estimates require clinical assessment and ongoing monitoring; the application does not prescribe or adjust fluid administration.',
  ];

  return {
    ok: true,
    result: {
      formulaText: `${formatCompact(coefficient, 3)} mL × ${formatCompact(input.weightKg, 2)} kg × ${formatCompact(input.tbsaPercent, 2)} %TBSA = ${formatNumber(totalVolumeMl)} mL over ${formatCompact(periodHours, 2)} h`,
      totalVolumeMl,
      referenceTime,
      referenceLabel,
      periodEnd: addHoursIso(referenceTime, periodHours),
      hoursSinceInjury,
      hoursSinceResuscitationStart,
      hoursSinceReference,
      phases,
      scheduledCumulativeMl,
      administeredMl: input.administeredMl,
      remainingMl,
      periodElapsed,
      assumptions,
      warnings,
    },
  };
}
