import { CitizenshipCase, CaseType, CaseStatus, AuditLogEntry } from "../types";
import { supabase, isSupabaseEnabled } from "./authService";
import { RealtimeChannel } from '@supabase/supabase-js';

const STORAGE_KEY = 'de_citizenship_cases';
const LOGS_KEY = 'de_citizenship_audit_logs';
const CONFIG_KEY = 'de_citizenship_config';
const DB_TABLE = 'cases';

// Special ID for storing global app configuration in the main table
const GLOBAL_CONFIG_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// Define public columns to fetch for general stats (EXCLUDING EMAIL for privacy)
// Base columns that exist in all versions of the schema
const PUBLIC_COLUMNS_BASE = [
    'id', 'fantasyName', 'countryOfApplication', 'consulate', 'caseType', 
    'status', 'submissionDate', 'protocolDate', 'docsRequestDate', 
    'approvalDate', 'closedDate', 'lastUpdated', 'notes', 
    'notifySameDateSubmission', 'notifySameMonthUrkunde', 
    'notifySubmissionCohortUpdates', 'notifyProtocolCohortUpdates'
];

// Current schema includes soft delete support
const PUBLIC_COLUMNS = [...PUBLIC_COLUMNS_BASE, 'deletedAt'].join(',');
// Legacy schema support (fallback)
const PUBLIC_COLUMNS_LEGACY = PUBLIC_COLUMNS_BASE.join(',');

export interface AppConfig {
    maintenanceMode: boolean;
}

// Track connection state
let lastFetchError: string | null = null;
export const getLastFetchError = () => lastFetchError;

// Helper to extract readable error message
const getErrorMessage = (error: any): string => {
    if (!error) return 'Unknown Error';
    
    // Handle standard Error objects (e.g. TypeError: Failed to fetch)
    if (error instanceof Error) return error.message;
    
    // Handle string errors
    if (typeof error === 'string') return error;

    // Handle Supabase/Postgrest error objects
    if (typeof error === 'object') {
        // PostgrestError usually has a 'message' property
        if (error.message) return String(error.message);
        if (error.error_description) return String(error.error_description);
        if (error.msg) return String(error.msg);
        
        // Try to stringify if no known message property
        try {
            const json = JSON.stringify(error);
            // Avoid returning empty object string if possible
            if (json !== '{}') return json;
        } catch {
            return 'Object Error (Non-serializable)';
        }
    }
    
    // Fallback
    const str = String(error);
    if (str === '[object Object]') {
        try {
            return JSON.stringify(error);
        } catch {
            return 'Unknown Object Error';
        }
    }
    return str;
};

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

        const { error } = await supabase.from(DB_TABLE).upsert(configRecord, { onConflict: 'id' });
        if (error) console.error("Failed to push global config:", getErrorMessage(error));
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
        // Use specific columns to avoid pulling PII (email) in public feed
        let query = supabase.from(DB_TABLE).select(PUBLIC_COLUMNS);
        
        // Soft Delete Filtering
        if (!includeDeleted) {
            query = query.is('deletedAt', null);
        }

        const { data, error } = await query;

        if (error) {
            const errorMsg = getErrorMessage(error);
            
            // Handle specific schema error (missing deletedAt column) gracefully
            if (error.code === '42703' || errorMsg.includes("deletedAt") || errorMsg.includes("does not exist")) {
                 console.warn("[SoftDelete] 'deletedAt' column missing in DB. Fetching all records (Legacy Mode).");
                 const retry = await supabase.from(DB_TABLE).select(PUBLIC_COLUMNS_LEGACY);
                 
                 if (retry.error) {
                     console.warn("Supabase Legacy Fetch Warning:", getErrorMessage(retry.error));
                     lastFetchError = `API Error: ${getErrorMessage(retry.error)}`;
                 } else if (retry.data) {
                    lastFetchError = null; 
                    const cases = filterSystemRecords(mapToCases(retry.data));
                    // Cache active
                    if (!includeDeleted) {
                        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cases)); } catch (e) {}
                    }
                    return cases;
                 }
            } else {
                 console.warn(`Supabase API Error: ${errorMsg}`);
                 lastFetchError = `API Error: ${errorMsg}`;
                 // Do not throw here, let it fall through to local storage
            }
        } else if (data) {
            lastFetchError = null; // Clear error on success
            const cases = filterSystemRecords(mapToCases(data));
            // Cache active
            if (!includeDeleted) {
                try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cases)); } catch (e) {}
            }
            return cases;
        }
    } catch (e: any) {
        const msg = getErrorMessage(e);
        // Only log network errors as warnings to avoid cluttering console in offline mode
        console.warn(`Supabase Network Error: ${msg}`);
        lastFetchError = `Connection Error: ${msg}`;
    }
  }

  // 2. Fallback to LocalStorage (Offline Mode or API Error)
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
        const localCases: CitizenshipCase[] = JSON.parse(stored);
        if (!includeDeleted) {
            return localCases.filter(c => !c.deletedAt);
        }
        return localCases;
    } catch(err) {
        console.error("Error parsing local cases", err);
    }
  }
  
  return [];
};

