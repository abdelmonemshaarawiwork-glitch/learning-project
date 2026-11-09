import { z } from 'zod';
import type { PatientInput } from '@/database/repositories/patients';
import type { Patient } from '@/types/domain';
import { fromLocalInputValue, toLocalInputValue } from '@/utils/dates';
import { heightFromDisplay, heightToDisplay, weightFromDisplay, weightToDisplay, type HeightUnit, type WeightUnit } from '@/utils/units';
import { roundHalfAwayFromZero } from '@/utils/rounding';

const numeric = (msg: string, check: (n: number) => boolean) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || (Number.isFinite(Number(v)) && check(Number(v))), { message: msg });

export const patientFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name or an anonymised identifier.').max(200, 'Maximum 200 characters.'),
    dateOfBirth: z.string().trim(),
    ageYears: numeric('Age must be between 0 and 130 years.', (n) => n >= 0 && n <= 130),
    sex: z.enum(['female', 'male', 'other', 'unknown']),
    weight: numeric('Weight must be greater than 0.', (n) => n > 0),
    height: numeric('Height must be greater than 0.', (n) => n > 0),
    admissionDate: z.string().min(1, 'Admission date and time are required.'),
    injuryDate: z.string(),
    mechanism: z.string(),
    mechanismDetails: z.string().max(2000),
    medicalHistory: z.string().max(10000),
    surgicalHistory: z.string().max(10000),
    allergies: z.string().max(5000),
    medications: z.string().max(10000),
    diagnosis: z.string().max(2000),
    notes: z.string().max(20000),
    status: z.enum(['admitted', 'discharged', 'transferred', 'deceased']),
  })
  .superRefine((v, ctx) => {
    const today = new Date().toISOString().slice(0, 10);
    if (v.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(v.dateOfBirth)) ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'Invalid date.' });
    if (v.dateOfBirth && v.dateOfBirth > today) ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'Date of birth cannot be in the future.' });
    if (!fromLocalInputValue(v.admissionDate)) ctx.addIssue({ code: 'custom', path: ['admissionDate'], message: 'Invalid date/time.' });
    if (v.injuryDate && !fromLocalInputValue(v.injuryDate)) ctx.addIssue({ code: 'custom', path: ['injuryDate'], message: 'Invalid date/time.' });
    if (v.dateOfBirth && v.ageYears !== '') {
      const dobAge = (Date.parse(fromLocalInputValue(v.admissionDate) ?? new Date().toISOString()) - Date.parse(v.dateOfBirth)) / (365.25 * 864e5);
      if (Number.isFinite(dobAge) && Math.abs(dobAge - Number(v.ageYears)) > 1)
        ctx.addIssue({ code: 'custom', path: ['ageYears'], message: 'Age does not match the date of birth. Leave age empty when the date of birth is known.' });
    }
    if (v.dateOfBirth && v.injuryDate) {
      const inj = fromLocalInputValue(v.injuryDate);
      if (inj && inj.slice(0, 10) < v.dateOfBirth) ctx.addIssue({ code: 'custom', path: ['injuryDate'], message: 'Injury cannot be before date of birth.' });
    }
  });

export type PatientFormValues = z.infer<typeof patientFormSchema>;

export function emptyPatientForm(): PatientFormValues {
  return {
    name: '',
    dateOfBirth: '',
    ageYears: '',
    sex: 'unknown',
    weight: '',
    height: '',
    admissionDate: toLocalInputValue(new Date().toISOString()),
    injuryDate: '',
    mechanism: '',
    mechanismDetails: '',
    medicalHistory: '',
    surgicalHistory: '',
    allergies: '',
    medications: '',
    diagnosis: '',
    notes: '',
    status: 'admitted',
  };
}

export function patientToForm(p: Patient, wu: WeightUnit, hu: HeightUnit): PatientFormValues {
  return {
    name: p.name,
    dateOfBirth: p.dateOfBirth ?? '',
    ageYears: p.ageYears === null ? '' : String(p.ageYears),
    sex: p.sex,
    weight: p.weightKg === null ? '' : String(roundHalfAwayFromZero(weightToDisplay(p.weightKg, wu), 2)),
    height: p.heightCm === null ? '' : String(roundHalfAwayFromZero(heightToDisplay(p.heightCm, hu), 1)),
    admissionDate: toLocalInputValue(p.admissionDate),
    injuryDate: toLocalInputValue(p.injuryDate),
    mechanism: p.mechanism,
    mechanismDetails: p.mechanismDetails,
    medicalHistory: p.medicalHistory,
    surgicalHistory: p.surgicalHistory,
    allergies: p.allergies,
    medications: p.medications,
    diagnosis: p.diagnosis,
    notes: p.notes,
    status: p.status,
  };
}

export function formToPatientInput(v: PatientFormValues, wu: WeightUnit, hu: HeightUnit): PatientInput {
  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  const w = num(v.weight);
  const h = num(v.height);
  return {
    name: v.name.trim(),
    dateOfBirth: v.dateOfBirth || null,
    ageYears: num(v.ageYears),
    sex: v.sex,
    weightKg: w === null ? null : weightFromDisplay(w, wu),
    heightCm: h === null ? null : heightFromDisplay(h, hu),
    admissionDate: fromLocalInputValue(v.admissionDate)!,
    injuryDate: fromLocalInputValue(v.injuryDate),
    mechanism: v.mechanism,
    mechanismDetails: v.mechanismDetails,
    medicalHistory: v.medicalHistory,
    surgicalHistory: v.surgicalHistory,
    allergies: v.allergies,
    medications: v.medications,
    diagnosis: v.diagnosis,
    notes: v.notes,
    status: v.status,
  };
}
