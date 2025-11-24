import React from 'react';
import { CitizenshipCase, CaseStatus, Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { PartyPopper, CheckCircle2 } from 'lucide-react';

interface SuccessTickerProps {
  cases: CitizenshipCase[];
  lang: Language;
}

export const SuccessTicker: React.FC<SuccessTickerProps> = ({ cases, lang }) => {
  const t = TRANSLATIONS[lang];
  
  // Filter for approved cases in the last 60 days for relevance
  const approvedCases = cases
    .filter(c => c.status === CaseStatus.APPROVED && c.approvalDate)
    .sort((a, b) => new Date(b.approvalDate!).getTime() - new Date(a.approvalDate!).getTime())
    .slice(0, 10); // Show max 10 latest

  if (approvedCases.length === 0) return null;

  return (
    <div className="bg-gradient-to-r from-de-black via-gray-800 to-de-black text-white border-b-2 border-de-gold overflow-hidden py-2 relative">
       <div className="absolute left-0 top-0 bottom-0 bg-de-black z-10 px-3 flex items-center shadow-lg font-bold text-de-gold text-xs uppercase tracking-wider border-r border-gray-700">
          <PartyPopper size={14} className="mr-2" /> {t.successTicker}
       </div>
       
       <div className="flex animate-[scroll_20s_linear_infinite] hover:pause gap-8 items-center pl-40 whitespace-nowrap">
          {approvedCases.map((c, idx) => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
               <CheckCircle2 size={14} className="text-green-400" />
               <span className="font-bold text-white">{c.fantasyName}</span>
               <span className="text-xs text-gray-300">[{c.caseType.split(' ')[0]}]</span>
               <span className="text-gray-400 text-xs">({c.countryOfApplication})</span>
               <span className="text-de-gold font-mono text-xs">
                 {new Date(c.approvalDate!).toLocaleDateString(lang)}
               </span>
               {idx < approvedCases.length - 1 && <span className="text-gray-600 mx-2">|</span>}
            </div>
          ))}
       </div>
       
       <style>{`
         @keyframes scroll {
           0% { transform: translateX(100%); }
           100% { transform: translateX(-100%); }
         }
         .hover\\:pause:hover {
           animation-play-state: paused;
         }
       `}</style>
    </div>
  );
};