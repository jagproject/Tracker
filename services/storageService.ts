import { CitizenshipCase, CaseType, CaseStatus, AuditLogEntry } from "../types";
import { supabase, isSupabaseEnabled } from "./authService";
import { RealtimeChannel } from '@supabase/supabase-js';

const STORAGE_KEY = 'de_citizenship_cases';
const LOGS_KEY = 'de_citizenship_audit_logs';
const CONFIG_KEY = 'de_citizenship_config';
const LOCAL_USER_CACHE_KEY = 'de_citizenship_local_cache'; // New separate cache for user data
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

export interface StorageResult {
    success: boolean;
    error: string | null;
    isOffline: boolean;
}

// Track connection state
let lastFetchError: string | null = null;
export const getLastFetchError = () => lastFetchError;

// Helper to extract readable error message
const getErrorMessage = (error: any): string => {
    if (!error) return 'Unknown Error';
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (typeof error === 'object') {
        if (error.message) return String(error.message);
        if (error.error_description) return String(error.error_description);
        if (error.msg) return String(error.msg);
        try {
            const json = JSON.stringify(error);
            if (json !== '{}') return json;
        } catch {
            return 'Object Error (Non-serializable)';
        }
    }
    return String(error);
};

// --- READ OPERATIONS ---

export const fetchGlobalConfig = async (): Promise<AppConfig> => {
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
                    localStorage.setItem(CONFIG_KEY, JSON.stringify(remoteConfig));
                    return remoteConfig;
                } catch (e) {}
            }
        } catch (e) {}
    }
    return localConfig;
};

export const updateGlobalConfig = async (config: AppConfig) => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    if (supabase) {
        const configRecord = {
            id: GLOBAL_CONFIG_ID,
            fantasyName: 'SYSTEM_CONFIG',
            email: 'system@tracker.config',
            countryOfApplication: 'Germany',
            caseType: CaseType.STAG_5,
            status: CaseStatus.SUBMITTED,
            submissionDate: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            notes: JSON.stringify(config)
        };
        await supabase.from(DB_TABLE).upsert(configRecord, { onConflict: 'id' });
    }
};

const getLocalConfig = (): AppConfig => {
    const stored = localStorage.getItem(CONFIG_KEY);
    return stored ? JSON.parse(stored) : { maintenanceMode: false };
};

export const getAppConfig = getLocalConfig;

// Helper: Manage separate local cache for "My Case" to survive public list overwrites
const saveMyCaseLocally = (email: string, caseData: CitizenshipCase) => {
    try {
        const cacheRaw = localStorage.getItem(LOCAL_USER_CACHE_KEY);
        const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
        // Store by email as key
        cache[email.trim().toLowerCase()] = caseData;
        // Also store by ID for reverse lookup during merge
        cache[caseData.id] = caseData;
        localStorage.setItem(LOCAL_USER_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.warn("Failed to save local user cache");
    }
};

const loadMyCaseLocally = (email: string): CitizenshipCase | undefined => {
    try {
        const cacheRaw = localStorage.getItem(LOCAL_USER_CACHE_KEY);
        if (!cacheRaw) return undefined;
        const cache = JSON.parse(cacheRaw);
        return cache[email.trim().toLowerCase()];
    } catch (e) {
        return undefined;
    }
};

// Helper: When fetching public data (which has no emails), preserve any emails we already have locally.
const mergeWithLocalEmails = (remoteCases: CitizenshipCase[]): CitizenshipCase[] => {
    try {
        const emailMap = new Map<string, string>();

        // 1. Gather emails from existing main storage
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const localData = JSON.parse(stored) as CitizenshipCase[];
            localData.forEach(c => {
                if (c.id && c.email) emailMap.set(c.id, c.email);
            });
        }

        // 2. Gather emails from User Cache (Highest Priority)
        try {
            const userCacheRaw = localStorage.getItem(LOCAL_USER_CACHE_KEY);
            if (userCacheRaw) {
                const userCache = JSON.parse(userCacheRaw);
                Object.values(userCache).forEach((c: any) => {
                    if (c.id && c.email) emailMap.set(c.id, c.email);
                });
            }
        } catch(e) {}

        return remoteCases.map(rc => {
            // If remote has an email (rare), keep it. 
            // Otherwise, see if we have it locally.
            const localEmail = emailMap.get(rc.id);
            return {
                ...rc,
                email: rc.email || localEmail || ''
            };
        });
    } catch (e) {
        return remoteCases;
    }
};

