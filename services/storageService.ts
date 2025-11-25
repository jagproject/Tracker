
import { CitizenshipCase, CaseType, CaseStatus, AuditLogEntry } from "../types";
import { supabase, isSupabaseEnabled } from "./authService";
import { RealtimeChannel } from '@supabase/supabase-js';

const STORAGE_KEY = 'de_citizenship_cases';
const LOGS_KEY = 'de_citizenship_audit_logs';
const CONFIG_KEY = 'de_citizenship_config';
const DB_TABLE = 'cases';

export interface AppConfig {
    maintenanceMode: boolean;
}

// Helper to generate mock data if empty
const generateMockData = (): CitizenshipCase[] => {
  const mockCases: CitizenshipCase[] = [
    {
      id: '1',
      email: 'mock1@example.com',
      fantasyName: 'Aguila Dorada',
      countryOfApplication: 'Argentina',
      consulate: 'Buenos Aires',
      caseType: CaseType.STAG_5,
      submissionDate: '2024-03-15',
      protocolDate: '2024-06-20',
      status: CaseStatus.PROTOCOL_RECEIVED,
      lastUpdated: '2024-06-20',
      documents: ["Application Form (Antrag)", "Birth Certificate (Applicant)"],
      notes: "Sent via DHL. Arrived in 4 days."
    },
    {
      id: '2',
      email: 'mock2@example.com',
      fantasyName: 'Bavarian Lion',
      countryOfApplication: 'United States',
      consulate: 'New York',
      caseType: CaseType.ART_116,
      submissionDate: '2024-01-10',
      protocolDate: '2024-04-15',
      approvalDate: '2025-01-01',
      status: CaseStatus.APPROVED,
      lastUpdated: '2025-01-01',
      documents: ["Application Form (Antrag)", "Proof of Loss of Citizenship"],
      notes: "Straightforward case."
    },
    {
      id: '3',
      email: 'mock3@example.com',
      fantasyName: 'Río Danubio',
      countryOfApplication: 'Israel',
      consulate: 'Tel Aviv',
      caseType: CaseType.STAG_15,
      submissionDate: '2025-02-05',
      status: CaseStatus.SUBMITTED,
      lastUpdated: '2025-02-05',
    },
     {
      id: '4',
      email: 'mock4@example.com',
      fantasyName: 'Forest Walker',
      countryOfApplication: 'Brazil',
      consulate: 'Sao Paulo',
      caseType: CaseType.STAG_5,
      submissionDate: '2024-08-10',
      protocolDate: '2025-01-01',
      status: CaseStatus.PROTOCOL_RECEIVED,
      lastUpdated: '2025-01-01',
      notes: "Had to translate documents twice because of a typo."
    }
  ];
  return mockCases;
};

// --- READ OPERATIONS ---

export const fetchCases = async (): Promise<CitizenshipCase[]> => {
  // 1. Try Supabase
  if (supabase) {
    try {
        const { data, error } = await supabase.from(DB_TABLE).select('*');
        if (error) {
            console.error("Supabase Error:", error.message);
            throw error;
        }
        if (data) {
            return data as CitizenshipCase[];
        }
    } catch (e) {
        console.warn("Supabase fetch failed. Ensure table 'cases' exists.", e);
        // If Supabase is configured but fails, we might return empty or local depending on strategy.
        // For now, let's fall back to local to prevent crash.
    }
  }

  // 2. Fallback to LocalStorage
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    // Only generate mocks if Supabase is NOT enabled. 
    // If Supabase IS enabled but returned no data (or error), we probably want to see "No cases" rather than fake data.
    if (!isSupabaseEnabled()) {
        const mocks = generateMockData();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(mocks));
        return mocks;
    }
    return [];
  }
  return JSON.parse(stored);
};

export const fetchCaseByEmail = async (email: string): Promise<CitizenshipCase | undefined> => {
    const searchEmail = email.trim().toLowerCase();
    
    // 1. Try Supabase
    if (supabase) {
        const { data } = await supabase.from(DB_TABLE).select('*').eq('email', searchEmail).maybeSingle();
        if (data) return data as CitizenshipCase;
    }

    // 2. Fallback Local
    const cases = await fetchCases(); 
    return cases.find(c => c.email.trim().toLowerCase() === searchEmail);
};

export const fetchCaseByFantasyName = async (name: string): Promise<CitizenshipCase | undefined> => {
    const searchName = name.trim().toLowerCase();

    // 1. Try Supabase
    if (supabase) {
        // Note: ilike is case-insensitive matching
        const { data } = await supabase.from(DB_TABLE).select('*').ilike('fantasyName', searchName).maybeSingle();
        if (data) return data as CitizenshipCase;
    }

    // 2. Fallback Local
    const cases = await fetchCases();
    return cases.find(c => c.fantasyName.trim().toLowerCase() === searchName);
};

