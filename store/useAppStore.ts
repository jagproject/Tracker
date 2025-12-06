import { create } from 'zustand';
import { CitizenshipCase, UserSession, Language, CaseType, CaseStatus } from '../types';
import { fetchCases, fetchCaseByEmail, fetchGlobalConfig, getLastFetchError, upsertCase, deleteCase, restoreCase, hardDeleteCase } from '../services/storageService';
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

export interface Notification {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
}

interface AppState {
  // Data State
  allCases: CitizenshipCase[];
  userCase: CitizenshipCase | undefined;
  isLoading: boolean;
  isDataLoading: boolean; 
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
  notifications: Notification[];

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
  
  // Optimistic Actions
  optimisticUpdateCase: (updatedCase: CitizenshipCase) => Promise<void>;
  optimisticDeleteCase: (id: string) => Promise<void>;
  optimisticRestoreCase: (id: string) => Promise<void>;
  optimisticHardDeleteCase: (id: string) => Promise<void>;
  
  // Notification Management
  addNotification: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  removeNotification: (id: string) => void;

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
  bgImage: '',
  notifications: [],

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

  addNotification: (message, type = 'info') => {
      const id = crypto.randomUUID();
      set(state => ({ notifications: [...state.notifications, { id, message, type }] }));
      setTimeout(() => get().removeNotification(id), 5000);
  },

  removeNotification: (id) => {
      set(state => ({ notifications: state.notifications.filter(n => n.id !== id) }));
  },

  refreshData: async (silent = false) => {
    if (!silent) set({ isDataLoading: true });
    
    try {
        const loadedCases = await fetchCases();
        const config = await fetchGlobalConfig();
        const error = getLastFetchError();
        
        let maintenance = config.maintenanceMode;
        if (loadedCases.length < 790) maintenance = true;

        set({ 
            allCases: loadedCases, 
            isMaintenance: maintenance,
            fetchError: error,
            isDataLoading: false
        });

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

  optimisticUpdateCase: async (updatedCase) => {
      const prevState = get().allCases;
      
      // 1. Optimistic Update
      set((state) => {
          const idx = state.allCases.findIndex(c => c.id === updatedCase.id);
          let newCases = [...state.allCases];
          if (idx >= 0) newCases[idx] = updatedCase;
          else newCases.push(updatedCase);
          
          const newSession = state.session ? { ...state.session, fantasyName: updatedCase.fantasyName } : null;
          return { allCases: newCases, userCase: updatedCase, session: newSession };
      });

      // 2. Async Call
      try {
          const { success, error, isOffline } = await upsertCase(updatedCase);
          if (!success && !isOffline) {
              // Rollback on critical failure
              set({ allCases: prevState });
              get().addNotification(`Failed to save: ${error}`, 'error');
          } else if (isOffline) {
              get().addNotification("Saved offline. Will sync when online.", 'warning');
          } else {
              // Success (Silent or subtle)
              // get().addNotification("Saved successfully", 'success');
          }
      } catch (e) {
          set({ allCases: prevState });
          get().addNotification("Unexpected save error.", 'error');
      }
  },

  optimisticDeleteCase: async (id) => {
      const prevState = get().allCases;
      const timestamp = new Date().toISOString();

      // 1. Optimistic Update (Filter out or mark deleted)
      set((state) => ({
          allCases: state.allCases.filter(c => c.id !== id) // Remove from active list
      }));

      // 2. Async Call
      try {
          const { success, error } = await deleteCase(id);
          if (!success) {
              set({ allCases: prevState }); // Rollback
              get().addNotification(`Delete failed: ${error}`, 'error');
          } else {
              get().addNotification("Case moved to Recycle Bin", 'success');
          }
      } catch (e) {
          set({ allCases: prevState });
          get().addNotification("Delete error", 'error');
      }
  },

  optimisticRestoreCase: async (id) => {
      // Restore implies moving from Deleted List to Active List.
      // Since `allCases` in store usually only holds active cases, we might need to re-fetch or assume we have the object available in a separate "deleted" list context.
      // But for simple "Refresh", we can just call restore and then refresh.
      // To be purely optimistic, we'd need the deleted object passed in.
      
      await restoreCase(id);
      get().refreshData(true); // Lazy refresh for now as restore is rare admin action
      get().addNotification("Case restored", 'success');
  },

  optimisticHardDeleteCase: async (id) => {
      await hardDeleteCase(id);
      get().refreshData(true);
      get().addNotification("Case permanently deleted", 'info');
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