export const fetchCases = async (includeDeleted: boolean = false): Promise<CitizenshipCase[]> => {
  if (supabase) {
    try {
        // Explicitly set range to fetch all records (bypass default 100/1000 limit)
        let query = supabase.from(DB_TABLE).select(PUBLIC_COLUMNS).range(0, 9999);
        
        if (!includeDeleted) {
            query = query.is('deletedAt', null);
        }
        const { data, error } = await query;

        if (error) {
            const errorMsg = getErrorMessage(error);
            if (error.code === '42703' || errorMsg.includes("deletedAt") || errorMsg.includes("does not exist")) {
                 console.warn("[SoftDelete] Schema mismatch. Fetching legacy.");
                 const retry = await supabase.from(DB_TABLE).select(PUBLIC_COLUMNS_LEGACY).range(0, 9999);
                 if (retry.data) {
                    lastFetchError = null; 
                    const cases = mergeWithLocalEmails(filterSystemRecords(mapToCases(retry.data)));
                    if (!includeDeleted) localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
                    return cases;
                 }
            }
            lastFetchError = `API Error: ${errorMsg}`;
        } else if (data) {
            lastFetchError = null;
            const cases = mergeWithLocalEmails(filterSystemRecords(mapToCases(data)));
            if (!includeDeleted) localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
            return cases;
        }
    } catch (e: any) {
        lastFetchError = `Connection Error: ${getErrorMessage(e)}`;
    }
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
        const localCases: CitizenshipCase[] = JSON.parse(stored);
        return includeDeleted ? localCases : localCases.filter(c => !c.deletedAt);
    } catch(err) {}
  }
  return [];
};

// Specialized fetch for unclaimed cases (placeholders)
// These need to expose the email field (e.g. imported_...) so they can be claimed.
export const fetchUnclaimedCases = async (): Promise<CitizenshipCase[]> => {
    let results: CitizenshipCase[] = [];
    if (supabase) {
        try {
            // We select * (including email) but ONLY for cases that match the unclaimed pattern.
            // This ensures we don't leak real user emails.
            const { data, error } = await supabase
                .from(DB_TABLE)
                .select('*')
                .or('email.ilike.imported_%,email.ilike.unclaimed_%')
                .limit(500);
            
            if (!error && data) {
                results = mapToCases(data);
            }
        } catch (e) {
            console.warn("Fetch unclaimed failed", e);
        }
    }
    
    // Offline / Local Storage fallback
    if (results.length === 0) {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const localCases: CitizenshipCase[] = JSON.parse(stored);
                results = localCases.filter(c => c.email && (c.email.startsWith('imported_') || c.email.startsWith('unclaimed_')));
            } catch(e) {}
        }
    }
    return results;
};

const mapToCases = (data: any[]): CitizenshipCase[] => {
    return data.map(c => ({
        ...c,
        email: c.email || '' 
    })) as CitizenshipCase[];
};

const filterSystemRecords = (cases: CitizenshipCase[]) => {
    return cases.filter(c => c.id !== GLOBAL_CONFIG_ID);
};

export const fetchDeletedCases = async (): Promise<CitizenshipCase[]> => {
    if (supabase) {
        try {
            const { data, error } = await supabase.from(DB_TABLE).select(PUBLIC_COLUMNS).not('deletedAt', 'is', null).range(0, 9999);
            if (data && !error) return filterSystemRecords(mapToCases(data));
        } catch (e) {}
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            const localCases: CitizenshipCase[] = JSON.parse(stored);
            return localCases.filter(c => !!c.deletedAt);
        } catch(e) {}
    }
    return [];
};

export const checkConnection = async (): Promise<boolean> => {
    if (!supabase) return false;
    try {
        const { count, error } = await supabase.from(DB_TABLE).select('*', { count: 'exact', head: true });
        if (error) throw error;
        return true;
    } catch (e) {
        return false;
    }
};

