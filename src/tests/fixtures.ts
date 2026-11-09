import type { PatientInput } from '@/database/repositories/patients';

export function patientInput(over: Partial<PatientInput> = {}): PatientInput {
  return {
    name: 'Test Patient',
    ageYears: 40,
    dateOfBirth: null,
    sex: 'female',
    weightKg: 70,
    heightCm: 170,
    admissionDate: '2026-03-01T08:00:00.000Z',
    injuryDate: '2026-03-01T06:00:00.000Z',
    mechanism: 'flame',
    mechanismDetails: '',
    medicalHistory: '',
    surgicalHistory: '',
    allergies: '',
    medications: '',
    diagnosis: '',
    notes: '',
    status: 'admitted',
    ...over,
  };
}

