import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  /** null = automatic (collapsed on tablet widths, expanded on desktop). */
  sidebarCollapsed: boolean | null;
  mobileNavOpen: boolean;
  /** Only the internal id is remembered (never names or clinical data). */
  activePatientId: string | null;
  setSidebarCollapsed: (v: boolean | null) => void;
  setMobileNavOpen: (v: boolean) => void;
  setActivePatientId: (id: string | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: null,
      mobileNavOpen: false,
      activePatientId: null,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      setActivePatientId: (activePatientId) => set({ activePatientId }),
    }),
    {
      name: 'burn-tool:ui',
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, activePatientId: s.activePatientId }),
    },
  ),
);