export const fetchCaseByEmail = async (email: string): Promise<CitizenshipCase | undefined> => {
    const searchEmail = email.trim().toLowerCase();
    
    // 1. Check Local User Cache FIRST (Fastest & Most Reliable)
    const cachedUser = loadMyCaseLocally(searchEmail);
    if (cachedUser) {
        return cachedUser;
    }

    // 2. Check Supabase (Remote) - Explicitly query for this email
    if (supabase) {
        try {
            // Attempt 1: Exact Match
            // We REMOVED the check for 'deletedAt' being null. 
            // If a user was soft-deleted, we still want to find them so they can "log in" and potentially restore their case by saving it.
            const { data, error } = await supabase
                .from(DB_TABLE)
                .select('*')
                .eq('email', searchEmail)
                .limit(1);

            if (!error && data && data.length > 0) {
                const user = data[0] as CitizenshipCase;
                saveMyCaseLocally(searchEmail, user);
                return user;
            }

            // Attempt 2: Case-Insensitive Match (Fallback)
            const { data: dataIlike } = await supabase
                .from(DB_TABLE)
                .select('*')
                .ilike('email', searchEmail)
                .limit(1);

            if (dataIlike && dataIlike.length > 0) {
                const user = dataIlike[0] as CitizenshipCase;
                saveMyCaseLocally(searchEmail, user);
                return user;
            }

        } catch (e) {
            console.warn("Error fetching user by email:", e);
        }
    }

    // 3. Fallback to General List (Only works if public list has loaded AND we previously merged emails)
    const cases = await fetchCases(); 
    return cases.find(c => c.email.trim().toLowerCase() === searchEmail);
};

export const fetchCaseByFantasyName = async (name: string): Promise<CitizenshipCase | undefined> => {
    const searchName = name.trim().toLowerCase();
    if (supabase) {
        try {
             const { data, error } = await supabase.from(DB_TABLE).select(PUBLIC_COLUMNS).ilike('fantasyName', searchName).limit(1);
             if (!error && data && data.length > 0) return { ...data[0], email: '' } as CitizenshipCase;
        } catch(e) {}
    }
    const cases = await fetchCases();
    return cases.find(c => c.fantasyName.trim().toLowerCase() === searchName);
};

// --- WRITE OPERATIONS (Updated to return StorageResult) ---

export const upsertCase = async (newCase: CitizenshipCase): Promise<StorageResult> => {
  const normalizedNewEmail = newCase.email.trim().toLowerCase();
  const caseToSave = { ...newCase, email: normalizedNewEmail };
  let remoteError = null;

  // 1. Remote Write
  if (supabase) {
      const { error } = await supabase.from(DB_TABLE).upsert(caseToSave, { onConflict: 'id' });
      if (error) {
          remoteError = getErrorMessage(error);
          console.error("Supabase Upsert Error:", remoteError);
          lastFetchError = `Save Failed: ${remoteError}`;
      }
  }

  // 2. Local Write (Always perform for offline capability)
  const stored = localStorage.getItem(STORAGE_KEY);
  let cases: CitizenshipCase[] = stored ? JSON.parse(stored) : [];
  
  const index = cases.findIndex(c => c.id === caseToSave.id || c.email === normalizedNewEmail);
  if (index >= 0) {
    // Merge to preserve any existing fields not in payload (though upsert usually is full)
    cases[index] = { ...cases[index], ...caseToSave }; 
  } else {
    cases.push(caseToSave);
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));

  // 3. Update Local User Cache (Crucial Fix)
  saveMyCaseLocally(normalizedNewEmail, caseToSave);

  return {
      success: !remoteError,
      error: remoteError,
      isOffline: !supabase
  };
};

