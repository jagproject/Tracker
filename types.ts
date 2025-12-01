

export enum CaseType {
  STAG_5 = "StAG §5",
  FESTSTELLUNG = "Feststellung",
  ART_116 = "Artikel 116 GG",
  STAG_8 = "StAG §8",
  STAG_10 = "StAG §10",
  STAG_14 = "StAG §14",
  STAG_15 = "StAG §15"
}

export enum CaseStatus {
  SUBMITTED = "Enviado",
  PROTOCOL_RECEIVED = "Aktenzeichen (Protocol)",
  ADDITIONAL_DOCS = "Docs Adicionales",
  APPROVED = "Aprobado (Urkunde)",
  CLOSED = "Cerrado / Rechazado"
}

export interface CitizenshipCase {
  id: string;
  email: string; 
  fantasyName: string;
  countryOfApplication: string;
  consulate?: string; // Feature 1: Optional Consulate
  caseType: CaseType;
  
  // Dates
  submissionDate: string;
  protocolDate?: string; 
  docsRequestDate?: string;
  approvalDate?: string;
  closedDate?: string;

  status: CaseStatus;
  notes?: string; // Free text
  lastUpdated: string;
  
  // Feature 2: Document Checklist
  documents?: string[]; 

  // Feature: Soft Delete
  deletedAt?: string;

  // Notifications
  notifySameDateSubmission?: boolean;
  notifySameMonthUrkunde?: boolean;
  notifySubmissionCohortUpdates?: boolean; // New: Status changes in submission month cohort
  notifyProtocolCohortUpdates?: boolean; // New: Status changes in protocol month cohort
}

export interface UserSession {
  email: string;
  fantasyName: string;
  isAuthenticated: boolean;
  language: Language;
}

export type Language = 'es' | 'en' | 'de' | 'it' | 'pt';

export interface AdvancedStats {
  min: number;
  max: number;
  mean: number;
  mode: number;
  stdDev: number;
  count: number;
}

export interface StatSummary {
  totalCases: number;
  activeCases: number; // Updated < 12 months
  pausedCases: number; // > 12 months no update
  approvedCases: number;
  closedCases: number;
  avgDaysToProtocol: number;
  avgDaysToApproval: number;
  avgDaysTotal: number; // Added for progress bar calc
  byType: { name: string; value: number }[];
  byCountry: { name: string; value: number }[];
  byStatus: { name: string; value: number }[];
  waitingStats?: AdvancedStats;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  user?: string;
}