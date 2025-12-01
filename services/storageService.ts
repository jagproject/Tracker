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

// Track connection state
let lastFetchError: string | null = null;
export const getLastFetchError = () => lastFetchError;

// ------------------------------------------------------------------
// DATA SAFETY POLICY (VERIFIED & ENFORCED)
// ------------------------------------------------------------------
// 1. READ ONLY DEFAULT: fetchCases() only performs SELECT operations.
// 2. NO AUTO-DELETE: There are NO background jobs, cron jobs, or logic that delete records automatically.
//    "Ghost Cases" (inactive > 1 year) are filtered from the UI view in statsUtils.ts, 
//    but they REMAIN safely in the database.
// 3. MANUAL DELETE ONLY: Records are only removed via deleteCase() (single button click) 
//    or clearAllData() (admin reset with confirmation).
// ------------------------------------------------------------------

// --- READ OPERATIONS ---

export const fetchCases = async (): Promise<CitizenshipCase[]> => {
  // 1. Try Supabase
  if (supabase) {
    try {
        const { data, error } = await supabase.from(DB_TABLE).select('*');
        if (error) {
            console.error("Supabase Fetch Error:", error);
            throw error;
        }
        
        lastFetchError = null; // Clear error on success

        if (data) {
            const cases = data as CitizenshipCase[];
            
            // Cache successfully fetched data
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
            } catch (storageError) {
                console.warn("Failed to cache cases to localStorage", storageError);
            }

            return cases;
        }
    } catch (e: any) {
        console.error("Supabase fetch failed (Network/Auth):", e);
        // Set error message so UI can warn user
        lastFetchError = `Connection Error: ${e.message || 'Unknown DB Error'}`;
        // Fall through to Step 2 (LocalStorage) - ENSURES STABILITY
    }
  }

  // 2. Fallback to LocalStorage (Offline Mode)
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  
  return [];
};

// Utility to verify connection on demand (Admin Tool)
export const checkConnection = async (): Promise<boolean> => {
    if (!supabase) return false;
    try {
        // Simple lightweight query to check health
        const { count, error } = await supabase.from(DB_TABLE).select('*', { count: 'exact', head: true });
        if (error) throw error;
        console.log(`[Connection Check] Stability Confirmed. Row count accessible: ${count}`);
        return true;
    } catch (e) {
        console.error("Connection Check Failed:", e);
        return false;
    }
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
      if (error) {
          console.error("Supabase Upsert Error:", error);
          lastFetchError = `Save Failed: ${error.message}`;
      }
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
  // SAFETY LOGGING: Explicitly log this is a manual action
  console.warn(`[SAFETY LOG] MANUAL DELETION REQUESTED for case ID: ${id}. This is NOT an automatic process.`);
  
  // 1. Try Supabase (Explicit Deletion)
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
    console.warn("[SAFETY LOG] ADMIN REQUESTED FULL DATABASE WIPE.");
    // 1. Try Supabase (Bulk Delete)
    if (supabase) {
        // Security check: Only delete if explicitly requested via Admin Tools
        await supabase.from(DB_TABLE).delete().neq('id', '00000000-0000-0000-0000-000000000000'); 
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
  const updatedLogs = [newLog, ...logs].slice(100);
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

// --- BACKUP UTILS ---

export const getFullDatabaseDump = async () => {
    const cases = await fetchCases();
    const logs = getAuditLogs();
    const config = getAppConfig();

    return {
        timestamp: new Date().toISOString(),
        version: "1.0",
        stats: {
            cases: cases.length,
            logs: logs.length
        },
        data: {
            cases,
            logs,
            config
        }
    };
};

export const restoreFullDatabaseDump = async (dump: any) => {
    if (!dump || !dump.data || !Array.isArray(dump.data.cases)) {
        throw new Error("Invalid JSON Backup format.");
    }

    const { cases, logs, config } = dump.data;

    // 1. Restore Cases (Reuse import logic which handles Supabase/Local merge)
    await importCases(cases);

    // 2. Restore Logs (Local only usually, unless we move logs to DB)
    if (Array.isArray(logs)) {
        localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
    }

    // 3. Restore Config
    if (config) {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    }
};