export const deleteCase = async (id: string): Promise<StorageResult> => {
  const timestamp = new Date().toISOString();
  let remoteError = null;

  if (supabase) {
      const { error } = await supabase.from(DB_TABLE).update({ deletedAt: timestamp }).eq('id', id);
      if (error) remoteError = getErrorMessage(error);
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
      const cases: CitizenshipCase[] = JSON.parse(stored);
      const updated = cases.map(c => c.id === id ? { ...c, deletedAt: timestamp } : c);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  return { success: !remoteError, error: remoteError, isOffline: !supabase };
};

export const restoreCase = async (id: string): Promise<StorageResult> => {
    let remoteError = null;
    if (supabase) {
        const { error } = await supabase.from(DB_TABLE).update({ deletedAt: null }).eq('id', id);
        if (error) remoteError = getErrorMessage(error);
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        const cases: CitizenshipCase[] = JSON.parse(stored);
        const updated = cases.map(c => c.id === id ? { ...c, deletedAt: undefined } : c);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
    return { success: !remoteError, error: remoteError, isOffline: !supabase };
};

export const hardDeleteCase = async (id: string): Promise<StorageResult> => {
    let remoteError = null;
    if (supabase) {
        const { error } = await supabase.from(DB_TABLE).delete().eq('id', id);
        if (error) remoteError = getErrorMessage(error);
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        const cases: CitizenshipCase[] = JSON.parse(stored);
        const filtered = cases.filter(c => c.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    }
    return { success: !remoteError, error: remoteError, isOffline: !supabase };
};

export const deleteAllCases = async () => {
    if (supabase) {
        const { error } = await supabase.from(DB_TABLE).delete().neq('id', GLOBAL_CONFIG_ID);
        if (error) throw error;
    }
    localStorage.setItem(STORAGE_KEY, '[]');
    localStorage.setItem(LOGS_KEY, '[]');
    localStorage.removeItem(LOCAL_USER_CACHE_KEY);
};

export const importCases = async (newCases: CitizenshipCase[]) => {
  const uniqueInputMap = new Map<string, CitizenshipCase>();
  const casesWithoutEmail: CitizenshipCase[] = [];

  for (const c of newCases) {
      if (c.email && !c.email.startsWith('imported_') && !c.email.startsWith('unclaimed_') && c.email.includes('@')) {
          const clean = c.email.trim().toLowerCase();
          c.email = clean;
          uniqueInputMap.set(clean, c);
      } else {
          casesWithoutEmail.push(c);
      }
  }
  
  let processedInput = [...Array.from(uniqueInputMap.values()), ...casesWithoutEmail];

  if (supabase) {
      const emailsToCheck = processedInput
          .map(c => c.email)
          .filter(e => e && !e.startsWith('imported_') && !e.startsWith('unclaimed_')) as string[];
      
      if (emailsToCheck.length > 0) {
          const uniqueEmails = Array.from(new Set(emailsToCheck));
          const BATCH_CHECK = 50; 
          const emailToIdMap = new Map<string, string>();

          for(let i=0; i<uniqueEmails.length; i+=BATCH_CHECK) {
               const batch = uniqueEmails.slice(i, i+BATCH_CHECK);
               const { data } = await supabase.from(DB_TABLE).select('id, email').in('email', batch);
               if (data) {
                   data.forEach((row: any) => {
                       if(row.email) emailToIdMap.set(row.email.trim().toLowerCase(), row.id);
                   });
               }
          }
          processedInput.forEach(c => {
              if (c.email && emailToIdMap.has(c.email)) {
                  c.id = emailToIdMap.get(c.email)!;
              }
          });
      }
  }

  const finalPayload = processedInput.map(c => ({
      ...c,
      id: c.id || crypto.randomUUID(), 
      lastUpdated: c.lastUpdated || new Date().toISOString(),
      email: c.email ? c.email.trim().toLowerCase() : `imported_${crypto.randomUUID()}@tracker.local`
  }));

  if (supabase) {
      const BATCH_SIZE = 50;
      for (let i = 0; i < finalPayload.length; i += BATCH_SIZE) {
          const batch = finalPayload.slice(i, i + BATCH_SIZE);
          const { error } = await supabase.from(DB_TABLE).upsert(batch, { onConflict: 'id' });
          if (error) throw error;
      }
  }
  
  const stored = localStorage.getItem(STORAGE_KEY);
  let current = stored ? JSON.parse(stored) : [];
  const processedMap = new Map(finalPayload.map(c => [c.id, c]));
  current = current.map((c: CitizenshipCase) => processedMap.has(c.id) ? processedMap.get(c.id) : c);
  
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
        const rawEmail = emailIdx > -1 && cols[emailIdx] ? cols[emailIdx].trim() : '';

        const c: CitizenshipCase = {
            id: '',
            fantasyName: name,
            email: rawEmail,
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

export const getFullDatabaseDump = async () => {
    const cases = await fetchCases(true); 
    const logs = getAuditLogs();
    const config = getAppConfig();
    return {
        timestamp: new Date().toISOString(),
        version: "1.2",
        stats: { cases: cases.length, logs: logs.length },
        data: { cases, logs, config }
    };
};