
import { CitizenshipCase, CaseType, CaseStatus, AuditLogEntry } from "../types";
import { supabase, isSupabaseEnabled } from "./authService";
import { RealtimeChannel } from '@supabase/supabase-js';

const STORAGE_KEY = 'de_citizenship_cases';
const LOGS_KEY = 'de_citizenship_audit_logs';
const CONFIG_KEY = 'de_citizenship_config';
const LOCAL_USER_CACHE_KEY = 'de_citizenship_local_cache'; 
const DB_TABLE = 'cases';

const GLOBAL_CONFIG_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const PUBLIC_COLUMNS_BASE = [
    'id', 'fantasyName', 'countryOfApplication', 'consulate', 'caseType', 
    'status', 'submissionDate', 'protocolDate', 'docsRequestDate', 
    'approvalDate', 'closedDate', 'lastUpdated', 'notes', 
    'notifySameDateSubmission', 'notifySameMonthUrkunde', 
    'notifySubmissionCohortUpdates', 'notifyProtocolCohortUpdates'
];

const PUBLIC_COLUMNS = [...PUBLIC_COLUMNS_BASE, 'deletedAt'].join(',');
const PUBLIC_COLUMNS_LEGACY = PUBLIC_COLUMNS_BASE.join(',');

export interface AppConfig {
    maintenanceMode: boolean;
}

export interface StorageResult {
    success: boolean;
    error: string | null;
    isOffline: boolean;
}

let lastFetchError: string | null = null;
export const getLastFetchError = () => lastFetchError;

const getErrorMessage = (error: any): string => {
    if (!error) return 'Unknown Error';
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return String(error?.message || JSON.stringify(error));
};

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

