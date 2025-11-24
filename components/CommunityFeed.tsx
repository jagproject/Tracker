
import React from 'react';
import { CitizenshipCase, Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { MessageSquare, User } from 'lucide-react';

interface CommunityFeedProps {
  cases: CitizenshipCase[];
  lang: Language;
}

export const CommunityFeed: React.FC<CommunityFeedProps> = ({ cases, lang }) => {
  const t = TRANSLATIONS[lang];
  
  // Filter cases that have notes and are relatively recent, then sort.
  // We removed slice(0, 10) to show all matching the current dashboard filter.
  const notes = cases
    .filter(c => c.notes && c.notes.length > 5)
    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-bold text-de-black mb-4 flex items-center gap-2">
        <MessageSquare className="text-de-gold" size={20} /> {t.communityFeed}
      </h3>
      
      <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
        {notes.length > 0 ? (
          notes.map(c => (
            <div key={c.id} className="border-b border-gray-100 pb-3 last:border-0">
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-de-black flex items-center gap-1">
                    <User size={12} /> {c.fantasyName}
                </span>
                <span className="text-xs text-gray-400">{new Date(c.lastUpdated).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-gray-600 italic">"{c.notes}"</p>
              <div className="mt-1 text-xs text-gray-400 bg-gray-50 inline-block px-1 rounded">
                {c.countryOfApplication} • {c.caseType}
              </div>
            </div>
          ))
        ) : (
          <p className="text-gray-400 text-sm italic">No community notes shared yet matching current filters.</p>
        )}
      </div>
    </div>
  );
};
