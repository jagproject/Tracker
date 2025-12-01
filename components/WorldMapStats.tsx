import React, { useState, useMemo, useEffect } from 'react';
import { CitizenshipCase, Language, CaseStatus } from '../types';
import { getCountryStats, filterActiveCases, formatDuration } from '../services/statsUtils';
import { TRANSLATIONS } from '../constants';
import { Globe, Clock, FileCheck, List, ChevronRight, Search, Gauge, BarChart, X } from 'lucide-react';

interface WorldMapStatsProps {
  cases: CitizenshipCase[];
  lang: Language;
  loading?: boolean;
  selectedCountryFilter: string;
  onSelectCountry: (country: string) => void;
  onSetFilterStatus: (status: string) => void;
}

// Expanded Helper for Flags - Covering ALL Countries in constants.ts
const getCountryFlag = (countryName: string) => {
    const map: Record<string, string> = {
        "Afghanistan": "🇦🇫", "Albania": "🇦🇱", "Algeria": "🇩🇿", "Andorra": "🇦🇩", "Angola": "🇦🇴",
        "Argentina": "🇦🇷", "Armenia": "🇦🇲", "Australia": "🇦🇺", "Austria": "🇦🇹", "Azerbaijan": "🇦🇿",
        "Bahamas": "🇧🇸", "Bahrain": "🇧🇭", "Bangladesh": "🇧🇩", "Barbados": "🇧🇧", "Belarus": "🇧🇾",
        "Belgium": "🇧🇪", "Belize": "🇧🇿", "Benin": "🇧🇯", "Bhutan": "🇧🇹", "Bolivia": "🇧🇴",
        "Bosnia and Herzegovina": "🇧🇦", "Botswana": "🇧🇼", "Brazil": "🇧🇷", "Brunei": "🇧🇳", "Bulgaria": "🇧🇬",
        "Burkina Faso": "🇧🇫", "Burundi": "🇧🇮", "Cabo Verde": "🇨🇻", "Cambodia": "🇰🇭", "Cameroon": "🇨🇲",
        "Canada": "🇨🇦", "Central African Republic": "🇨🇫", "Chad": "🇹🇩", "Chile": "🇨🇱", "China": "🇨🇳",
        "Colombia": "🇨🇴", "Comoros": "🇰🇲", "Congo": "🇨🇬", "Costa Rica": "🇨🇷", "Croatia": "🇭🇷",
        "Cuba": "🇨🇺", "Cyprus": "🇨🇾", "Czech Republic": "🇨🇿", "Denmark": "🇩🇰", "Djibouti": "🇩🇯",
        "Dominica": "🇩🇲", "Dominican Republic": "🇩🇴", "Ecuador": "🇪🇨", "Egypt": "🇪🇬", "El Salvador": "🇸🇻",
        "Equatorial Guinea": "🇬🇶", "Eritrea": "🇪🇷", "Estonia": "🇪🇪", "Eswatini": "🇸🇿", "Ethiopia": "🇪🇹",
        "Fiji": "🇫🇯", "Finland": "🇫🇮", "France": "🇫🇷", "Gabon": "🇬🇦", "Gambia": "🇬🇲", "Georgia": "🇬🇪",
        "Germany": "🇩🇪", "Ghana": "🇬🇭", "Greece": "🇬🇷", "Grenada": "🇬🇩", "Guatemala": "🇬🇹",
        "Guinea": "🇬🇳", "Guinea-Bissau": "🇬🇼", "Guyana": "🇬🇾", "Haiti": "🇭🇹", "Honduras": "🇭🇳",
        "Hungary": "🇭🇺", "Iceland": "🇮🇸", "India": "🇮🇳", "Indonesia": "🇮🇩", "Iran": "🇮🇷", "Iraq": "🇮🇶",
        "Ireland": "🇮🇪", "Israel": "🇮🇱", "Italy": "🇮🇹", "Jamaica": "🇯🇲", "Japan": "🇯🇵", "Jordan": "🇯🇴",
        "Kazakhstan": "🇰🇿", "Kenya": "🇰🇪", "Kiribati": "🇰🇮", "Kosovo": "🇽🇰", "Kuwait": "🇰🇼",
        "Kyrgyzstan": "🇰🇬", "Laos": "🇱🇦", "Latvia": "🇱🇻", "Lebanon": "🇱🇧", "Lesotho": "🇱🇸", "Liberia": "🇱🇷",
        "Libya": "🇱🇾", "Liechtenstein": "🇱🇮", "Lithuania": "🇱🇹", "Luxembourg": "🇱🇺", "Madagascar": "🇲🇬",
        "Malawi": "🇲🇼", "Malaysia": "🇲🇾", "Maldives": "🇲🇻", "Mali": "🇲🇱", "Malta": "🇲🇹", "Marshall Islands": "🇲🇭",
        "Mauritania": "🇲🇷", "Mauritius": "🇲🇺", "Mexico": "🇲🇽", "Micronesia": "🇫🇲", "Moldova": "🇲🇩",
        "Monaco": "🇲🇨", "Mongolia": "🇲🇳", "Montenegro": "🇲🇪", "Morocco": "🇲🇦", "Mozambique": "🇲🇿",
        "Myanmar": "🇲🇲", "Namibia": "🇳🇦", "Nauru": "🇳🇷", "Nepal": "🇳🇵", "Netherlands": "🇳🇱",
        "New Zealand": "🇳🇿", "Nicaragua": "🇳🇮", "Niger": "🇳🇪", "Nigeria": "🇳🇬", "North Macedonia": "🇲🇰",
        "Norway": "🇳🇴", "Oman": "🇴🇲", "Pakistan": "🇵🇰", "Palau": "🇵🇼", "Palestine": "🇵🇸", "Panama": "🇵🇦",
        "Papua New Guinea": "🇵🇬", "Paraguay": "🇵🇾", "Peru": "🇵🇪", "Philippines": "🇵🇭", "Poland": "🇵🇱",
        "Portugal": "🇵🇹", "Qatar": "🇶🇦", "Romania": "🇷🇴", "Russia": "🇷🇺", "Rwanda": "🇷🇼",
        "Saint Kitts and Nevis": "🇰🇳", "Saint Lucia": "🇱🇨", "Saint Vincent and the Grenadines": "🇻🇨",
        "Samoa": "🇼🇸", "San Marino": "🇸🇲", "Sao Tome and Principe": "🇸🇹", "Saudi Arabia": "🇸🇦",
        "Senegal": "🇸🇳", "Serbia": "🇷🇸", "Seychelles": "🇸🇨", "Sierra Leone": "🇸🇱", "Singapore": "🇸🇬",
        "Slovakia": "🇸🇰", "Slovenia": "🇸🇮", "Solomon Islands": "🇸🇧", "Somalia": "🇸🇴", "South Africa": "🇿🇦",
        "South Korea": "🇰🇷", "South Sudan": "🇸🇸", "Spain": "🇪🇸", "Sri Lanka": "🇱🇰", "Sudan": "🇸🇩",
        "Suriname": "🇸🇷", "Sweden": "🇸🇪", "Switzerland": "🇨🇭", "Syria": "🇸🇾", "Taiwan": "🇹🇼",
        "Tajikistan": "🇹🇯", "Tanzania": "🇹🇿", "Thailand": "🇹🇭", "Timor-Leste": "🇹🇱", "Togo": "🇹🇬",
        "Tonga": "🇹🇴", "Trinidad and Tobago": "🇹🇹", "Tunisia": "🇹🇳", "Turkey": "🇹🇷", "Turkmenistan": "🇹🇲",
        "Tuvalu": "🇹🇻", "Uganda": "🇺🇬", "Ukraine": "🇺🇦", "United Arab Emirates": "🇦🇪", "United Kingdom": "🇬🇧",
        "United States": "🇺🇸", "Uruguay": "🇺🇾", "Uzbekistan": "🇺🇿", "Vanuatu": "🇻🇺", "Vatican City": "🇻🇦",
        "Venezuela": "🇻🇪", "Vietnam": "🇻🇳", "Yemen": "🇾🇪", "Zambia": "🇿🇲", "Zimbabwe": "🇿🇼"
    };
    return map[countryName] || "🏳️";
};

