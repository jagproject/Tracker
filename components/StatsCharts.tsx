import React, { useMemo, useState } from 'react';
import { 
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid 
} from 'recharts';
import { CitizenshipCase, Language, CaseStatus } from '../types';
import { TRANSLATIONS, STATUS_TRANSLATIONS } from '../constants';
import { calculateAdvancedStats, formatDuration, getDaysDiff, formatISODateToLocale } from '../services/statsUtils';
import { Clock, CheckCircle, FileText, Hourglass, BarChart2, XCircle, Award, X } from 'lucide-react';

interface StatsDashboardProps {
  cases: CitizenshipCase[]; // Receiving filtered cases from App.tsx
  userCase?: CitizenshipCase;
  lang: Language;
  loading?: boolean; // Item 5: Loading State
}

const COLORS = ['#000000', '#DD0000', '#FFCC00', '#666666', '#A9A9A9', '#8B0000'];
const STATUS_COLORS = {
  'Enviado': '#A9A9A9', 
  'Aktenzeichen': '#3B82F6', 
  'Docs': '#F59E0B', 
  'Aprobado': '#10B981', 
  'Cerrado': '#EF4444', 
  'Submitted': '#A9A9A9',
  'Protocol': '#3B82F6',
  'Docs Requested': '#F59E0B',
  'Approved': '#10B981',
  'Closed': '#EF4444'
};

const SkeletonCard = () => (
    <div className="bg-white p-5 rounded-xl shadow border border-gray-100 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-8 bg-gray-300 rounded w-1/2"></div>
    </div>
);

const SkeletonChart = () => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-pulse flex flex-col h-80">
        <div className="h-6 bg-gray-200 rounded w-1/4 mb-6"></div>
        <div className="flex-grow bg-gray-100 rounded"></div>
    </div>
);