// --- WRITE OPERATIONS ---

export const upsertCase = async (newCase: CitizenshipCase) => {
  // Strictly normalize the input email
  const normalizedNewEmail = newCase.email.trim().toLowerCase();
  const caseToSave = { ...newCase, email: normalizedNewEmail };

  // 1. Try Supabase
  if (supabase) {
      const { error } = await supabase.from(DB_TABLE).upsert(caseToSave);
      if (error) console.error("Supabase Upsert Error:", error);
  }

  // 2. Always update LocalStorage (for offline redundancy or current session speed)
  // Note: We need to fetch local first to merge properly in local context
  const stored = localStorage.getItem(STORAGE_KEY);
  let cases: CitizenshipCase[] = stored ? JSON.parse(stored) : [];
  
  const index = cases.findIndex(c => c.id === caseToSave.id || c.email === normalizedNewEmail);
  if (index >= 0) {
    cases[index] = { ...cases[index], ...caseToSave }; 
  } else {
    cases.push(caseToSave);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
};

export const deleteCase = async (id: string) => {
  // 1. Try Supabase
  if (supabase) {
      await supabase.from(DB_TABLE).delete().eq('id', id);
  }

  // 2. Update Local
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
      const cases: CitizenshipCase[] = JSON.parse(stored);
      const filteredCases = cases.filter(c => c.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredCases));
  }
};

export const importCases = async (newCases: CitizenshipCase[]) => {
  const processedCases = newCases.map(c => ({
      ...c,
      id: c.id || crypto.randomUUID(),
      lastUpdated: c.lastUpdated || new Date().toISOString(),
      email: c.email ? c.email.trim().toLowerCase() : `unclaimed_${c.id || crypto.randomUUID()}@tracker.local`
  }));

  // 1. Try Supabase (Bulk Insert/Upsert)
  if (supabase) {
      const { error } = await supabase.from(DB_TABLE).upsert(processedCases);
      if (error) console.error("Bulk Import Error:", error);
  }

  // 2. Update Local
  const stored = localStorage.getItem(STORAGE_KEY);
  let currentCases: CitizenshipCase[] = stored ? JSON.parse(stored) : [];

  processedCases.forEach(imported => {
     const existingIndex = currentCases.findIndex(c => c.email === imported.email);
     if (existingIndex >= 0) {
         currentCases[existingIndex] = { ...currentCases[existingIndex], ...imported };
     } else {
         currentCases.push(imported);
     }
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(currentCases));
};

export const clearAllData = async () => {
    // 1. Try Supabase
    if (supabase) {
        await supabase.from(DB_TABLE).delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all not matching impossible ID
    }

    // 2. Local
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([])); 
};

// --- REALTIME SUBSCRIPTIONS ---

export const subscribeToCases = (onUpdate: () => void): RealtimeChannel | null => {
  if (supabase) {
      return supabase
          .channel('public:cases')
          .on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLE }, (payload) => {
              onUpdate();
          })
          .subscribe();
  }
  return null;
};

// --- UTILS ---

export const isCaseUnclaimed = (c: CitizenshipCase): boolean => {
    return c.email.startsWith('unclaimed_');
};

export const claimCase = async (originalCase: CitizenshipCase, newEmail: string): Promise<CitizenshipCase> => {
    const cleanEmail = newEmail.trim().toLowerCase();
    
    const updatedCase = {
        ...originalCase,
        email: cleanEmail,
        lastUpdated: new Date().toISOString()
    };

    await upsertCase(updatedCase);
    return updatedCase;
};


// --- Audit Logs (Keep Local for now to avoid DB spam, or move to DB if preferred) ---

export const getAuditLogs = (): AuditLogEntry[] => {
  const stored = localStorage.getItem(LOGS_KEY);
  return stored ? JSON.parse(stored) : [];
};

export const addAuditLog = (action: string, details: string, user: string = 'System') => {
  const logs = getAuditLogs();
  const newLog: AuditLogEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action,
    details,
    user
  };
  const updatedLogs = [newLog, ...logs].slice(0, 100);
  localStorage.setItem(LOGS_KEY, JSON.stringify(updatedLogs));
};

// --- App Configuration ---

export const getAppConfig = (): AppConfig => {
    const stored = localStorage.getItem(CONFIG_KEY);
    return stored ? JSON.parse(stored) : { maintenanceMode: false };
};

export const setMaintenanceMode = (enabled: boolean) => {
    const config = getAppConfig();
    config.maintenanceMode = enabled;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
};