// Helper to determine Speed Color
// Updated Logic: Based on Approval Time (Urkunde), not Protocol
const getSpeedColor = (avgDays: number) => {
    // 14 months (~420 days) = Fast
    // 24 months (~730 days) = Slow
    if (avgDays < 425) return "text-green-600 border-green-500 bg-green-50"; 
    if (avgDays < 730) return "text-yellow-600 border-yellow-500 bg-yellow-50";
    return "text-red-600 border-red-500 bg-red-50"; 
};

const SkeletonMap = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-pulse flex flex-col h-[600px]">
        <div className="h-14 bg-gray-800 shrink-0"></div>
        <div className="flex flex-col md:flex-row flex-1">
             <div className="w-full h-40 md:h-auto md:w-1/4 bg-gray-50 border-r border-gray-200 p-4 space-y-4">
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

export const WorldMapStats: React.FC<WorldMapStatsProps> = ({ cases, lang, loading = false, selectedCountryFilter, onSelectCountry, onSetFilterStatus }) => {
  const t = TRANSLATIONS[lang];
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'count' | 'speed'>('count');
  const [localSelected, setLocalSelected] = useState<string | null>(null);

  // Sync local state with parent filter, but treat 'All' as null for detail view
  useEffect(() => {
      setLocalSelected(selectedCountryFilter === 'All' ? null : selectedCountryFilter);
  }, [selectedCountryFilter]);

  // Use full list of cases to populate the country list even if filtered
  // However, the stats inside must reflect the global list. 
  // We actually need the FULL UNFILTERED list to show the directory, 
  // but since we receive 'cases' which might already be filtered by dashboard... 
  // For now, we use the passed 'cases' which is fine as long as we clear filters to see all.
  const activeCases = useMemo(() => filterActiveCases(cases), [cases]);
  
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

  const getCountrySpeed = (country: string) => {
      const stats = getCountryStats(activeCases, country);
      // UPDATED: Use Approval Mean (Urkunde), not Protocol
      return stats.approval.mean; 
  };

  const handleCountryClick = (country: string) => {
      if (selectedCountryFilter === country) {
          onSelectCountry('All'); // Toggle off
      } else {
          onSelectCountry(country); // Set Global Filter
      }
  };

  const handleSwitchMode = (mode: 'count' | 'speed') => {
      setViewMode(mode);
      if (mode === 'speed') {
          // Automatically set Status Filter to Approved
          onSetFilterStatus(CaseStatus.APPROVED);
      } else {
          // Reset Status Filter to All when switching back to Volume (optional but better UX)
          onSetFilterStatus('All');
      }
  };

  // We compute stats for the selected country based on the *active* subset
  const stats = localSelected ? getCountryStats(activeCases, localSelected) : null;

  if (loading) return <SkeletonMap />;

  if (activeCountries.length === 0) {
      return (
         <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500 mb-8 mx-0 sm:mx-0">
            <Globe className="mx-auto mb-2 opacity-50" size={48}/>
            {t.noCasesFound}
         </div>
      );
  }

  return (
    <div className="bg-white rounded-none sm:rounded-xl shadow-sm border-y sm:border border-gray-200 overflow-hidden animate-in fade-in mb-8 flex flex-col h-[600px] mx-0 sm:mx-0">
      <div className="p-4 bg-de-black text-white flex justify-between items-center border-b border-gray-700 shrink-0">
        <h2 className="text-lg font-bold text-de-gold flex items-center gap-2">
            {viewMode === 'count' ? <List size={18} /> : <Gauge size={18} />}
            {viewMode === 'count' ? t.allCountries : t.speedMap}
        </h2>
        
        {/* Toggle Switch */}
        <div className="flex bg-gray-800 rounded p-1">
             <button 
                onClick={() => handleSwitchMode('count')}
                className={`px-3 py-1 rounded text-xs font-bold transition-colors ${viewMode === 'count' ? 'bg-white text-de-black' : 'text-gray-400 hover:text-white'}`}
                title={t.countMap}
             >
                <BarChart size={14} />
             </button>
             <button 
                onClick={() => handleSwitchMode('speed')}
                className={`px-3 py-1 rounded text-xs font-bold transition-colors ${viewMode === 'speed' ? 'bg-white text-de-black' : 'text-gray-400 hover:text-white'}`}
                title={t.speedMap}
             >
                <Gauge size={14} />
             </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Left Column: Country List */}
        <div className="w-full h-48 md:h-auto md:w-1/4 bg-gray-50 border-b md:border-b-0 md:border-r border-gray-200 flex flex-col">
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
                {filteredCountries.map(country => {
                    const count = getCountryCaseCount(country);
                    const speed = getCountrySpeed(country);
                    const speedColorClass = getSpeedColor(speed);
                    const isSelected = selectedCountryFilter === country;

                    return (
                        <button
                            key={country}
                            onClick={() => handleCountryClick(country)}
                            className={`w-full text-left px-4 py-3 text-sm border-b border-gray-100 hover:bg-white transition-colors flex justify-between items-center group ${
                                isSelected ? 'bg-white border-l-4 border-l-de-gold shadow-sm font-bold text-de-black' : 'text-gray-600 border-l-4 border-l-transparent'
                            }`}
                        >
                            <span className="truncate mr-2 flex items-center gap-2">
                                <span>{getCountryFlag(country)}</span>
                                {country}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                                {viewMode === 'count' ? (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${isSelected ? 'bg-de-gold text-de-black' : 'bg-gray-200 text-gray-600'}`}>{count}</span>
                                ) : (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${speed > 0 ? speedColorClass : 'bg-gray-100 text-gray-400'}`}>
                                        {speed > 0 ? formatDuration(speed, lang) : '--'}
                                    </span>
                                )}
                                {isSelected && <ChevronRight size={14} className="text-de-gold" />}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>

        {/* Right Column: Details */}
        <div className="flex-1 bg-white overflow-y-auto p-4 md:p-6 relative">
             {!localSelected ? (
             <div className="h-full flex flex-col items-center justify-center text-gray-400 text-center p-8">
                <Globe size={64} className="mb-4 text-gray-100" />
                <p className="text-de-black font-bold mb-2">{t.country}</p>
                <p className="max-w-xs text-sm">{t.mapInstructions}</p>
             </div>
           ) : (
             <div className="animate-in slide-in-from-right-4 fade-in max-w-2xl mx-auto">
                {/* Header with Clear Filter */}
                <div className="flex justify-between items-start mb-8 border-b pb-4">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-500 text-3xl shadow-inner shrink-0">
                            {getCountryFlag(localSelected)}
                        </div>
                        <div>
                            <h3 className="text-3xl font-bold text-de-black leading-tight">{localSelected}</h3>
                            <p className="text-sm text-gray-500">{getCountryCaseCount(localSelected)} Cases Tracked</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => onSelectCountry('All')}
                        className="text-gray-400 hover:text-red-500 p-2 rounded-full hover:bg-gray-100 transition-colors"
                        title="Clear Filter"
                    >
                        <X size={20} />
                    </button>
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
                      {viewMode === 'speed' && (
                          <div className="mt-2 text-[10px] text-gray-400">
                             Rating: <span className={getSpeedColor(stats.protocol.mean).split(' ')[0]}>{stats.protocol.mean < 120 ? t.fast : t.slow}</span>
                          </div>
                      )}
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
                      {viewMode === 'speed' && (
                          <div className="mt-4 text-xs font-bold">
                             Global Speed Rating: <span className={`px-2 py-1 rounded border ${getSpeedColor(stats.approval.mean)}`}>
                                 {stats.approval.mean < 425 ? "FAST ⚡" : stats.approval.mean < 730 ? "MEDIUM 🐢" : "SLOW 🐌"}
                             </span>
                          </div>
                      )}
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