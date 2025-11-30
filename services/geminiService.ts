import { GoogleGenAI } from "@google/genai";
import { CitizenshipCase, StatSummary, Language, CaseType } from "../types";
import { TRANSLATIONS } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Fallback names in case of API quota limits (429 Errors)
const FALLBACK_NAMES = [
  "Bavarian Eagle", "Black Forest Bear", "Alpine Wolf", "Rhine Navigator", 
  "Hanseatic Sailor", "Saxon Climber", "Baltic Amber", "Teutonic Knight",
  "Munich Monk", "Berlin Falcon", "Hamburg Swan", "Dresden Fox",
  "Elbe River", "Danube Swimmer", "Harz Mountain", "Cologne Spire"
];

// DATA INJECTED FROM OFFICIAL BVA PDF REPORTS (2021-2025)
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
- "Task Forces": Users report that straightforward StAG 5 cases are sometimes pulled from the pile and processed in "batches", leading to lucky 9-12 month approvals.
- "Old Cases": Older Feststellung cases (2022-2023) often seem "stuck" while newer StAG 5 cases move faster.
- Aktenzeichen: Currently taking 2-4 months to receive after submission.
`;

// Helper to strip Markdown formatting from JSON responses
const cleanJson = (text: string) => {
  return text.replace(/^```(json)?\n?/i, '').replace(/\n?```$/, '').trim();
};

// Helper to sanitize AI errors in console (prevents leaking keys or raw JSON)
const logAiError = (context: string, error: any) => {
  const msg = error instanceof Error ? error.message : JSON.stringify(error);
  
  if (msg.includes("API key") || msg.includes("expired") || msg.includes("403") || msg.includes("400")) {
      console.warn(`[Gemini] ${context}: AI Service unavailable (Auth/Key Expired). Using fallback.`);
  } else if (msg.includes("429") || msg.includes("quota")) {
      console.warn(`[Gemini] ${context}: Quota Exceeded. Using fallback.`);
  } else {
      console.warn(`[Gemini] ${context} error:`, error);
  }
};

// Generate a fantasy username
export const generateFantasyUsername = async (seed: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Generate a single, creative, anonymous fantasy username based loosely on the concept of "${seed}" or German mythology/nature. 
      It should be 2-3 words max. No numbers. Title case. Examples: "Black Forest Eagle", "Alpine River", "Teutonic Knight", "Golden Bear".
      Return ONLY the name, nothing else.`,
    });
    return response.text?.trim() || "Anonymous Wanderer";
  } catch (error) {
    logAiError("NameGen", error);
    const random = FALLBACK_NAMES[Math.floor(Math.random() * FALLBACK_NAMES.length)];
    const suffix = Math.floor(Math.random() * 999);
    return `${random} ${suffix}`;
  }
};

