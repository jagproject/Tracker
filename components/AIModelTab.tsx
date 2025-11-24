import React, { useState } from 'react';
import { CitizenshipCase, StatSummary, Language } from '../types';
import { predictCaseTimeline } from '../services/geminiService';
import { TRANSLATIONS } from '../constants';
import { formatDuration, formatISODateToLocale } from '../services/statsUtils';
import { Sparkles, BrainCircuit, Loader2, CalendarPlus, Clock } from 'lucide-react';

interface AIModelTabProps {
  userCase?: CitizenshipCase;
  stats: StatSummary;
  lang: Language;
}

export const AIModelTab: React.FC<AIModelTabProps> = ({ userCase, stats, lang }) => {
  const t = TRANSLATIONS[lang];
  const [prediction, setPrediction] = useState<{ date: string, confidence: string, reasoning: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePredict = async () => {
    if (!userCase) return;
    setLoading(true);
    // Logic: Protocol Date is primary anchor. Service handles this if passed.
    const result = await predictCaseTimeline(userCase, stats, lang);
    setPrediction(result);
    setLoading(false);
  };

  const addToCalendar = () => {
    if (!prediction || !userCase) return;
    
    const predDate = new Date(prediction.date);
    const nextDay = new Date(predDate);
    nextDay.setDate(predDate.getDate() + 1);

    const startStr = predDate.toISOString().replace(/-|:|\.\d+/g, '').slice(0, 8);
    const endStr = nextDay.toISOString().replace(/-|:|\.\d+/g, '').slice(0, 8);

    const title = "Expected German Citizenship Approval";
    const details = `Predicted by Citizenship Tracker AI.\nBased on ${userCase.protocolDate ? 'Protocol Date' : 'Submission Date'}.\nConfidence: ${prediction.confidence}`;
    
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startStr}/${endStr}&details=${encodeURIComponent(details)}`;
    window.open(url, '_blank');
  };

  if (!userCase) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow text-center">
         <BrainCircuit size={48} className="text-gray-300 mb-4" />
         <p className="text-gray-500">Please log in and set up your case to use the AI Model.</p>
      </div>
    );
  }

  // Determine which date to display as reference in the input box
  const showProtocol = !!userCase.protocolDate;
  const protocolDisplay = userCase.protocolDate ? formatISODateToLocale(userCase.protocolDate, lang) : '--';
  const submissionDisplay = formatISODateToLocale(userCase.submissionDate, lang);

  return (
    <div className="space-y-8 animate-in fade-in">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left: Input / Action Card */}
            <div className="bg-gradient-to-br from-de-black to-gray-900 p-8 rounded-xl shadow-xl text-white relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <BrainCircuit size={120} />
                </div>
                
                <div>
                    <h2 className="text-2xl font-bold text-de-gold mb-2 flex items-center gap-2">
                        <Sparkles /> {t.aiPredictionTitle}
                    </h2>
                    <p className="text-gray-300 mb-6 text-sm leading-relaxed">
                        {t.aiPredictionDesc} Using specific waiting times for <strong>{userCase.caseType}</strong>.
                    </p>

                    <div className="space-y-4 relative z-10 bg-white/5 p-4 rounded-lg border border-white/10">
                         {/* Highlight the Active Anchor */}
                         <div className={`flex justify-between border-b border-gray-700 pb-2 last:border-0 last:pb-0 ${showProtocol ? 'bg-white/10 -mx-4 px-4 py-2' : ''}`}>
                            <span className={`text-xs uppercase font-bold flex items-center gap-2 ${showProtocol ? 'text-de-gold' : 'text-gray-400'}`}>
                               {t.protocolDate} {showProtocol && <span className="text-[10px] bg-de-gold text-de-black px-1 rounded">USED</span>}
                            </span>
                            <span className={`font-mono text-sm font-bold ${showProtocol ? 'text-white' : 'text-gray-500'}`}>{protocolDisplay}</span>
                        </div>
                        <div className={`flex justify-between border-b border-gray-700 pb-2 last:border-0 last:pb-0 ${!showProtocol ? 'bg-white/10 -mx-4 px-4 py-2' : ''}`}>
                            <span className={`text-xs uppercase font-bold flex items-center gap-2 ${!showProtocol ? 'text-de-gold' : 'text-gray-400'}`}>
                                {t.submissionDate} {!showProtocol && <span className="text-[10px] bg-de-gold text-de-black px-1 rounded">USED</span>}
                            </span>
                            <span className="font-mono text-sm font-bold">{submissionDisplay}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-700 pb-2 last:border-0 last:pb-0">
                            <span className="text-gray-400 text-xs uppercase font-bold">{t.caseType}</span>
                            <span className="font-mono text-sm truncate max-w-[150px] text-right" title={userCase.caseType}>{userCase.caseType}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-700 pb-2 last:border-0 last:pb-0">
                            <span className="text-gray-400 text-xs uppercase font-bold">{t.avgWait}</span>
                            {/* Ensure Time is in Months/Years */}
                            <span className="font-mono text-sm text-de-gold">{formatDuration(stats.avgDaysTotal, lang)}</span>
                        </div>
                    </div>
                </div>

                <button 
                    onClick={handlePredict}
                    disabled={loading}
                    className="mt-6 w-full bg-de-gold text-de-black font-bold py-3 rounded shadow-lg hover:bg-yellow-400 transition-all flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 className="animate-spin" /> : <Sparkles size={18} />}
                    {t.predictTimeline}
                </button>
            </div>

            {/* Right: Primary Result (Date) */}
            <div className="flex flex-col h-full">
                {prediction ? (
                    <div className="bg-white h-full p-8 rounded-xl shadow-lg border-t-8 border-de-gold animate-in slide-in-from-right-4 flex flex-col justify-center items-center text-center relative overflow-hidden">
                        <div className="absolute top-2 right-2">
                             <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${
                                prediction.confidence === 'High' ? 'bg-green-50 text-green-700 border-green-200' : 
                                prediction.confidence === 'Medium' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-red-50 text-red-700 border-red-200'
                            }`}>
                                {prediction.confidence} {t.confidence}
                            </span>
                        </div>
                        
                        <p className="text-xs font-bold uppercase text-gray-400 mb-4 tracking-widest">{t.estUrkunde}</p>
                        <div className="mb-6">
                            {/* Result Format DD/MMM/YYYY */}
                            <p className="text-4xl md:text-5xl font-extrabold text-de-black tracking-tight">
                                {formatISODateToLocale(prediction.date, lang)}
                            </p>
                        </div>
                        
                        <button 
                            onClick={addToCalendar}
                            className="flex items-center justify-center gap-2 bg-blue-50 text-blue-600 border border-blue-100 px-4 py-2 rounded-full hover:bg-blue-100 transition-colors font-bold text-xs uppercase tracking-wide"
                        >
                             <CalendarPlus size={16} /> {t.addToCalendar}
                        </button>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-300 border-2 border-dashed border-gray-200 rounded-xl p-8 bg-gray-50/50">
                        <Clock size={48} className="mb-4 opacity-20" />
                        <p className="font-medium">{t.runModel}</p>
                    </div>
                )}
            </div>
        </div>

        {/* Bottom: Full Width Reasoning */}
        {prediction && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-in slide-in-from-bottom-2 w-full">
                <h3 className="text-xs font-bold uppercase text-gray-500 mb-2 flex items-center gap-2">
                    <BrainCircuit size={14} /> {t.aiReasoning}
                </h3>
                <p className="text-sm text-gray-700 leading-relaxed text-justify border-l-4 border-gray-200 pl-4">
                    {prediction.reasoning}
                </p>
            </div>
        )}
    </div>
  );
};