

import React, { useState } from 'react';
import { CitizenshipCase, Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { MessageSquare, User, Search } from 'lucide-react';

interface CommunityFeedProps {
  cases: CitizenshipCase[];
  lang: Language;
}

export const CommunityFeed: React.FC<CommunityFeedProps> = ({ cases, lang }) => {
  const t = TRANSLATIONS[lang];
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter cases that have notes and match search term
  const notes = cases
    .filter(c => c.notes && c.notes.length > 5 && (!searchTerm || c.notes.toLowerCase().includes(searchTerm.toLowerCase())))
    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-de-black flex items-center gap-2">
            <MessageSquare className="text-de-gold" size={20} /> {t.communityFeed}
        </h3>
        
        <div className="relative w-48">
             <Search className="absolute left-2 top-2 text-gray-400" size={14} />
             <input 
                type="text" 
                placeholder={t.searchNotes}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-de-gold outline-none"
             />
        </div>
      </div>
      
      <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
        {notes.length > 0 ? (
          notes.map(c => (
            <div key={c.id} className="border-b border-gray-100 pb-3 last:border-0 hover:bg-gray-50 p-2 rounded transition-colors">
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs font-bold text-de-black flex items-center gap-1">
                    <User size={12} /> {c.fantasyName}
                </span>
                <span className="text-xs text-gray-400">{new Date(c.lastUpdated).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-gray-600 italic">"{c.notes}"</p>
              <div className="mt-1 text-xs text-gray-400 inline-block px-1 rounded border border-gray-100 bg-white">
                {c.countryOfApplication} • {c.caseType}
              </div>
            </div>
          ))
        ) : (
          <p className="text-gray-400 text-sm italic text-center py-4">No community notes found.</p>
        )}
      </div>
    </div>
  );
};
