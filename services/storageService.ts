import { CitizenshipCase, CaseType, CaseStatus, AuditLogEntry } from "../types";
import { supabase, isSupabaseEnabled } from "./authService";
import { RealtimeChannel } from '@supabase/supabase-js';

const STORAGE_KEY = 'de_citizenship_cases';
const LOGS_KEY = 'de_citizenship_audit_logs';
const CONFIG_KEY = 'de_citizenship_config';
const DB_TABLE = 'cases';

// Special ID for storing global app configuration in the main table
const GLOBAL_CONFIG_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

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
// 2. SOFT DELETE IMPLEMENTED: deleteCase() now sets a 'deletedAt' timestamp.
// 3. GLOBAL CONFIG: Maintenance mode is now synced via DB.
// ------------------------------------------------------------------

// --- GLOBAL CONFIGURATION ---

export const fetchGlobalConfig = async (): Promise<AppConfig> => {
    // Default config
    const localConfig = getLocalConfig();

    if (supabase) {
        try {
            const { data, error } = await supabase
                .from(DB_TABLE)
                .select('notes')
                .eq('id', GLOBAL_CONFIG_ID)
                .maybeSingle();

            if (!error && data && data.notes) {
                try {
                    const remoteConfig = JSON.parse(data.notes);
                    // Update local cache to match remote
                    localStorage.setItem(CONFIG_KEY, JSON.stringify(remoteConfig));
                    return remoteConfig;
                } catch (e) {
                    console.error("Error parsing remote config JSON");
                }
            }
        } catch (e) {
            console.warn("Could not fetch global config, using local.");
        }
    }
    return localConfig;
};

export const updateGlobalConfig = async (config: AppConfig) => {
    // 1. Update Local
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));

    // 2. Update Remote
    if (supabase) {
        const configRecord = {
            id: GLOBAL_CONFIG_ID,
            fantasyName: 'SYSTEM_CONFIG',
            email: 'system@tracker.config',
            countryOfApplication: 'Germany',
            caseType: CaseType.STAG_5, // Dummy value
            status: CaseStatus.SUBMITTED, // Dummy value
            submissionDate: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            notes: JSON.stringify(config) // STORE CONFIG HERE
        };

        const { error } = await supabase.from(DB_TABLE).upsert(configRecord);
        if (error) console.error("Failed to push global config:", error);
    }
};

const getLocalConfig = (): AppConfig => {
    const stored = localStorage.getItem(CONFIG_KEY);
    return stored ? JSON.parse(stored) : { maintenanceMode: false };
};

export const getAppConfig = getLocalConfig; // Legacy export for sync usage

// --- READ OPERATIONS ---

export const fetchCases = async (includeDeleted: boolean = false): Promise<CitizenshipCase[]> => {
  // 1. Try Supabase
  if (supabase) {
    try {
        let query = supabase.from(DB_TABLE).select('*');
        
        // Soft Delete Filtering
        if (!includeDeleted) {
            query = query.is('deletedAt', null);
        }

        const { data, error } = await query;

        if (error) {
            if (error.code === '42703' || error.message?.includes("deletedAt")) {
                 console.warn("[SoftDelete] 'deletedAt' column missing in DB. Fetching all records (Legacy Mode).");
                 const retry = await supabase.from(DB_TABLE).select('*');
                 if (retry.data) return filterSystemRecords(retry.data as CitizenshipCase[]);
            }
            console.error("Supabase Fetch Error:", error);
            throw error;
        }
        
        lastFetchError = null; // Clear error on success

        if (data) {
            const cases = filterSystemRecords(data as CitizenshipCase[]);
            // Cache active
            if (!includeDeleted) {
                try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cases)); } catch (e) {}
            }
            return cases;
        }
    } catch (e: any) {
        console.error("Supabase fetch failed (Network/Auth):", e);
        lastFetchError = `Connection Error: ${e.message || 'Unknown DB Error'}`;
    }
  }

  // 2. Fallback to LocalStorage (Offline Mode)
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const localCases: CitizenshipCase[] = JSON.parse(stored);
    if (!includeDeleted) {
        return localCases.filter(c => !c.deletedAt);
    }
    return localCases;
  }
  
  return [];
};