// Helper to map DB result (missing email) to CitizenshipCase type
const mapToCases = (data: any[]): CitizenshipCase[] => {
    return data.map(c => ({
        ...c,
        email: c.email || '' // Default empty email for public data
    })) as CitizenshipCase[];
};

// Helper to remove the system config row from the main list
const filterSystemRecords = (cases: CitizenshipCase[]) => {
    return cases.filter(c => c.id !== GLOBAL_CONFIG_ID);
};

export const fetchDeletedCases = async (): Promise<CitizenshipCase[]> => {
    if (supabase) {
        try {
            // Admin function: Try to fetch everything including emails if possible, but minimal cols is safer
            const { data, error } = await supabase.from(DB_TABLE).select(PUBLIC_COLUMNS).not('deletedAt', 'is', null);
            
            if (error) {
                const errorMsg = getErrorMessage(error);
                if (error.code === '42703' || errorMsg.includes("deletedAt")) {
                     console.warn("Recycle bin unavailable: 'deletedAt' column missing.");
                     return [];
                }
                return [];
            }

            if (data) return filterSystemRecords(mapToCases(data));
        } catch (e) {
            return [];
        }
    }
    // Fallback Local
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            const localCases: CitizenshipCase[] = JSON.parse(stored);
            return localCases.filter(c => !!c.deletedAt);
        } catch(e) { return []; }
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
        console.error("Connection Check Failed:", getErrorMessage(e));
        return false;
    }
};

