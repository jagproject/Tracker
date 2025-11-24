import React, { useState, useMemo } from 'react';
import { CitizenshipCase, Language } from '../types';
import { getCountryStats, filterActiveCases, formatDuration } from '../services/statsUtils';
import { TRANSLATIONS } from '../constants';
import { Globe, Clock, FileCheck, List, ChevronRight, Search } from 'lucide-react';

interface WorldMapStatsProps {
  cases: CitizenshipCase[];
  lang: Language;
  loading?: boolean; // Item 5: Loading State
}

const SkeletonMap = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-pulse flex flex-col h-[600px]">
        <div className="h-14 bg-gray-800 shrink-0"></div>
        <div className="flex flex-1">
             <div className="w-1/3 md:w-1/4 bg-gray-50 border-r border-gray-200 p-4 space-y-4">
                 <div className="h-8 bg-gray-200 rounded"></div>
                 <div className="space-y-2">
                     <div className="h-6 bg-gray-200 rounded w-full"></div>
                     <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                     <div className="h-6 bg-gray-200 rounded w-5/6"></div>
                 </div>
             </div>
             <div className="flex-1 p-8 space-y-6">
                  <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-gray-200"></div>
                      <div className="space-y-2 w-1/2">
                          <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                      </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                      <div className="h-32 bg-gray-100 rounded"></div>
                      <div className="h-32 bg-gray-100 rounded"></div>
                  </div>
             </div>
        </div>
    </div>
);

export const WorldMapStats: React.FC<WorldMapStatsProps> = ({ cases, lang, loading = false }) => {
  const t = TRANSLATIONS[lang];
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter cases first, ensuring we have recent data
  const activeCases = useMemo(() => filterActiveCases(cases), [cases]);
  
  // Get list of countries that actually have cases
  const activeCountries = useMemo(() => {
    const unique = new Set(activeCases.map(c => c.countryOfApplication));
    return Array.from(unique).sort();
  }, [activeCases]);

  const filteredCountries = activeCountries.filter(c => 
    c.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getCountryCaseCount = (country: string) => {
    return activeCases.filter(c => c.countryOfApplication === country).length;
  };

  const stats = selectedCountry ? getCountryStats(activeCases, selectedCountry) : null;

  if (loading) return <SkeletonMap />;

  // Safety: If no countries, show empty
  if (activeCountries.length === 0) {
      return (
         <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500 mb-8">
            <Globe className="mx-auto mb-2 opacity-50" size={48}/>
            {t.noCasesFound}
         </div>
      );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in mb-8 flex flex-col h-[600px]">
      <div className="p-4 bg-de-black text-white flex justify-between items-center border-b border-gray-700 shrink-0">
        <h2 className="text-lg font-bold text-de-gold flex items-center gap-2">
            <List size={18} /> {t.allCountries}
        </h2>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Country List */}
        <div className="w-1/3 md:w-1/4 bg-gray-50 border-r border-gray-200 flex flex-col">
            <div className="p-3 border-b border-gray-200 bg-white">
                <div className="relative">
                    <Search className="absolute left-2 top-2.5 text-gray-400" size={14} />
                    <input 
                        type="text" 
                        placeholder="Search..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-de-gold outline-none"
                    />
                </div>
            </div>
            <div className="overflow-y-auto flex-1">
                {filteredCountries.map(country => (
                    <button
                        key={country}
                        onClick={() => setSelectedCountry(country)}
                        className={`w-full text-left px-4 py-3 text-sm border-b border-gray-100 hover:bg-white transition-colors flex justify-between items-center group ${
                            selectedCountry === country ? 'bg-white border-l-4 border-l-de-gold shadow-sm font-bold text-de-black' : 'text-gray-600 border-l-4 border-l-transparent'
                        }`}
                    >
                        <span className="truncate mr-2">{country}</span>
                        <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{getCountryCaseCount(country)}</span>
                            {selectedCountry === country && <ChevronRight size={14} className="text-de-gold" />}
                        </div>
                    </button>
                ))}
                {filteredCountries.length === 0 && (
                    <div className="p-4 text-center text-xs text-gray-400">
                        {t.noCasesFound}
                    </div>
                )}
            </div>
        </div>

        {/* Right Column: Details */}
        <div className="flex-1 bg-white overflow-y-auto p-6 relative">
             {!selectedCountry ? (
             <div className="h-full flex flex-col items-center justify-center text-gray-400 text-center p-8">
                <Globe size={64} className="mb-4 text-gray-100" />
                <p className="text-de-black font-bold mb-2">{t.country}</p>
                <p className="max-w-xs text-sm">{t.mapInstructions}</p>
             </div>
           ) : (
             <div className="animate-in slide-in-from-right-4 fade-in max-w-2xl mx-auto">
                <div className="flex items-center gap-4 mb-8 border-b pb-4">
                     <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-500 text-2xl shadow-inner shrink-0">
                        {selectedCountry.substring(0,2).toUpperCase()}
                     </div>
                     <div>
                        <h3 className="text-3xl font-bold text-de-black leading-tight">{selectedCountry}</h3>
                        <p className="text-sm text-gray-500">{getCountryCaseCount(selectedCountry)} Cases Tracked</p>
                     </div>
                </div>

                {stats && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Submission -> Protocol */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 relative group hover:border-blue-200 transition-colors">
                      <div className="flex justify-between items-start mb-4">
                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                              Submission → Protocol
                          </h4>
                          <Clock size={20} className="text-blue-500" />
                      </div>
                      <div className="flex items-baseline gap-2 mb-2">
                          <span className="text-4xl font-bold text-de-black">{formatDuration(stats.protocol.mean, lang)}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div className="bg-blue-500 h-full rounded-full" style={{ width: '40%' }}></div>
                      </div>
                    </div>

                    {/* Protocol -> Approval */}
                    <div className="bg-gradient-to-br from-purple-50 to-white p-6 rounded-xl shadow-sm border border-purple-100 relative group hover:border-purple-300 transition-colors">
                      <div className="flex justify-between items-start mb-4">
                          <h4 className="text-xs font-bold text-purple-700 uppercase tracking-wide">
                              Protocol → Approval
                          </h4>
                          <FileCheck size={20} className="text-purple-500" />
                      </div>
                      <div className="flex items-baseline gap-2 mb-2">
                          <span className="text-4xl font-bold text-de-black">{formatDuration(stats.protoToApp.mean, lang)}</span>
                      </div>
                       <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                          <span>Min: {formatDuration(stats.protoToApp.min, lang)}</span>
                          <span>Max: {formatDuration(stats.protoToApp.max, lang)}</span>
                      </div>
                    </div>

                    {/* Submission -> Approval (Total) */}
                    <div className="md:col-span-2 bg-yellow-50 p-6 rounded-xl shadow-sm border border-yellow-100 relative">
                      <div className="flex justify-between items-start mb-4">
                          <h4 className="text-xs font-bold text-yellow-700 uppercase tracking-wide">
                              Total Time (Submission → Urkunde)
                          </h4>
                          <Globe size={20} className="text-yellow-600" />
                      </div>
                      <div className="flex items-baseline gap-2 mb-2">
                          <span className="text-5xl font-bold text-de-black">{formatDuration(stats.approval.mean, lang)}</span>
                      </div>
                      <div className="text-sm text-yellow-800 bg-yellow-100/50 p-2 rounded inline-block">
                          Based on {stats.approval.count} completed cases.
                      </div>
                    </div>
                  </div>
                )}
             </div>
           )}
        </div>
      </div>
    </div>
  );
};