import { create } from 'zustand';
import { CitizenshipCase, UserSession, Language, CaseType, CaseStatus } from '../types';
import { fetchCases, fetchCaseByEmail, fetchGlobalConfig, getLastFetchError } from '../services/storageService';
import { filterActiveCases, isGhostCase } from '../services/statsUtils';

interface FilterState {
  country: string;
  month: string;
  year: string;
  type: string;
  status: string;
  search: string;
  viewGhosts: boolean;
}

interface AppState {
  // Data State
  allCases: CitizenshipCase[];
  userCase: CitizenshipCase | undefined;
  isLoading: boolean;
  isDataLoading: boolean; // For silent background refreshes
  fetchError: string | null;
  isMaintenance: boolean;

  // Session State
  session: UserSession | null;

  // UI State
  lang: Language;
  activeTab: 'myCase' | 'dashboard' | 'faq' | 'ai';
  showAdmin: boolean;
  bgMode: 'image' | 'simple';
  bgImage: string;

  // Filter State
  filters: FilterState;

  // Actions
  setLang: (lang: Language) => void;
  setActiveTab: (tab: 'myCase' | 'dashboard' | 'faq' | 'ai') => void;
  setShowAdmin: (show: boolean) => void;
  setBgMode: (mode: 'image' | 'simple') => void;
  setBgImage: (img: string) => void;
  setSession: (session: UserSession | null) => void;
  setUserCase: (userCase: CitizenshipCase | undefined) => void;
  setFilters: (filters: Partial<FilterState>) => void;
  
  // Logic
  refreshData: (silent?: boolean) => Promise<void>;
  updateUserCaseInList: (updatedCase: CitizenshipCase) => void;
  
  // Computed (Getters)
  getFilteredCases: () => CitizenshipCase[];
  getGhostCount: () => number;
}

// Initial Filter State
const initialFilters: FilterState = {
  country: 'All',
  month: 'All',
  year: 'All',
  type: 'All',
  status: 'All',
  search: '',
  viewGhosts: false
};

// Helper for Browser Language Detection
const detectLanguage = (): Language => {
  try {
    const browserLang = navigator.language.split('-')[0];
    if (['es', 'en', 'de', 'it', 'pt'].includes(browserLang)) {
      return browserLang as Language;
    }
  } catch (e) {}
  return 'en';
};

export const useAppStore = create<AppState>((set, get) => ({
  // Initial Data State
  allCases: [],
  userCase: undefined,
  isLoading: false,
  isDataLoading: false,
  fetchError: null,
  isMaintenance: false,

  // Initial Session State
  session: null,

  // Initial UI State
  lang: detectLanguage(),
  activeTab: 'myCase',
  showAdmin: false,
  bgMode: (localStorage.getItem('de_tracker_bg_mode') as 'image' | 'simple') || 'image',
  bgImage: '', // Will be set by App.tsx logic or randomizer

  // Initial Filters
  filters: initialFilters,

  // Actions implementation
  setLang: (lang) => set({ lang }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setShowAdmin: (showAdmin) => set({ showAdmin }),
  setBgMode: (bgMode) => {
      localStorage.setItem('de_tracker_bg_mode', bgMode);
      set({ bgMode });
  },
  setBgImage: (bgImage) => set({ bgImage }),
  setSession: (session) => set({ session }),
  setUserCase: (userCase) => set({ userCase }),
  setFilters: (newFilters) => set((state) => ({ 
      filters: { ...state.filters, ...newFilters } 
  })),

  refreshData: async (silent = false) => {
    if (!silent) set({ isDataLoading: true });
    
    try {
        const loadedCases = await fetchCases();
        const config = await fetchGlobalConfig();
        const error = getLastFetchError();
        
        let maintenance = config.maintenanceMode;
        // Auto-maintenance safety
        if (loadedCases.length < 790) maintenance = true;

        set({ 
            allCases: loadedCases, 
            isMaintenance: maintenance,
            fetchError: error,
            isDataLoading: false
        });

        // If logged in, refresh specific user data to get PII
        const { session } = get();
        if (session) {
            const mine = await fetchCaseByEmail(session.email);
            if (mine) set({ userCase: mine });
        }

    } catch (e) {
        console.error("Store Refresh Error", e);
        set({ isDataLoading: false, fetchError: "Failed to refresh data" });
    }
  },

  updateUserCaseInList: (updatedCase) => {
      set((state) => {
          const idx = state.allCases.findIndex(c => c.id === updatedCase.id);
          let newCases = [...state.allCases];
          if (idx >= 0) {
              newCases[idx] = updatedCase;
          } else {
              newCases.push(updatedCase);
          }
          
          // Also update userCase and session name if changed
          const newSession = state.session ? { ...state.session, fantasyName: updatedCase.fantasyName } : null;
          
          return {
              allCases: newCases,
              userCase: updatedCase,
              session: newSession
          };
      });
  },

  // Selectors / Getters
  getGhostCount: () => {
      return get().allCases.filter(c => isGhostCase(c)).length;
  },

  getFilteredCases: () => {
      const { allCases, filters } = get();
      const { country, month, year, type, status, search, viewGhosts } = filters;

      let filtered;

      if (viewGhosts) {
          filtered = allCases.filter(c => isGhostCase(c));
      } else {
          filtered = filterActiveCases(allCases);
      }

      if (country !== 'All') filtered = filtered.filter(c => c.countryOfApplication === country);
      if (type !== 'All') filtered = filtered.filter(c => c.caseType === type);
      if (status !== 'All') filtered = filtered.filter(c => c.status === status);
      
      if (month !== 'All') {
        filtered = filtered.filter(c => {
          const d = new Date(c.submissionDate);
          return (d.getMonth() + 1).toString() === month;
        });
      }
      
      if (year !== 'All') {
        filtered = filtered.filter(c => {
          const d = new Date(c.submissionDate);
          return d.getFullYear().toString() === year;
        });
      }

      if (search) {
          const term = search.toLowerCase();
          filtered = filtered.filter(c => 
              c.fantasyName.toLowerCase().includes(term) ||
              c.countryOfApplication.toLowerCase().includes(term)
          );
      }

      return filtered;
  }
}));