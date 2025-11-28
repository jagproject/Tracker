
import { GoogleGenAI } from "@google/genai";
import { CitizenshipCase, StatSummary, Language } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Fallback names in case of API quota limits (429 Errors)
const FALLBACK_NAMES = [
  "Bavarian Eagle", "Black Forest Bear", "Alpine Wolf", "Rhine Navigator", 
  "Hanseatic Sailor", "Saxon Climber", "Baltic Amber", "Teutonic Knight",
  "Munich Monk", "Berlin Falcon", "Hamburg Swan", "Dresden Fox",
  "Elbe River", "Danube Swimmer", "Harz Mountain", "Cologne Spire"
];

// Helper to strip Markdown formatting from JSON responses
const cleanJson = (text: string) => {
  return text.replace(/^```(json)?\n?/i, '').replace(/\n?```$/, '').trim();
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
    console.warn("AI Name Gen failed (likely quota), using fallback.", error);
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
      Analyze the following statistics ${contextStr}:
      - Total Cases: ${stats.totalCases}
      - Avg Time to Protocol (Aktenzeichen): ${stats.avgDaysToProtocol} days
      - Avg Time to Approval (Urkunde): ${stats.avgDaysToApproval} days
      - Avg Total Duration: ${stats.avgDaysTotal} days
      
      Provide a concise, 2-sentence insight or prediction in ${targetLang}. 
      Be encouraging but realistic. Do not use markdown.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text?.trim() || "";
  } catch (error) {
    console.warn("AI Insights failed (likely quota).", error);
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
    // This ensures that clicking the button multiple times gives the same result (Stability)
    // and relies on actual data rather than LLM hallucinations.
    
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
    let calculatedConfidence = "Low";
    if (stats.totalCases > 15) calculatedConfidence = "High";
    else if (stats.totalCases > 5) calculatedConfidence = "Medium";

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
            Your job is NOT to guess the date, but to EXPLAIN the reasoning behind our calculation.
            
            CALCULATED DATA (Do not change these):
            - Predicted Date: ${estimatedDateStr}
            - Confidence Level: ${calculatedConfidence}
            - Method: ${calculationMethod}
            - Sample Size: ${stats.totalCases} cases of type ${userCase.caseType}
            
            Case Details:
            - Type: ${userCase.caseType}
            - Country: ${userCase.countryOfApplication}
            - Submission: ${userCase.submissionDate}
            - Protocol: ${userCase.protocolDate || 'Not yet received'}
            
            External Context:
            - Official BVA processing is slow.
            - StAG 5 is generally faster than Feststellung.
            
            Your Task:
            Return a JSON object.
            1. Use the "date" provided above: "${estimatedDateStr}"
            2. Use the "confidence" provided above: "${calculatedConfidence}"
            3. Write a "reasoning" paragraph (approx 150 words) in ${targetLang}. 
               Explain that this date is based on the average waiting time of ${avgWaitDays} days observed in ${stats.totalCases} similar cases in our database. 
               Mention that individual results vary by clerk availability.
            
            JSON Schema:
            {
                "date": "YYYY-MM-DD",
                "confidence": "High" | "Medium" | "Low",
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
            confidence: calculatedConfidence,
            reasoning: parsed.reasoning || "Analysis generated based on community statistics."
        };

    } catch (error: any) {
        console.warn("AI Prediction generation failed", error);
        const errorDetail = error instanceof Error ? error.message : String(error);

        const fallbackReasoning = lang === 'es' 
            ? `Cálculo matemático directo basado en el promedio de ${avgWaitDays} días observados en ${stats.totalCases} casos similares. (Error IA: ${errorDetail})` 
            : `Direct mathematical calculation based on average of ${avgWaitDays} days observed in ${stats.totalCases} similar cases. (AI Error: ${errorDetail})`;

        return {
            date: estimatedDateStr,
            confidence: calculatedConfidence,
            reasoning: fallbackReasoning
        };
    }
};
