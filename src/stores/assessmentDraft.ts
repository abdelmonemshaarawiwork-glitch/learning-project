/**
 * In-progress assessment draft. Persisted to IndexedDB (drafts table) so it survives reloads
 * and is shared by the Burn Assessment workflow and the 3D Body Mapping page.
 */
import { create } from 'zustand';
import { clearDraft, getDraft, saveDraft } from '@/database/repositories/settings';
import type { PalmEntryInput, RegionalEntryInput } from '@/engines/tbsa/types';
import type { AssessmentMethod } from '@/types/domain';
import { nowIso } from '@/utils/dates';
import { logTechnicalError } from '@/utils/logger';

export interface AssessmentDraft {
  patientId: string;
  assessmentDate: string;
  assessor: string;
  method: AssessmentMethod;
  datasetId: string | null;
  columnId: string | null;
  columnOverridden: boolean;
  palmPercent: number | null;
  /** Palm option id from the reference dataset, or 'clinician-entered'. */
  palmReference: string | null;
  regionalEntries: RegionalEntryInput[];
  palmEntries: PalmEntryInput[];
  notes: string;
  limitationAcknowledged: boolean;
  amendsAssessmentId: string | null;
  step: number;
  updatedAt: string;
}

const DRAFT_ID = 'assessment';

interface DraftState {
  draft: AssessmentDraft | null;
  loaded: boolean;
  load: () => Promise<void>;
  start: (d: Omit<AssessmentDraft, 'updatedAt'>) => Promise<void>;
  update: (changes: Partial<AssessmentDraft>) => Promise<void>;
  upsertRegional: (entry: RegionalEntryInput) => Promise<void>;
  removeRegional: (id: string) => Promise<void>;
  upsertPalm: (entry: PalmEntryInput) => Promise<void>;
  removePalm: (id: string) => Promise<void>;
  discard: () => Promise<void>;
  /** Forgets the in-memory draft (on sign-in/sign-out); the next load() reads the new account's database. */
  reset: () => void;
}

async function persistDraft(d: AssessmentDraft | null) {
  try {
    if (d) await saveDraft(DRAFT_ID, d);
    else await clearDraft(DRAFT_ID);
  } catch (e) {
    logTechnicalError('persist assessment draft', e);
  }
}

export const useAssessmentDraft = create<DraftState>()((set, get) => {
  const commit = async (next: AssessmentDraft | null) => {
    const value = next ? { ...next, updatedAt: nowIso() } : null;
    set({ draft: value });
    await persistDraft(value);
  };
  return {
    draft: null,
    loaded: false,
    load: async () => {
      if (get().loaded) return;
      try {
        const d = await getDraft<AssessmentDraft>(DRAFT_ID);
        set({ draft: d, loaded: true });
      } catch (e) {
        logTechnicalError('load assessment draft', e);
        set({ loaded: true });
      }
    },
    start: async (d) => commit({ ...d, updatedAt: nowIso() }),
    update: async (changes) => {
      const cur = get().draft;
      if (cur) await commit({ ...cur, ...changes });
    },
    upsertRegional: async (entry) => {
      const cur = get().draft;
      if (!cur) return;
      const exists = cur.regionalEntries.some((e) => e.id === entry.id);
      await commit({
        ...cur,
        regionalEntries: exists ? cur.regionalEntries.map((e) => (e.id === entry.id ? entry : e)) : [...cur.regionalEntries, entry],
      });
    },
    removeRegional: async (id) => {
      const cur = get().draft;
      if (cur) await commit({ ...cur, regionalEntries: cur.regionalEntries.filter((e) => e.id !== id) });
    },
    upsertPalm: async (entry) => {
      const cur = get().draft;
      if (!cur) return;
      const exists = cur.palmEntries.some((e) => e.id === entry.id);
      await commit({ ...cur, palmEntries: exists ? cur.palmEntries.map((e) => (e.id === entry.id ? entry : e)) : [...cur.palmEntries, entry] });
    },
    removePalm: async (id) => {
      const cur = get().draft;
      if (cur) await commit({ ...cur, palmEntries: cur.palmEntries.filter((e) => e.id !== id) });
    },
    discard: async () => commit(null),
    reset: () => set({ draft: null, loaded: false }),
  };
});