// Generate insights based on statistics
export const generateStatisticalInsights = async (stats: StatSummary, cases: CitizenshipCase[], lang: Language): Promise<string> => {
  try {
    const langMap: Record<Language, string> = {
        en: "English",
        es: "Spanish",
        de: "German",
        it: "Italian",
        pt: "Portuguese"
    };
    const targetLang = langMap[lang] || "English";
    
    // Check if we are analyzing a specific subset or all
    const typeCount = new Set(cases.map(c => c.caseType)).size;
    const isSpecific = typeCount === 1;
    const contextStr = isSpecific && cases.length > 0 ? `specifically for ${cases[0].caseType} cases` : "for all German Citizenship cases";

    const prompt = `
      Act as a data analyst for a German Citizenship Application Tracker.
      
      INTERNAL TRACKER DATA:
      - Total Cases Tracked: ${stats.totalCases}
      - Avg Time to Protocol: ${stats.avgDaysToProtocol} days
      - Avg Time to Approval: ${stats.avgDaysToApproval} days
      - Avg Total Duration: ${stats.avgDaysTotal} days
      
      EXTERNAL CONTEXT (BVA OFFICIAL & REDDIT):
      ${OFFICIAL_DATA_CONTEXT}

      Task:
      Analyze the "Internal Tracker Data" in the context of the "External Context".
      Are our community stats matching the official acceleration trend in 2025?
      Provide a concise, 2-sentence insight in ${targetLang}. 
      Be encouraging but realistic about the backlog. Do not use markdown.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text?.trim() || "";
  } catch (error: any) {
    logAiError("Insights", error);
    
    // Fallback messages
    const fallbackMap: Record<Language, string> = {
        en: "AI Analysis unavailable due to high traffic. Based on data, processing times vary significantly by case type.",
        es: "Análisis de IA no disponible por alto tráfico. Los tiempos varían significativamente según el tipo de caso.",
        de: "KI-Analyse aufgrund hohen Aufkommens nicht verfügbar. Bearbeitungszeiten variieren je nach Falltyp.",
        it: "Analisi IA non disponibile. I tempi di elaborazione variano in base al tipo di caso.",
        pt: "Análise de IA indisponível. Os tempos de processamento variam significativamente por tipo de caso."
    };
    return fallbackMap[lang] || fallbackMap['en'];
  }
};

export const predictCaseTimeline = async (userCase: CitizenshipCase, stats: StatSummary, lang: Language) => {
    // 1. DETERMINISTIC CALCULATION (Math first, AI second)
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    
    // Determine Anchor Date and Remaining Days based on Stats
    let anchorDate = new Date(userCase.submissionDate);
    let avgWaitDays = stats.avgDaysTotal || 730; // Fallback 2 years
    let calculationMethod = "Submission Date + Avg Total Time";

    // If protocol exists, use Protocol -> Approval average which is more accurate
    if (userCase.protocolDate) {
        anchorDate = new Date(userCase.protocolDate);
        if (stats.avgDaysToApproval > 0) {
            avgWaitDays = stats.avgDaysToApproval;
            calculationMethod = "Protocol Date + Avg Wait (Protocol to Urkunde)";
        } else {
            // Fallback if we have protocol date but no stats for that phase
             avgWaitDays = Math.max(0, (stats.avgDaysTotal || 730) - 120); // Estimate protocol takes ~4 months
        }
    }

    // Calculate Target Date
    const estimatedDateObj = new Date(anchorDate.getTime() + (avgWaitDays * ONE_DAY_MS));
    const estimatedDateStr = estimatedDateObj.toISOString().split('T')[0];

    // Calculate Confidence Statistically (Not AI feeling)
    // Rule: Need > 10 samples for High, > 3 for Medium.
    let rawConfidence: 'High' | 'Medium' | 'Low' = "Low";
    if (stats.totalCases > 15) rawConfidence = "High";
    else if (stats.totalCases > 5) rawConfidence = "Medium";

    // Translate Confidence
    const t = TRANSLATIONS[lang];
    const translatedConfidence = rawConfidence === 'High' ? t.confHigh : (rawConfidence === 'Medium' ? t.confMedium : t.confLow);

    try {
        const langMap: Record<Language, string> = {
            en: "English",
            es: "Spanish",
            de: "German",
            it: "Italian",
            pt: "Portuguese"
        };
        const targetLang = langMap[lang] || "English";

        const prompt = `
            Act as an expert immigration data analyst for German Citizenship applications (BVA).
            
            We have mathematically calculated a prediction for this case.
            Your job is NOT to guess the date, but to EXPLAIN the reasoning behind our calculation using specific context.
            
            CALCULATED DATA (Do not change these):
            - Predicted Date: ${estimatedDateStr}
            - Confidence Level: ${rawConfidence}
            - Method: ${calculationMethod}
            - Sample Size: ${stats.totalCases} cases of type ${userCase.caseType}
            
            USER CASE DETAILS:
            - Type: ${userCase.caseType}
            - Country: ${userCase.countryOfApplication}
            - Submission: ${userCase.submissionDate}
            - Protocol: ${userCase.protocolDate || 'Not yet received'}
            
            EXTERNAL KNOWLEDGE BASE (USE THIS TO EXPLAIN):
            ${OFFICIAL_DATA_CONTEXT}
            
            INSTRUCTIONS:
            Return a JSON object.
            1. Use the "date" provided above: "${estimatedDateStr}"
            2. Use the "confidence" provided above: "${translatedConfidence}"
            3. Write a "reasoning" paragraph (approx 100-150 words) in ${targetLang}. 
               - If the case is StAG 5, explicitly mention the BVA's 2025 acceleration trend (doubling approvals) vs the growing backlog.
               - If the case is NOT StAG 5, mention that Feststellung/Others are generally slower than StAG 5 based on Reddit reports.
               - Mention that this prediction combines our community tracker data with official trends.
            
            JSON Schema:
            {
                "date": "YYYY-MM-DD",
                "confidence": "string",
                "reasoning": "string"
            }
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        
        const text = cleanJson(response.text || "");
        if (!text) throw new Error("Empty response");
        
        const parsed = JSON.parse(text);
        
        // Safety: Force the date/confidence to be the calculated ones in case AI hallucinated
        return {
            date: estimatedDateStr,
            confidence: translatedConfidence,
            confidenceScore: rawConfidence, // Return raw score for logic
            reasoning: parsed.reasoning || "Analysis generated based on community statistics."
        };

    } catch (error: any) {
        logAiError("Prediction", error);
        
        // Use mathematical fallback
        const fallbackReasoning = lang === 'es' 
            ? `Cálculo matemático directo basado en el promedio de ${avgWaitDays} días observados en ${stats.totalCases} casos similares. (Estado: Offline Mode)` 
            : `Direct mathematical calculation based on average of ${avgWaitDays} days observed in ${stats.totalCases} similar cases. (Status: Offline Mode)`;

        return {
            date: estimatedDateStr,
            confidence: translatedConfidence,
            confidenceScore: rawConfidence,
            reasoning: fallbackReasoning
        };
    }
};