
import { CitizenshipCase, CaseType, CaseStatus, AuditLogEntry } from "../types";

const STORAGE_KEY = 'de_citizenship_cases';
const LOGS_KEY = 'de_citizenship_audit_logs';
const CONFIG_KEY = 'de_citizenship_config';

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

export const getCases = (): CitizenshipCase[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    const mocks = generateMockData();
    saveCases(mocks);
    return mocks;
  }
  return JSON.parse(stored);
};

export const saveCases = (cases: CitizenshipCase[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
};

export const upsertCase = (newCase: CitizenshipCase) => {
  const cases = getCases();
  // Strictly normalize the input email to prevent duplicates or lookup failures
  const normalizedNewEmail = newCase.email.trim().toLowerCase();
  
  // Ensure the object being saved has the clean email
  const caseToSave = { ...newCase, email: normalizedNewEmail };

  const index = cases.findIndex(c => 
    c.id === caseToSave.id || 
    c.email.trim().toLowerCase() === normalizedNewEmail
  );
  
  if (index >= 0) {
    cases[index] = { ...cases[index], ...caseToSave }; 
  } else {
    cases.push(caseToSave);
  }
  saveCases(cases);
};

export const deleteCase = (id: string) => {
  const cases = getCases();
  const filteredCases = cases.filter(c => c.id !== id);
  saveCases(filteredCases);
};

// New function for Bulk Import
export const importCases = (newCases: CitizenshipCase[]) => {
  const currentCases = getCases();
  
  newCases.forEach(imported => {
    // Ensure ID exists
    if (!imported.id) imported.id = crypto.randomUUID();
    // Ensure lastUpdated exists
    if (!imported.lastUpdated) imported.lastUpdated = new Date().toISOString();
    
    // Sanitize email (Trim and Lowercase for consistency)
    if (imported.email) {
        imported.email = imported.email.trim().toLowerCase();
    } else {
        // If import has empty email, ensure it is set to a placeholder
        imported.email = `unclaimed_${imported.id}@tracker.local`;
    }

    // If importing a case that might have a duplicate email, update it.
    const existingIndex = currentCases.findIndex(c => 
        c.email.trim().toLowerCase() === imported.email // already lowercased above
    );
    
    if (existingIndex >= 0) {
      currentCases[existingIndex] = { ...currentCases[existingIndex], ...imported };
    } else {
      currentCases.push(imported);
    }
  });

  saveCases(currentCases);
};

export const getCaseByEmail = (email: string): CitizenshipCase | undefined => {
  const cases = getCases();
  const searchEmail = email.trim().toLowerCase();
  return cases.find(c => c.email.trim().toLowerCase() === searchEmail);
};

// Find a case by fantasy name (case-insensitive)
export const getCaseByFantasyName = (name: string): CitizenshipCase | undefined => {
  const cases = getCases();
  return cases.find(c => c.fantasyName.trim().toLowerCase() === name.trim().toLowerCase());
};

// Check if a case is a placeholder/unclaimed case
export const isCaseUnclaimed = (c: CitizenshipCase): boolean => {
    return c.email.startsWith('unclaimed_');
};

// Claims an "unclaimed" case (placeholder email) with a real user email
export const claimCase = (originalCase: CitizenshipCase, newEmail: string): CitizenshipCase => {
    const cases = getCases();
    const index = cases.findIndex(c => c.id === originalCase.id);
    const cleanEmail = newEmail.trim().toLowerCase();
    
    if (index >= 0) {
        const updatedCase = {
            ...cases[index],
            email: cleanEmail, // CRITICAL: Ensure this is the clean real email
            lastUpdated: new Date().toISOString()
        };
        cases[index] = updatedCase;
        saveCases(cases);
        return updatedCase;
    }
    return originalCase;
};

// Clear all data (Danger Zone)
export const clearAllData = () => {
    localStorage.removeItem(STORAGE_KEY);
    // We don't clear logs/audit trail usually, but for a hard reset:
    // localStorage.removeItem(LOGS_KEY); 
    // Let's strictly clear cases only to allow re-import
    localStorage.setItem(STORAGE_KEY, JSON.stringify([])); 
};

// --- Audit Logs ---

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
  // Keep last 100 logs to prevent quota issues
  const updatedLogs = [newLog, ...logs].slice(0, 100);
  localStorage.setItem(LOGS_KEY, JSON.stringify(updatedLogs));
};

// --- App Configuration (Maintenance Mode) ---

export const getAppConfig = (): AppConfig => {
    const stored = localStorage.getItem(CONFIG_KEY);
    return stored ? JSON.parse(stored) : { maintenanceMode: false };
};

export const setMaintenanceMode = (enabled: boolean) => {
    const config = getAppConfig();
    config.maintenanceMode = enabled;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
};