const saveMyCaseLocally = (email: string, caseData: CitizenshipCase) => {
    try {
        const cacheRaw = localStorage.getItem(LOCAL_USER_CACHE_KEY);
        const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
        cache[email.trim().toLowerCase()] = caseData;
        cache[caseData.id] = caseData;
        localStorage.setItem(LOCAL_USER_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {}
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

const mergeWithLocalEmails = (remoteCases: CitizenshipCase[]): CitizenshipCase[] => {
    try {
        const emailMap = new Map<string, string>();
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const localData = JSON.parse(stored) as CitizenshipCase[];
            localData.forEach(c => { if (c.id && c.email) emailMap.set(c.id, c.email); });
        }
        return remoteCases.map(rc => ({
            ...rc,
            email: rc.email || emailMap.get(rc.id) || ''
        }));
    } catch (e) {
        return remoteCases;
    }
};

export const fetchCases = async (includeDeleted: boolean = false): Promise<CitizenshipCase[]> => {
  if (supabase) {
    try {
        let allResults: any[] = [];
        let from = 0;
        let to = 999;
        let hasMore = true;
        const PAGE_SIZE = 1000;

        while (hasMore) {
            // First attempt with deletedAt column
            let { data, error } = await supabase.from(DB_TABLE).select(PUBLIC_COLUMNS).range(from, to);
            
            // If failed because of missing column, try legacy select
            if (error && (error.code === '42703' || error.message?.includes('deletedAt'))) {
                const retry = await supabase.from(DB_TABLE).select(PUBLIC_COLUMNS_LEGACY).range(from, to);
                data = retry.data;
                error = retry.error;
            }

            if (error) {
                lastFetchError = `API Error: ${getErrorMessage(error)}`;
                hasMore = false;
            } else if (data) {
                allResults = [...allResults, ...data];
                if (data.length < PAGE_SIZE) hasMore = false;
                else { from += PAGE_SIZE; to += PAGE_SIZE; }
            } else {
                hasMore = false;
            }
        }

        if (allResults.length > 0) {
            lastFetchError = null;
            let cases = mergeWithLocalEmails(filterSystemRecords(mapToCases(allResults)));
            if (!includeDeleted) cases = cases.filter(c => !c.deletedAt);
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

export const fetchUnclaimedCases = async (): Promise<CitizenshipCase[]> => {
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from(DB_TABLE)
                .select('*')
                .or('email.ilike.imported_%,email.ilike.unclaimed_%')
                .limit(1000);
            if (!error && data) return mapToCases(data);
        } catch (e) {}
    }
    return [];
};

const mapToCases = (data: any[]): CitizenshipCase[] => {
    return data.map(c => ({ ...c, email: c.email || '' })) as CitizenshipCase[];
};

const filterSystemRecords = (cases: CitizenshipCase[]) => {
    return cases.filter(c => c.id !== GLOBAL_CONFIG_ID);
};

export const fetchDeletedCases = async (): Promise<CitizenshipCase[]> => {
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from(DB_TABLE)
                .select(PUBLIC_COLUMNS)
                .not('deletedAt', 'is', null);
            if (data && !error) return filterSystemRecords(mapToCases(data));
        } catch (e) {}
    }
    return [];
};

export const checkConnection = async (): Promise<boolean> => {
    if (!supabase) return false;
    try {
        const { error } = await supabase.from(DB_TABLE).select('*', { count: 'exact', head: true });
        return !error;
    } catch (e) {
        return false;
    }
};

export const fetchCaseByEmail = async (email: string): Promise<CitizenshipCase | undefined> => {
    const searchEmail = email.trim().toLowerCase();
    const cachedUser = loadMyCaseLocally(searchEmail);
    if (cachedUser) return cachedUser;

    if (supabase) {
        try {
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
        } catch (e) {}
    }
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

export const upsertCase = async (newCase: CitizenshipCase): Promise<StorageResult> => {
  const normalizedNewEmail = newCase.email.trim().toLowerCase();
  const caseToSave = { ...newCase, email: normalizedNewEmail };
  let remoteError = null;

  if (supabase) {
      const { error } = await supabase.from(DB_TABLE).upsert(caseToSave, { onConflict: 'id' });
      if (error) {
          remoteError = getErrorMessage(error);
          lastFetchError = `Save Failed: ${remoteError}`;
      }
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  let cases: CitizenshipCase[] = stored ? JSON.parse(stored) : [];
  const index = cases.findIndex(c => c.id === caseToSave.id);
  if (index >= 0) cases[index] = { ...cases[index], ...caseToSave }; 
  else cases.push(caseToSave);
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
  saveMyCaseLocally(normalizedNewEmail, caseToSave);

  return { success: !remoteError, error: remoteError, isOffline: !supabase };
};

export const deleteCase = async (id: string): Promise<StorageResult> => {
  const timestamp = new Date().toISOString();
  let remoteError = null;
  if (supabase) {
      const { error } = await supabase.from(DB_TABLE).update({ deletedAt: timestamp }).eq('id', id);
      if (error) remoteError = getErrorMessage(error);
  }
  return { success: !remoteError, error: remoteError, isOffline: !supabase };
};

export const restoreCase = async (id: string): Promise<StorageResult> => {
    let remoteError = null;
    if (supabase) {
        const { error } = await supabase.from(DB_TABLE).update({ deletedAt: null }).eq('id', id);
        if (error) remoteError = getErrorMessage(error);
    }
    return { success: !remoteError, error: remoteError, isOffline: !supabase };
};

export const hardDeleteCase = async (id: string): Promise<StorageResult> => {
    let remoteError = null;
    if (supabase) {
        const { error } = await supabase.from(DB_TABLE).delete().eq('id', id);
        if (error) remoteError = getErrorMessage(error);
    }
    return { success: !remoteError, error: remoteError, isOffline: !supabase };
};

export const deleteAllCases = async () => {
    if (supabase) {
        await supabase.from(DB_TABLE).delete().neq('id', GLOBAL_CONFIG_ID);
    }
    localStorage.setItem(STORAGE_KEY, '[]');
};

export const importCases = async (newCases: CitizenshipCase[]) => {
  const finalPayload = newCases.map(c => ({
      ...c,
      id: c.id || crypto.randomUUID(), 
      lastUpdated: c.lastUpdated || new Date().toISOString(),
      email: c.email ? c.email.trim().toLowerCase() : `imported_${crypto.randomUUID()}@tracker.local`
  }));
  if (supabase) {
      await supabase.from(DB_TABLE).upsert(finalPayload, { onConflict: 'id' });
  }
};

export const parseAndImportCSV = async (csvText: string) => {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    return lines.length - 1; 
};

export const subscribeToCases = (onUpdate: () => void): RealtimeChannel | null => {
  if (supabase) {
      return supabase.channel('public:cases').on('postgres_changes', { event: '*', schema: 'public', table: DB_TABLE }, () => onUpdate()).subscribe();
  }
  return null;
};

export const isCaseUnclaimed = (c: CitizenshipCase): boolean => {
    return c.email.startsWith('unclaimed_') || c.email.startsWith('imported_');
};

export const claimCase = async (originalCase: CitizenshipCase, newEmail: string): Promise<CitizenshipCase> => {
    const updatedCase = { ...originalCase, email: newEmail.trim().toLowerCase(), lastUpdated: new Date().toISOString() };
    await upsertCase(updatedCase);
    return updatedCase;
};

export const getAuditLogs = (): AuditLogEntry[] => {
  const stored = localStorage.getItem(LOGS_KEY);
  return stored ? JSON.parse(stored) : [];
};

export const addAuditLog = (action: string, details: string, user: string = 'System') => {
  const logs = getAuditLogs();
  const newLog: AuditLogEntry = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), action, details, user };
  localStorage.setItem(LOGS_KEY, JSON.stringify([newLog, ...logs].slice(0, 100)));
};

export const setMaintenanceMode = async (enabled: boolean) => {
    await updateGlobalConfig({ maintenanceMode: enabled });
};

export const getFullDatabaseDump = async () => {
    const cases = await fetchCases(true); 
    return { timestamp: new Date().toISOString(), version: "1.2", data: { cases } };
};
