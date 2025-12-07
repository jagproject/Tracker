



import { CitizenshipCase, AdvancedStats, CaseStatus, StatSummary, Language } from "../types";

const MONTH_NAMES: Record<Language, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
  de: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
  it: ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'],
  pt: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
};

// Safe helper to format Date objects to locale string without crashing
export const safeToLocaleDateString = (dateStr: string | undefined | null, lang: Language = 'en'): string => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString(lang);
    } catch (e) {
        return '';
    }
};

// Format ISO date strictly to DD/MMM/YYYY
export const formatISODateToLocale = (isoDate: string | undefined | null, lang: Language): string => {
  if (!isoDate || typeof isoDate !== 'string') return '--';
  
  try {
    // Handle full ISO strings (2023-01-01T00:00:00) vs simple dates (2023-01-01)
    const cleanDate = isoDate.split('T')[0];
    const parts = cleanDate.split('-');
    
    // Safety check for invalid formats
    if (parts.length !== 3) return cleanDate || '--';

    const y = parseInt(parts[0]);
    const m = parseInt(parts[1]);
    const d = parseInt(parts[2]);
    
    // Validate parsing
    if (isNaN(y) || isNaN(m) || isNaN(d)) return cleanDate;

    // Month is 0-indexed in JS dates, but we use strict array lookup
    const monthIndex = m - 1; 
    
    if (monthIndex < 0 || monthIndex > 11) return cleanDate; // Fallback

    const dayStr = d.toString().padStart(2, '0');
    // Safety check for language
    const monthList = MONTH_NAMES[lang] || MONTH_NAMES['en'];
    const monthStr = monthList[monthIndex] || monthList[0];
    
    return `${dayStr}/${monthStr}/${y}`;
  } catch (e) {
    return isoDate || '--';
  }
};

// Format ISO date to DD/MMM/YYYY - HH:MM
export const formatDateTimeToLocale = (isoDate: string | undefined | null, lang: Language): string => {
  if (!isoDate) return '--';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '--';
    
    const day = d.getDate().toString().padStart(2, '0');
    // Month name
    const monthList = MONTH_NAMES[lang] || MONTH_NAMES['en'];
    const mName = monthList[d.getMonth()];
    
    const year = d.getFullYear();
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');

    return `${day}/${mName}/${year} - ${hh}:${mm}`;
  } catch (e) {
    return isoDate;
  }
};

// Difference in days
export const getDaysDiff = (start: string | undefined, end?: string): number | null => {
  if (!start || !end) return null;
  if (typeof start !== 'string' || typeof end !== 'string') return null;
  
  try {
    const d1 = new Date(start).getTime();
    const d2 = new Date(end).getTime();
    
    // Prevent NaN propagation which crashes Recharts
    if (isNaN(d1) || isNaN(d2)) return null;

    const diff = Math.floor((d2 - d1) / (1000 * 3600 * 24));
    return isNaN(diff) ? null : diff;
  } catch (e) {
    return null;
  }
};

// Detect Ghost Cases based on user requirements
export const isGhostCase = (c: CitizenshipCase): boolean => {
    // Ghost Cases are only active/pending cases
    // Ignore cases that are already closed/approved
    if (c.status === CaseStatus.APPROVED || c.status === CaseStatus.CLOSED) return false;

    const now = new Date();
    const nowTime = now.getTime();
    const ONE_YEAR_MS = 1000 * 3600 * 24 * 365;
    const FOUR_YEARS_MS = ONE_YEAR_MS * 4;

    // Check dates validity
    const subTime = c.submissionDate ? new Date(c.submissionDate).getTime() : NaN;
    const protoTime = c.protocolDate ? new Date(c.protocolDate).getTime() : NaN;

    // Rule 1: No Protocol Date AND Submission > 1 Year (Casos sin AZ hace más de un año)
    // We assume if protocolDate is missing, they haven't received AZ.
    if (!c.protocolDate && !isNaN(subTime)) {
        if (nowTime - subTime > ONE_YEAR_MS) return true;
    }

    // Rule 2: Protocol Date exists AND > 4 Years since AZ Date (Casos sin decision final hace más de 4 años desde la fecha de AZ)
    // We already checked status is not APPROVED/CLOSED at the top.
    if (c.protocolDate && !isNaN(protoTime)) {
         if (nowTime - protoTime > FOUR_YEARS_MS) return true;
    }

    return false;
};

// Filter out stale and ghost cases
export const filterActiveCases = (cases: CitizenshipCase[]): CitizenshipCase[] => {
  const now = new Date();
  const nowTime = now.getTime();
  
  return cases.filter(c => {
    // Always include Completed cases for historical stats, unless they are ancient ghosts (though typically we keep history)
    if (c.status === CaseStatus.APPROVED || c.status === CaseStatus.CLOSED) {
      return true;
    }

    // EXCLUDE GHOST CASES based on strict rules
    if (isGhostCase(c)) {
        return false;
    }

    // Standard "Stale" Check (Paused cases)
    // If not updated in 12 months, exclude from active stats (even if not technically a ghost by AZ definition)
    if (!c.lastUpdated) return true; 
    const lastUpdate = new Date(c.lastUpdated);
    const lastTime = lastUpdate.getTime();
    
    if (isNaN(lastTime)) return true; 

    // Filter out cases not updated in > 1 year (Standard Stale Rule)
    const diffDays = (nowTime - lastTime) / (1000 * 3600 * 24);
    return diffDays <= 365;
  });
};

