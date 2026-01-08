
import { GoogleGenAI } from "@google/genai";
import { CitizenshipCase, StatSummary, Language, CaseType } from "../types";
import { TRANSLATIONS } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- SMART CACHING SYSTEM ---
const CACHE_PREFIX = 'gemini_cache_v1_';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 Hours

interface CacheEntry {
    timestamp: number;
    data: any;
}

const getCacheKey = (key: string) => `${CACHE_PREFIX}${key}`;

const getCachedData = <T>(uniqueKey: string): T | null => {
    try {
        const raw = localStorage.getItem(getCacheKey(uniqueKey));
        if (!raw) return null;
        
        const entry: CacheEntry = JSON.parse(raw);
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
            localStorage.removeItem(getCacheKey(uniqueKey));
            return null;
        }
        return entry.data as T;
    } catch (e) {
        return null;
    }
};

const setCachedData = (uniqueKey: string, data: any) => {
    try {
        const entry: CacheEntry = {
            timestamp: Date.now(),
            data
        };
        localStorage.setItem(getCacheKey(uniqueKey), JSON.stringify(entry));
    } catch (e) {
        console.warn("Cache full, clearing old entries...");
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(CACHE_PREFIX)) {
                localStorage.removeItem(key);
            }
        }
    }
};

const FALLBACK_NAMES = [
  "Bavarian Eagle", "Black Forest Bear", "Alpine Wolf", "Rhine Navigator", 
  "Hanseatic Sailor", "Saxon Climber", "Baltic Amber", "Teutonic Knight",
  "Munich Monk", "Berlin Falcon", "Hamburg Swan", "Dresden Fox",
  "Elbe River", "Danube Swimmer", "Harz Mountain", "Cologne Spire"
];

const OFFICIAL_DATA_CONTEXT = `
OFFICIAL BVA STATISTICS (SOURCE: Internal Report Stand 30.06.2025, specifically for StAG 5):
1. BACKLOG SURGE: The 'Antragsbestand' (Backlog) for StAG 5 is growing rapidly. 
   - Jan 2025: 27,469 pending cases.
   - June 2025: 30,720 pending cases.
   - Net increase of ~3,200 cases in 6 months despite record processing speeds.

2. PROCESSING SPEED (ACCELERATING):
   - 2022 Total Approvals: 2,420
   - 2023 Total Approvals: 2,767
   - 2024 Total Approvals: 2,852
   - 2025 (Jan-Jun only): ~2,283 Approvals. 
   - Analysis: The BVA is currently processing StAG 5 cases at nearly DOUBLE the rate of previous years (projected ~4,500 for 2025), but incoming applications still outpace them.

COMMUNITY CONTEXT (r/GermanCitizenship & Forums):
- **REDDIT ANALYSIS**: The BVA received ~40,000 total citizenship applications in 2023. Wait times are likely to increase for newer cohorts unless BVA staffing scales.
- "Task Forces": Straightforward cases are sometimes pulled for batch processing.
- "Old Cases": Older Feststellung cases (2022-2023) often seem slower than newer StAG 5 cases.
`;

const cleanJson = (text: string) => {
  return text.replace(/^```(json)?\n?/i, '').replace(/\n?```$/, '').trim();
};

const logAiError = (context: string, error: any) => {
  const msg = error instanceof Error ? error.message : JSON.stringify(error);
  if (msg.includes("429") || msg.includes("quota")) {
      console.warn(`[Gemini] ${context}: Quota Exceeded. Using fallback.`);
  } else {
      console.warn(`[Gemini] ${context} error:`, error);
  }
};

export const generateFantasyUsername = async (seed: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate a single, creative, anonymous fantasy username based loosely on the concept of "${seed}" or German mythology/nature. 
      It should be 2-3 words max. No numbers. Title case. Examples: "Black Forest Eagle", "Alpine River", "Teutonic Knight", "Golden Bear".
      Return ONLY the name string, nothing else.`,
    });
    return response.text?.trim() || "Anonymous Wanderer";
  } catch (error) {
    logAiError("NameGen", error);
    const random = FALLBACK_NAMES[Math.floor(Math.random() * FALLBACK_NAMES.length)];
    const suffix = Math.floor(Math.random() * 999);
    return `${random} ${suffix}`;
  }
};

export const generateStatisticalInsights = async (stats: StatSummary, cases: CitizenshipCase[], lang: Language): Promise<string> => {
  const cacheKey = `insight_${stats.totalCases}_${stats.approvedCases}_${lang}_${new Date().toISOString().split('T')[0]}`;
  const cached = getCachedData<string>(cacheKey);
  if (cached) return cached;

  try {
    const langMap: Record<Language, string> = { en: "English", es: "Spanish", de: "German", it: "Italian", pt: "Portuguese" };
    const targetLang = langMap[lang] || "English";
    
    const prompt = `
      Act as a data analyst for a German Citizenship Application Tracker.
      INTERNAL TRACKER DATA:
      - Total Cases Tracked: ${stats.totalCases}
      - Avg Time to Protocol: ${stats.avgDaysToProtocol} days
      - Avg Time to Approval: ${stats.avgDaysToApproval} days
      EXTERNAL CONTEXT:
      ${OFFICIAL_DATA_CONTEXT}

      Task: Provide a concise, 2-sentence insight in ${targetLang} about whether community trends match official BVA data. 
      CRITICAL: The output MUST be entirely in ${targetLang}. Do not use markdown.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    const result = response.text?.trim() || "";
    if (result) setCachedData(cacheKey, result);
    return result;
  } catch (error: any) {
    logAiError("Insights", error);
    const fallbackMap: Record<Language, string> = {
        en: "Processing times vary significantly by case type. Please check the charts for detailed breakdowns.",
        es: "Los tiempos de procesamiento varían significativamente según el tipo de caso.",
        de: "Die Bearbeitungszeiten variieren je nach Falltyp erheblich.",
        it: "I tempi di elaborazione variano significativamente in base al tipo di caso.",
        pt: "Os tempos de processamento variam significativamente por tipo de caso."
    };
    return fallbackMap[lang] || fallbackMap['en'];
  }
};