// Helper to remove the system config row from the main list
const filterSystemRecords = (cases: CitizenshipCase[]) => {
    return cases.filter(c => c.id !== GLOBAL_CONFIG_ID);
};

export const fetchDeletedCases = async (): Promise<CitizenshipCase[]> => {
    if (supabase) {
        const { data, error } = await supabase.from(DB_TABLE).select('*').not('deletedAt', 'is', null);
        
        if (error) {
            return [];
        }

        if (data) return filterSystemRecords(data as CitizenshipCase[]);
    }
    // Fallback Local
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        const localCases: CitizenshipCase[] = JSON.parse(stored);
        return localCases.filter(c => !!c.deletedAt);
    }
    return [];
};

// Utility to verify connection on demand (Admin Tool)
export const checkConnection = async (): Promise<boolean> => {
    if (!supabase) return false;
    try {
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
    
    if (supabase) {
        try {
            const { data, error } = await supabase.from(DB_TABLE).select('*').eq('email', searchEmail).is('deletedAt', null).maybeSingle();
            if (!error && data) return data as CitizenshipCase;
        } catch (e) {}
        
        const { data } = await supabase.from(DB_TABLE).select('*').eq('email', searchEmail).maybeSingle();
        if (data) return data as CitizenshipCase;
    }

    const cases = await fetchCases(); 
    return cases.find(c => c.email.trim().toLowerCase() === searchEmail);
};

export const fetchCaseByFantasyName = async (name: string): Promise<CitizenshipCase | undefined> => {
    const searchName = name.trim().toLowerCase();

    if (supabase) {
        try {
             const { data, error } = await supabase.from(DB_TABLE).select('*').ilike('fantasyName', searchName).is('deletedAt', null).maybeSingle();
             if (!error && data) return data as CitizenshipCase;
        } catch(e) {}
    }

    const cases = await fetchCases();
    return cases.find(c => c.fantasyName.trim().toLowerCase() === searchName);
};

// --- WRITE OPERATIONS ---

export const upsertCase = async (newCase: CitizenshipCase) => {
  const normalizedNewEmail = newCase.email.trim().toLowerCase();
  const caseToSave = { ...newCase, email: normalizedNewEmail };

  if (supabase) {
      const { error } = await supabase.from(DB_TABLE).upsert(caseToSave);
      if (error) {
          console.error("Supabase Upsert Error:", error);
          lastFetchError = `Save Failed: ${error.message}`;
      }
  }

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
  console.warn(`[SAFETY LOG] SOFT DELETION for case ID: ${id}. Moving to Recycle Bin.`);
  const timestamp = new Date().toISOString();

  if (supabase) {
      const { error } = await supabase.from(DB_TABLE).update({ deletedAt: timestamp }).eq('id', id);
      if (error && (error.code === '42703' || error.message?.includes("deletedAt"))) {
           alert("⚠️ DB Schema Error: Soft Delete column missing.");
           return;
      }
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
      const cases: CitizenshipCase[] = JSON.parse(stored);
      const updated = cases.map(c => c.id === id ? { ...c, deletedAt: timestamp } : c);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
};

export const restoreCase = async (id: string) => {
    console.warn(`[SAFETY LOG] RESTORING case ID: ${id} from Recycle Bin.`);

    if (supabase) {
        await supabase.from(DB_TABLE).update({ deletedAt: null }).eq('id', id);
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        const cases: CitizenshipCase[] = JSON.parse(stored);
        const updated = cases.map(c => c.id === id ? { ...c, deletedAt: undefined } : c);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
};

export const hardDeleteCase = async (id: string) => {
    console.warn(`[SAFETY LOG] PERMANENT DELETION for case ID: ${id}.`);

    if (supabase) {
        await supabase.from(DB_TABLE).delete().eq('id', id);
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        const cases: CitizenshipCase[] = JSON.parse(stored);
        const filtered = cases.filter(c => c.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    }
};

export const importCases = async (newCases: CitizenshipCase[]) => {
  const processedCases = newCases.map(c => ({
      ...c,
      id: c.id || crypto.randomUUID(),
      lastUpdated: c.lastUpdated || new Date().toISOString(),
      email: c.email ? c.email.trim().toLowerCase() : `imported_${crypto.randomUUID()}@tracker.local`
  }));

  if (supabase) {
      // Chunking to avoid payload limits (Batch size 50)
      const BATCH_SIZE = 50;
      for (let i = 0; i < processedCases.length; i += BATCH_SIZE) {
          const batch = processedCases.slice(i, i + BATCH_SIZE);
          const { error } = await supabase.from(DB_TABLE).upsert(batch);
          if (error) {
              console.error(`Bulk Import Batch ${i} Error:`, error);
              throw error; // Stop if a batch fails to avoid partial state confusion
          }
      }
  }
  
  // Update local cache
  const stored = localStorage.getItem(STORAGE_KEY);
  let current = stored ? JSON.parse(stored) : [];
  current = [...current, ...processedCases];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
};

export const parseAndImportCSV = async (csvText: string) => {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) throw new Error("CSV is empty");

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    
    const findIndex = (keywords: string[]) => headers.findIndex(h => keywords.some(k => h.includes(k)));
    
    // Map headers
    const nameIdx = findIndex(['name', 'fantasy', 'user', 'nombre']);
    const emailIdx = findIndex(['email', 'correo']);
    const countryIdx = findIndex(['country', 'pais', 'país']);
    const typeIdx = findIndex(['type', 'tipo', 'paragraph']);
    const statusIdx = findIndex(['status', 'estado']);
    const subDateIdx = findIndex(['submi', 'envi', 'sent']);
    const protoDateIdx = findIndex(['proto', 'akz', 'number']);
    const appDateIdx = findIndex(['approv', 'urkunde', 'citiz']);

    if (nameIdx === -1) throw new Error("Could not find a 'Name' column in CSV.");

    const newCases: CitizenshipCase[] = [];

    // Helper to safely format date for DB (YYYY-MM-DD)
    const formatDate = (dateStr: string): string | undefined => {
        if (!dateStr || dateStr.trim() === '') return undefined;
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return undefined;
            return d.toISOString().split('T')[0];
        } catch { return undefined; }
    };

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
        if (cols.length < headers.length) continue;

        const name = cols[nameIdx];
        if (!name) continue;

        const subDate = subDateIdx > -1 ? formatDate(cols[subDateIdx]) : new Date().toISOString().split('T')[0];

        const c: CitizenshipCase = {
            id: crypto.randomUUID(),
            fantasyName: name,
            email: emailIdx > -1 && cols[emailIdx] ? cols[emailIdx] : `imported_${crypto.randomUUID()}@tracker.local`,
            countryOfApplication: countryIdx > -1 && cols[countryIdx] ? cols[countryIdx] : 'Unknown',
            caseType: typeIdx > -1 && cols[typeIdx] ? (cols[typeIdx] as CaseType) : CaseType.STAG_5,
            status: statusIdx > -1 && cols[statusIdx] ? (cols[statusIdx] as CaseStatus) : CaseStatus.SUBMITTED,
            submissionDate: subDate as string,
            lastUpdated: new Date().toISOString()
        };

        if (protoDateIdx > -1) {
             const pDate = formatDate(cols[protoDateIdx]);
             if (pDate) c.protocolDate = pDate;
        }
        if (appDateIdx > -1) {
            const aDate = formatDate(cols[appDateIdx]);
            if (aDate) c.approvalDate = aDate;
        }

        newCases.push(c);
    }

    if (newCases.length > 0) {
        await importCases(newCases);
    }
    return newCases.length;
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
    return c.email.startsWith('unclaimed_') || c.email.startsWith('imported_');
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

export const setMaintenanceMode = async (enabled: boolean) => {
    await updateGlobalConfig({ maintenanceMode: enabled });
};

// --- BACKUP UTILS ---

export const getFullDatabaseDump = async () => {
    const cases = await fetchCases(true); // Include deleted for backup
    const logs = getAuditLogs();
    const config = getAppConfig();

    return {
        timestamp: new Date().toISOString(),
        version: "1.2",
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