export const fetchCaseByEmail = async (email: string): Promise<CitizenshipCase | undefined> => {
    const searchEmail = email.trim().toLowerCase();
    
    if (supabase) {
        try {
            // Select '*' here because the user needs their own email/full data. 
            // RLS should allow this for the owner.
            const { data, error } = await supabase.from(DB_TABLE).select('*').eq('email', searchEmail).is('deletedAt', null).maybeSingle();
            if (!error && data) return data as CitizenshipCase;
        } catch (e) {}
        
        // Fallback if deletedAt missing or other error
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
             // Public lookup: Use public columns only
             const { data, error } = await supabase.from(DB_TABLE).select(PUBLIC_COLUMNS).ilike('fantasyName', searchName).is('deletedAt', null).maybeSingle();
             if (!error && data) return { ...data, email: '' } as CitizenshipCase;
             
             // FALLBACK for Legacy DB (Missing deletedAt)
             if (error) {
                 const errorMsg = getErrorMessage(error);
                 if (error.code === '42703' || errorMsg.includes("deletedAt")) {
                     const retry = await supabase.from(DB_TABLE).select(PUBLIC_COLUMNS_LEGACY).ilike('fantasyName', searchName).maybeSingle();
                     if (!retry.error && retry.data) return { ...retry.data, email: '' } as CitizenshipCase;
                 }
             }
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
      const { error } = await supabase.from(DB_TABLE).upsert(caseToSave, { onConflict: 'id' });
      if (error) {
          const errorMsg = getErrorMessage(error);
          console.error("Supabase Upsert Error:", errorMsg);
          lastFetchError = `Save Failed: ${errorMsg}`;
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
      if (error) {
           const errorMsg = getErrorMessage(error);
           if (error.code === '42703' || errorMsg.includes("deletedAt")) {
               alert("⚠️ DB Schema Error: Soft Delete column missing. Action aborted.");
               return;
           }
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

export const deleteAllCases = async () => {
    console.warn("[SAFETY LOG] EXECUTION OF MASS DELETE.");
    
    if (supabase) {
        // We exclude the System Config to avoid breaking app settings completely, though prompt asked for "delete database"
        const { error } = await supabase.from(DB_TABLE).delete().neq('id', GLOBAL_CONFIG_ID);
        if (error) {
             const errorMsg = getErrorMessage(error);
             console.error("Failed to wipe DB", errorMsg);
             throw error;
        }
    }
    
    // Wipe local storage
    localStorage.setItem(STORAGE_KEY, '[]');
    localStorage.setItem(LOGS_KEY, '[]');
};

export const importCases = async (newCases: CitizenshipCase[]) => {
  // 0. Pre-process: Deduplicate input based on email to prevent unique constraint errors within the batch itself.
  const uniqueInputMap = new Map<string, CitizenshipCase>();
  const casesWithoutEmail: CitizenshipCase[] = [];

  for (const c of newCases) {
      // Validate and clean email
      if (c.email && !c.email.startsWith('imported_') && !c.email.startsWith('unclaimed_') && c.email.includes('@')) {
          const clean = c.email.trim().toLowerCase();
          c.email = clean;
          // Last one wins if there are duplicates in the import file
          uniqueInputMap.set(clean, c);
      } else {
          // If it's a generated ID email or empty, we treat it as unique enough (will generate new UUID email if empty)
          casesWithoutEmail.push(c);
      }
  }
  
  // Reconstruct list with unique emails from the input
  let processedInput = [...Array.from(uniqueInputMap.values()), ...casesWithoutEmail];

  // 1. RECONCILIATION: Check for existing emails in the Database
  if (supabase) {
      const emailsToCheck = processedInput
          .map(c => c.email)
          .filter(e => e && !e.startsWith('imported_') && !e.startsWith('unclaimed_')) as string[];
      
      if (emailsToCheck.length > 0) {
          const uniqueEmails = Array.from(new Set(emailsToCheck));
          const BATCH_CHECK = 50; // Reduce batch size for safety
          const emailToIdMap = new Map<string, string>();

          for(let i=0; i<uniqueEmails.length; i+=BATCH_CHECK) {
               const batch = uniqueEmails.slice(i, i+BATCH_CHECK);
               // IMPORTANT: This select requires RLS to allow reading other users' emails OR being admin.
               // Standard users running import will likely fail here if RLS is strict.
               const { data, error } = await supabase
                  .from(DB_TABLE)
                  .select('id, email')
                  .in('email', batch);
               
               if (error) console.error("Reconciliation Error (RLS might block this):", getErrorMessage(error));

               if (data) {
                   data.forEach((row: any) => {
                       if(row.email) emailToIdMap.set(row.email.trim().toLowerCase(), row.id);
                   });
               }
          }

          // Assign existing IDs to the new cases so upsert acts as UPDATE
          processedInput.forEach(c => {
              if (c.email && emailToIdMap.has(c.email)) {
                  // Keep the existing ID to force an update instead of insert
                  c.id = emailToIdMap.get(c.email)!;
              }
          });
      }
  }

  // 2. Prepare Payload
  const finalPayload = processedInput.map(c => ({
      ...c,
      id: c.id || crypto.randomUUID(), // Use existing ID if found, else new UUID
      lastUpdated: c.lastUpdated || new Date().toISOString(),
      email: c.email ? c.email.trim().toLowerCase() : `imported_${crypto.randomUUID()}@tracker.local`
  }));

  // 3. Upsert to Supabase
  if (supabase) {
      const BATCH_SIZE = 50;
      for (let i = 0; i < finalPayload.length; i += BATCH_SIZE) {
          const batch = finalPayload.slice(i, i + BATCH_SIZE);
          // Explicitly state onConflict id to ensure UPSERT behavior
          const { error } = await supabase.from(DB_TABLE).upsert(batch, { onConflict: 'id' });
          if (error) {
              const errorMsg = getErrorMessage(error);
              console.error(`Bulk Import Batch ${i} Error:`, errorMsg);
              if (errorMsg.includes('cases_email_key') || errorMsg.includes('unique constraint')) {
                  throw new Error(`Import Error: Duplicate email found in batch. Please check for duplicates.`);
              }
              throw error;
          }
      }
  }
  
  // 4. Update local cache (Merge Smartly)
  const stored = localStorage.getItem(STORAGE_KEY);
  let current = stored ? JSON.parse(stored) : [];
  
  const processedMap = new Map(finalPayload.map(c => [c.id, c]));
  
  // Replace existing in local
  current = current.map((c: CitizenshipCase) => processedMap.has(c.id) ? processedMap.get(c.id) : c);
  
  // Add new ones to local
  finalPayload.forEach(c => {
      if (!current.some((existing: CitizenshipCase) => existing.id === c.id)) {
          current.push(c);
      }
  });

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
        
        // Handle Email: If empty in CSV, generate placeholder. If present, keep it for de-duplication logic in importCases.
        const rawEmail = emailIdx > -1 && cols[emailIdx] ? cols[emailIdx].trim() : '';

        const c: CitizenshipCase = {
            id: '', // Empty ID initially, importCases will reconcile or generate
            fantasyName: name,
            email: rawEmail, // Pass empty string if missing, importCases handles generation
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
    // Admin function - tries to get deleted cases too. 
    // Requires relaxed RLS or admin access for complete dump.
    const cases = await fetchCases(true); 
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