export const calculateAdvancedStats = (numbers: number[]): AdvancedStats => {
  // Filter out NaNs and infinite numbers strictly
  const cleanNumbers = numbers.filter(n => typeof n === 'number' && Number.isFinite(n));

  if (cleanNumbers.length === 0) {
    return { min: 0, max: 0, mean: 0, mode: 0, stdDev: 0, count: 0 };
  }

  const sorted = [...cleanNumbers].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;

  const frequency: Record<string, number> = {};
  let maxFreq = 0;
  let mode = sorted[0];
  for (const n of sorted) {
    frequency[n] = (frequency[n] || 0) + 1;
    if (frequency[n] > maxFreq) {
      maxFreq = frequency[n];
      mode = n;
    }
  }

  const variance = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / sorted.length;
  const stdDev = Math.sqrt(variance);

  return {
    min,
    max,
    mean: Math.round(mean),
    mode,
    stdDev: Math.round(stdDev * 10) / 10,
    count: sorted.length
  };
};

export const getCountryStats = (cases: CitizenshipCase[], country: string) => {
  const countryCases = cases.filter(c => c.countryOfApplication === country);
  
  const protocolDays = countryCases
    .map(c => getDaysDiff(c.submissionDate, c.protocolDate))
    .filter((d): d is number => d !== null && d > 0);

  const approvalDays = countryCases
    .map(c => getDaysDiff(c.submissionDate, c.approvalDate))
    .filter((d): d is number => d !== null && d > 0);

  const protoToAppDays = countryCases
    .map(c => getDaysDiff(c.protocolDate || '', c.approvalDate))
    .filter((d): d is number => d !== null && d > 0);

  return {
    protocol: calculateAdvancedStats(protocolDays), 
    approval: calculateAdvancedStats(approvalDays), 
    protoToApp: calculateAdvancedStats(protoToAppDays) 
  };
};

// Format duration strictly in Months or Years (Never Days)
export const formatDuration = (days: number | undefined | null, lang: Language = 'en'): string => {
  if (days === undefined || days === null || isNaN(days)) return '--';

  const t = {
    en: { m: 'months', y: 'years' },
    es: { m: 'meses', y: 'años' },
    de: { m: 'Monate', y: 'Jahre' },
    it: { m: 'mesi', y: 'anni' },
    pt: { m: 'meses', y: 'anos' },
  };
  
  const labels = t[lang] || t['en'];

  if (days <= 0) return `0 ${labels.m}`;
  
  // Convert days to months (avg 30.44 days per month)
  const months = days / 30.44;

  if (months < 12) {
    // If less than a year, show months (e.g. "0.5 months" or "11 months")
    return `${months.toFixed(1).replace('.0', '')} ${labels.m}`;
  } else {
    // If more than a year, show years
    const years = days / 365.25;
    return `${years.toFixed(1).replace('.0', '')} ${labels.y}`;
  }
};

export const calculateQuickStats = (subsetCases: CitizenshipCase[]): StatSummary => {
     const subToApproval: number[] = [];
     const subToProtocol: number[] = [];
     const protoToApproval: number[] = [];
     
     let approvedCount = 0;
     let closedCount = 0;

     subsetCases.forEach(c => {
        if (c.status === CaseStatus.APPROVED) approvedCount++;
        if (c.status === CaseStatus.CLOSED) closedCount++;

        if (c.submissionDate && c.approvalDate) {
            const d = getDaysDiff(c.submissionDate, c.approvalDate);
            if(d !== null && d > 0) subToApproval.push(d);
        }
        if (c.submissionDate && c.protocolDate) {
            const d = getDaysDiff(c.submissionDate, c.protocolDate);
            if(d !== null && d > 0) subToProtocol.push(d);
        }
        if (c.protocolDate && c.approvalDate) {
            const d = getDaysDiff(c.protocolDate, c.approvalDate);
            if(d !== null && d > 0) protoToApproval.push(d);
        }
     });

     const calcMean = (arr: number[]) => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
     
     const typeMap: any = {};
     subsetCases.forEach(c => typeMap[c.caseType] = (typeMap[c.caseType] || 0) + 1);
     const byType = Object.keys(typeMap).map(k => ({name: k, value: typeMap[k]}));

     const countryMap: any = {};
     subsetCases.forEach(c => countryMap[c.countryOfApplication] = (countryMap[c.countryOfApplication] || 0) + 1);
     const byCountry = Object.keys(countryMap).map(k => ({name: k, value: countryMap[k]}));

     return {
        totalCases: subsetCases.length,
        activeCases: subsetCases.length,
        pausedCases: 0,
        approvedCases: approvedCount,
        closedCases: closedCount,
        avgDaysToProtocol: calcMean(subToProtocol),
        avgDaysToApproval: calcMean(protoToApproval),
        avgDaysTotal: calcMean(subToApproval),
        waitingStats: calculateAdvancedStats(subsetCases.filter(c => c.status !== CaseStatus.APPROVED && c.status !== CaseStatus.CLOSED).map(c => getDaysDiff(c.submissionDate, new Date().toISOString()) || 0)),
        approvalStats: calculateAdvancedStats(subToApproval), // New: Calculate advanced stats for completed cases (for Bell Curve)
        byType,
        byCountry: byCountry.sort((a,b) => b.value - a.value),
        byStatus: [],
     };
};
