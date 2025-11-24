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
    try {
        const prompt = `
            Predict the approval date for a German Citizenship application.
            Case Type: ${userCase.caseType}
            Country: ${userCase.countryOfApplication}
            Submission Date: ${userCase.submissionDate}
            Protocol Date: ${userCase.protocolDate || 'Not yet received'}
            
            Community Stats:
            - Avg Total Days: ${stats.avgDaysTotal}
            - Avg Protocol to Approval: ${stats.avgDaysToApproval}
            
            Return a JSON object with:
            {
                "date": "YYYY-MM-DD",
                "confidence": "High" | "Medium" | "Low",
                "reasoning": "Short explanation in ${lang} language"
            }
            Do not include markdown code blocks.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        
        const text = response.text?.trim();
        if (!text) throw new Error("Empty response");
        return JSON.parse(text);

    } catch (error) {
        console.warn("AI Prediction failed", error);
        // Fallback Logic: Simple math
        const startDate = userCase.protocolDate ? new Date(userCase.protocolDate) : new Date(userCase.submissionDate);
        const daysToAdd = userCase.protocolDate ? (stats.avgDaysToApproval || 365) : (stats.avgDaysTotal || 730);
        
        const estDate = new Date(startDate);
        estDate.setDate(estDate.getDate() + daysToAdd);
        
        return {
            date: estDate.toISOString().split('T')[0],
            confidence: "Low",
            reasoning: lang === 'es' ? "Cálculo simple basado en promedios históricos (API IA no disponible)." : "Simple calculation based on historical averages (AI quota exceeded)."
        };
    }
};