export const predictCaseTimeline = async (userCase: CitizenshipCase, stats: StatSummary, lang: Language) => {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    let anchorDate = new Date(userCase.submissionDate);
    let avgWaitDays = stats.avgDaysTotal || 730;
    let calculationMethod = "Submission Date + Avg Total Time";

    if (userCase.protocolDate) {
        anchorDate = new Date(userCase.protocolDate);
        if (stats.avgDaysToApproval > 0) {
            avgWaitDays = stats.avgDaysToApproval;
            calculationMethod = "Protocol Date + Avg Wait (Protocol to Urkunde)";
        } else {
             avgWaitDays = Math.max(0, (stats.avgDaysTotal || 730) - 120);
        }
    }

    const estimatedDateObj = new Date(anchorDate.getTime() + (avgWaitDays * ONE_DAY_MS));
    const estimatedDateStr = estimatedDateObj.toISOString().split('T')[0];

    let rawConfidence: 'High' | 'Medium' | 'Low' = "Low";
    if (stats.totalCases > 15) rawConfidence = "High";
    else if (stats.totalCases > 5) rawConfidence = "Medium";

    const t = TRANSLATIONS[lang];
    const translatedConfidence = rawConfidence === 'High' ? t.confHigh : (rawConfidence === 'Medium' ? t.confMedium : t.confLow);

    const cacheKey = `prediction_${userCase.id}_${userCase.status}_${estimatedDateStr}_${lang}`;
    const cached = getCachedData<any>(cacheKey);
    if (cached) return cached;

    try {
        const langMap: Record<Language, string> = { en: "English", es: "Spanish", de: "German", it: "Italian", pt: "Portuguese" };
        const targetLang = langMap[lang] || "English";

        const prompt = `
            Act as an expert immigration data analyst. Explain the reasoning behind our calculated prediction of ${estimatedDateStr}.
            USER CASE: Type ${userCase.caseType}, Country ${userCase.countryOfApplication}.
            EXTERNAL KNOWLEDGE: ${OFFICIAL_DATA_CONTEXT}
            
            Return a JSON object:
            {
                "date": "${estimatedDateStr}",
                "confidence": "${translatedConfidence}",
                "reasoning": "Reasoning in ${targetLang} (approx 100 words). Mention BVA acceleration vs application surge."
            }
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        
        const text = cleanJson(response.text || "");
        const parsed = JSON.parse(text);
        
        const result = {
            date: estimatedDateStr,
            confidence: translatedConfidence,
            confidenceScore: rawConfidence,
            reasoning: parsed.reasoning || "Analysis generated based on community statistics."
        };

        setCachedData(cacheKey, result);
        return result;
    } catch (error: any) {
        logAiError("Prediction", error);
        return {
            date: estimatedDateStr,
            confidence: translatedConfidence,
            confidenceScore: rawConfidence,
            reasoning: lang === 'es' ? `Cálculo basado en el promedio de ${avgWaitDays} días.` : `Calculation based on average of ${avgWaitDays} days.`
        };
    }
};

export const detectAnomalies = async (cases: CitizenshipCase[]): Promise<any[]> => {
    try {
        const simplifiedCases = cases.map(c => ({
            id: c.id,
            name: c.fantasyName,
            country: c.countryOfApplication,
            submission: c.submissionDate,
            approval: c.approvalDate,
            type: c.caseType
        }));

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Analyze for anomalies (duplicates, logical date errors): ${JSON.stringify(simplifiedCases.slice(0, 100))}. Return JSON array of {id, name, issueType, details}.`,
            config: { responseMimeType: "application/json" }
        });

        return JSON.parse(cleanJson(response.text || "[]"));
    } catch (error) {
        logAiError("AnomalyDetect", error);
        return [];
    }
}