// Drill Down Modal (Item 6)
const DrillDownModal = ({ title, cases, onClose, statusT, lang }: { title: string, cases: CitizenshipCase[], onClose: () => void, statusT: any, lang: Language }) => (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                <h3 className="font-bold text-de-black">Details: {title} ({cases.length})</h3>
                <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-red-500" /></button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
                {cases.map(c => (
                    <div key={c.id} className="text-sm p-3 border rounded hover:bg-gray-50 flex justify-between items-center">
                        <div>
                            <span className="font-bold block">{c.fantasyName}</span>
                            <span className="text-xs text-gray-500">
                                {c.countryOfApplication} • {formatISODateToLocale(c.submissionDate, lang)}
                            </span>
                        </div>
                        <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                           {statusT[c.status] || c.status}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

export const StatsDashboard: React.FC<StatsDashboardProps> = ({ cases, userCase, lang, loading = false }) => {
  const t = TRANSLATIONS[lang];
  const statusT = STATUS_TRANSLATIONS[lang];
  
  // Drill Down State
  const [drillDownData, setDrillDownData] = useState<{title: string, cases: CitizenshipCase[]} | null>(null);

  const stats = useMemo(() => {
    // Safety check for empty cases
    if (!cases || cases.length === 0) return {
        totalCases: 0,
        approvedCases: 0,
        closedCases: 0,
        avgDaysToProtocol: 0,
        avgDaysToApproval: 0,
        avgDaysTotal: 0,
        waitingStats: { min:0, max:0, mean:0, mode:0, stdDev:0, count:0 },
        byType: [],
        byStatus: []
    };

    const total = cases.length;
    
    // Counters for specific statuses
    const approvedCount = cases.filter(c => c.status === CaseStatus.APPROVED).length;
    const closedCount = cases.filter(c => c.status === CaseStatus.CLOSED).length;

    const typeMap: Record<string, number> = {};
    cases.forEach(c => { typeMap[c.caseType] = (typeMap[c.caseType] || 0) + 1; });
    const byType = Object.keys(typeMap).map(k => ({ name: k, value: typeMap[k] }));

    const statusMap: Record<string, number> = {};
    cases.forEach(c => { statusMap[c.status] = (statusMap[c.status] || 0) + 1; });
    
    const byStatus = Object.keys(statusMap).map(k => {
        const statusKey = k as CaseStatus;
        const localizedName = statusT[statusKey] || k;
        return { name: localizedName, value: statusMap[k], rawStatus: k };
    });
    
    const subToProtocol: number[] = [];
    const protoToApproval: number[] = [];
    const subToApproval: number[] = [];
    const currentWaiting: number[] = [];

    cases.forEach(c => {
      const subDate = c.submissionDate;
      const protoDate = c.protocolDate;
      const appDate = c.approvalDate;

      if (subDate && protoDate) {
        const diff = getDaysDiff(subDate, protoDate);
        if (diff !== null && diff > 0) subToProtocol.push(diff);
      }
      if (protoDate && appDate) {
         const diff = getDaysDiff(protoDate, appDate);
        if (diff !== null && diff > 0) protoToApproval.push(diff);
      }
      if (subDate && appDate) {
         const diff = getDaysDiff(subDate, appDate);
        if (diff !== null && diff > 0) subToApproval.push(diff);
      }
      if (subDate && c.status !== CaseStatus.APPROVED && c.status !== CaseStatus.CLOSED) {
         const diff = getDaysDiff(subDate, new Date().toISOString());
        if (diff !== null && diff > 0) currentWaiting.push(diff);
      }
    });

    const calcMean = (arr: number[]) => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
    return {
      totalCases: total,
      approvedCases: approvedCount,
      closedCases: closedCount,
      avgDaysToProtocol: calcMean(subToProtocol),
      avgDaysToApproval: calcMean(protoToApproval),
      avgDaysTotal: calcMean(subToApproval),
      waitingStats: calculateAdvancedStats(currentWaiting),
      byType,
      byStatus
    };
  }, [cases, statusT]);

  // --- Feature 5: Compare Me Logic ---
  const comparisonData = useMemo(() => {
    if (!userCase || !stats || stats.totalCases === 0) return [];
    
    // Safety check for userCase dates to avoid crashes
    if (!userCase.submissionDate || typeof userCase.submissionDate !== 'string') return [];

    // 1. Calculate User Stats (with fallback to today if approval date missing)
    const safeApproval = userCase.approvalDate || new Date().toISOString();
    const myDiff = getDaysDiff(userCase.submissionDate, safeApproval);
    const myValue = (myDiff !== null && myDiff >= 0) ? Math.round(myDiff) : 0;
    const myLabel = userCase.status === CaseStatus.APPROVED ? "My Time (Total)" : "My Wait (So Far)";

    // 2. Calculate Cohort Stats
    // Ensure we only include valid dates in calculation to prevent NaN
    const cohort = cases.filter(c => 
        c.status === CaseStatus.APPROVED &&
        c.approvalDate && c.submissionDate
    );

    const totalDays = cohort
        .map(c => getDaysDiff(c.submissionDate, c.approvalDate!))
        .filter((d): d is number => d !== null && d > 0);
        
    const avgValue = totalDays.length > 0 ? Math.round(totalDays.reduce((a,b)=>a+b,0)/totalDays.length) : (stats.avgDaysTotal || 0);

    return [
        { name: myLabel, value: myValue, fill: "#FFCC00" },
        { name: `Cohort Avg`, value: avgValue, fill: "#333" }
    ];
  }, [userCase, cases, stats.avgDaysTotal, stats.totalCases]);

  const getStatusColor = (name: string, index: number) => {
    // Defensive check
    if (!name) return COLORS[0];
    if (name.includes('Enviado') || name.includes('Submit') || name.includes('Ein') || name.includes('Inviato')) return STATUS_COLORS['Submitted'];
    if (name.includes('Akten') || name.includes('Proto') || name.includes('AZ')) return STATUS_COLORS['Protocol'];
    if (name.includes('Doc') || name.includes('Unter')) return STATUS_COLORS['Docs Requested'];
    if (name.includes('Aprob') || name.includes('Approv') || name.includes('Urkunde') || name.includes('bürgert')) return STATUS_COLORS['Approved'];
    if (name.includes('Cerrad') || name.includes('Clos') || name.includes('Gesch') || name.includes('Respinto') || name.includes('Rejeitado')) return STATUS_COLORS['Closed'];
    return COLORS[index % COLORS.length];
  };

  // Item 6: Handle Drill Down Click
  const handleStatusClick = (data: any) => {
      if (data && data.payload && data.payload.rawStatus) {
         const status = data.payload.rawStatus;
         const filtered = cases.filter(c => c.status === status);
         setDrillDownData({ title: data.name, cases: filtered });
      }
  };

  const handleTypeClick = (data: any) => {
     if (data && data.name) {
         const type = data.name;
         const filtered = cases.filter(c => c.caseType === type);
         setDrillDownData({ title: type, cases: filtered });
     }
  };

  if (loading) {
      return (
          <div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8 animate-pulse h-40"></div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <SkeletonChart />
                  <SkeletonChart />
              </div>
          </div>
      );
  }

  // Graceful handling of empty data state
  if (!stats || stats.totalCases === 0) {
      return (
          <div className="p-8 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
             <p>{t.noCasesFound || "No cases found for the selected filters."}</p>
          </div>
      );
  }

  return (
    <div>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-5 rounded-xl shadow border-b-4 border-de-black">
            <div className="flex items-center gap-2 mb-2">
                <FileText size={16} className="text-gray-400" />
                <p className="text-xs text-gray-500 font-bold uppercase">{t.totalCases}</p>
            </div>
            <p className="text-2xl font-bold text-de-black">{stats.totalCases}</p>
          </div>
          
          <div className="bg-white p-5 rounded-xl shadow border-b-4 border-green-500">
            <div className="flex items-center gap-2 mb-2">
                <Award size={16} className="text-green-500" />
                <p className="text-xs text-gray-500 font-bold uppercase">{statusT[CaseStatus.APPROVED]}</p>
            </div>
            <p className="text-2xl font-bold text-de-black">{stats.approvedCases}</p>
          </div>

          <div className="bg-white p-5 rounded-xl shadow border-b-4 border-red-500">
            <div className="flex items-center gap-2 mb-2">
                <XCircle size={16} className="text-red-500" />
                <p className="text-xs text-gray-500 font-bold uppercase">{statusT[CaseStatus.CLOSED]}</p>
            </div>
            <p className="text-2xl font-bold text-de-black">{stats.closedCases}</p>
          </div>

          <div className="bg-white p-5 rounded-xl shadow border-b-4 border-blue-500">
            <div className="flex items-center gap-2 mb-2">
                <Clock size={16} className="text-blue-400" />
                <p className="text-xs text-gray-500 font-bold uppercase">{t.avgProtocol}</p>
            </div>
            {/* Format in months/years always */}
            <p className="text-2xl font-bold text-de-black">{formatDuration(stats.avgDaysToProtocol, lang)}</p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow border-b-4 border-de-gold">
             <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={16} className="text-de-gold" />
                <p className="text-xs text-gray-500 font-bold uppercase">{t.avgApproval}</p>
            </div>
            <p className="text-2xl font-bold text-de-black">{formatDuration(stats.avgDaysToApproval, lang)}</p>
          </div>
           <div className="bg-white p-5 rounded-xl shadow border-b-4 border-gray-600">
             <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={16} className="text-gray-600" />
                <p className="text-xs text-gray-500 font-bold uppercase">{t.avgTotal}</p>
            </div>
            <p className="text-2xl font-bold text-de-black">{formatDuration(stats.avgDaysTotal, lang)}</p>
          </div>
      </div>

      {/* Waiting Stats */}
      {stats.waitingStats && stats.waitingStats.count > 0 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
            <h3 className="text-lg font-bold text-de-black mb-4 flex items-center gap-2">
                <Hourglass className="text-de-red" size={20} /> {t.waitTime} ({stats.waitingStats.count})
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                <div className="bg-gray-50 p-4 rounded">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Average</p>
                    <p className="text-xl font-bold text-de-black">{formatDuration(stats.waitingStats.mean, lang)}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">{t.stdDev}</p>
                    <p className="text-xl font-bold text-gray-700">±{formatDuration(stats.waitingStats.stdDev, lang)}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Min</p>
                    <p className="text-xl font-bold text-green-600">{formatDuration(stats.waitingStats.min, lang)}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Max</p>
                    <p className="text-xl font-bold text-de-red">{formatDuration(stats.waitingStats.max, lang)}</p>
                </div>
            </div>
        </div>
      )}

      {/* Feature 5: Compare Me Chart */}
      {userCase && comparisonData.length > 0 && (
         <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
             <h3 className="text-lg font-bold text-de-black mb-4 flex items-center gap-2">
                <BarChart2 className="text-de-gold" size={20} /> {t.compareMe}
             </h3>
             <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={comparisonData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" unit=" days" />
                        <YAxis dataKey="name" type="category" width={150} tick={{fontSize: 12, fontWeight: 'bold'}} />
                        <Tooltip cursor={{fill: '#f9fafb'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Bar dataKey="value" barSize={40}>
                             {comparisonData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                             ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
             </div>
             <p className="text-xs text-gray-400 text-center mt-2">Comparing your timeline against the average approved case in the current view.</p>
         </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <h3 className="text-lg font-bold text-de-black mb-4">{t.caseType}</h3>
          <div className="h-64 w-full flex-grow">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.byType}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  onClick={handleTypeClick}
                  className="cursor-pointer focus:outline-none"
                >
                  {stats.byType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
            <p className="text-center text-xs text-gray-400 mt-2">{t.clickToView}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col">
          <h3 className="text-lg font-bold text-de-black mb-4">{t.statusDist}</h3>
          <div className="h-64 w-full flex-grow">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.byStatus}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                  onClick={handleStatusClick}
                  className="cursor-pointer focus:outline-none"
                >
                  {stats.byStatus.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getStatusColor(entry.name, index)} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
            <p className="text-center text-xs text-gray-400 mt-2">{t.clickToView}</p>
          </div>
        </div>
      </div>

      {drillDownData && (
          <DrillDownModal 
            title={drillDownData.title} 
            cases={drillDownData.cases} 
            onClose={() => setDrillDownData(null)} 
            statusT={statusT}
            lang={lang}
          />
      )}
    </div>
  );
};