import React, { useMemo, useState } from 'react';
import { 
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, LabelList, Sankey
} from 'recharts';
import { CitizenshipCase, Language, CaseStatus } from '../types';
import { TRANSLATIONS, STATUS_TRANSLATIONS } from '../constants';
import { calculateAdvancedStats, formatDuration, getDaysDiff, formatISODateToLocale } from '../services/statsUtils';
import { Clock, CheckCircle, FileText, Hourglass, BarChart2, XCircle, Award, X, TrendingUp, TrendingDown, Minus, GitMerge } from 'lucide-react';

interface StatsDashboardProps {
  cases: CitizenshipCase[]; // Receiving filtered cases from App.tsx
  userCase?: CitizenshipCase;
  lang: Language;
  loading?: boolean; 
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
    <div className="bg-white p-3 sm:p-5 rounded-xl shadow border border-gray-100 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-8 bg-gray-300 rounded w-1/2"></div>
    </div>
);

const SkeletonChart = () => (
    <div className="bg-white p-3 sm:p-6 rounded-xl shadow-sm border border-gray-200 animate-pulse flex flex-col h-80">
        <div className="h-6 bg-gray-200 rounded w-1/4 mb-6"></div>
        <div className="flex-grow bg-gray-100 rounded"></div>
    </div>
);

// Drill Down Modal
const DrillDownModal = ({ title, cases, onClose, statusT, lang, t }: { title: string, cases: CitizenshipCase[], onClose: () => void, statusT: any, lang: Language, t: any }) => (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white text-gray-900 rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                <h3 className="font-bold text-de-black">{t.details || 'Details'}: {title} ({cases.length})</h3>
                <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-red-500" /></button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
                {cases.map(c => (
                    <div key={c.id} className="text-sm p-3 border rounded hover:bg-gray-50 flex justify-between items-center text-gray-900">
                        <div>
                            <span className="font-bold block text-de-black">{c.fantasyName}</span>
                            <span className="text-xs text-gray-500">
                                {c.countryOfApplication} • {formatISODateToLocale(c.submissionDate, lang)}
                            </span>
                        </div>
                        <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-700">
                           {statusT[c.status] || c.status}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    </div>
);

// --- Feature: Case Flow (Sankey) Diagram ---
const CaseFlowDiagram = ({ cases, lang }: { cases: CitizenshipCase[], lang: Language }) => {
    const t = TRANSLATIONS[lang];
    
    // Construct Sankey Data
    const data = useMemo(() => {
        const total = cases.length;
        if (total === 0) return { nodes: [], links: [] };

        const submitted = cases.filter(c => c.status === CaseStatus.SUBMITTED).length;
        const protocol = cases.filter(c => c.status === CaseStatus.PROTOCOL_RECEIVED).length;
        const docs = cases.filter(c => c.status === CaseStatus.ADDITIONAL_DOCS).length;
        const approved = cases.filter(c => c.status === CaseStatus.APPROVED).length;
        const closed = cases.filter(c => c.status === CaseStatus.CLOSED).length;

        // Colors
        // Total (Gray), Submitted (Blue), Protocol (Yellow), Approved (Green), Closed (Red)
        const COLOR_TOTAL = "#9ca3af";
        const COLOR_SUB = "#3B82F6"; // Blue
        const COLOR_PROTO = "#F59E0B"; // Yellow/Orange
        const COLOR_PROC = "#8B5CF6"; // Purple (Intermediate)
        const COLOR_APP = "#10B981"; // Green
        const COLOR_CLOSE = "#EF4444"; // Red

        // Count Logic
        const countWithProtocol = protocol + docs + approved + closed;
        const countDecided = approved + closed;
        const countInProcess = protocol + docs;

        const nodes = [
            { name: t.totalCases || "Total", fill: COLOR_TOTAL },        // 0
            { name: t.flowSubmitted || "Submitted", fill: COLOR_SUB },   // 1
            { name: t.flowProtocol || "Protocol", fill: COLOR_PROTO },   // 2
            { name: t.flowInProcess || "Processing", fill: COLOR_PROC }, // 3
            { name: t.flowDecision || "Decision", fill: COLOR_PROC },    // 4
            { name: t.flowApproved || "Approved", fill: COLOR_APP },     // 5
            { name: t.flowClosed || "Closed", fill: COLOR_CLOSE }        // 6
        ];

        const links = [];
        
        // Total -> Submitted (Blue Link)
        if (submitted > 0) links.push({ source: 0, target: 1, value: submitted, fill: COLOR_SUB });
        
        // Total -> With Protocol (Yellow Link)
        if (countWithProtocol > 0) links.push({ source: 0, target: 2, value: countWithProtocol, fill: COLOR_PROTO });

        // With Protocol -> In Process (Yellow Link)
        if (countInProcess > 0) links.push({ source: 2, target: 3, value: countInProcess, fill: COLOR_PROTO });
        
        // With Protocol -> Decision (Yellow Link - transition)
        if (countDecided > 0) links.push({ source: 2, target: 4, value: countDecided, fill: COLOR_PROTO });

        // Decision -> Approved (Green Link)
        if (approved > 0) links.push({ source: 4, target: 5, value: approved, fill: COLOR_APP });
        
        // Decision -> Closed (Red Link)
        if (closed > 0) links.push({ source: 4, target: 6, value: closed, fill: COLOR_CLOSE });

        return { nodes, links };
    }, [cases, t]);

    if (data.nodes.length === 0) return null;

    return (
        <div className="bg-white p-2 sm:p-6 rounded-none sm:rounded-xl shadow-sm border-y sm:border border-gray-200 mb-8 -mx-0 sm:mx-0">
            <h3 className="text-lg font-bold text-de-black mb-4 px-4 sm:px-0 pt-4 sm:pt-0 flex items-center gap-2">
                <GitMerge className="text-de-black" size={20} /> {t.caseFlow}
            </h3>
            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <Sankey
                        data={data}
                        node={{ stroke: '#000', strokeWidth: 0 }}
                        nodePadding={50}
                        margin={{ left: 10, right: 10, top: 10, bottom: 10 }}
                        link={{ strokeOpacity: 0.4 }}
                    >
                        <Tooltip />
                    </Sankey>
                </ResponsiveContainer>
            </div>
            <p className="text-center text-xs text-gray-400 mt-2">
                <span className="text-blue-500 font-bold">Blue: Submitted</span> • 
                <span className="text-yellow-500 font-bold mx-2">Yellow: Protocol</span> • 
                <span className="text-green-500 font-bold">Green: Urkunde</span>
            </p>
        </div>
    );
};

// Feature 7: Wait Time Distribution Chart
const WaitTimeDistribution = ({ cases, userCase, t, lang }: { cases: CitizenshipCase[], userCase?: CitizenshipCase, t: any, lang: Language }) => {
    const data = useMemo(() => {
        // Collect Wait Times for APPROVED cases (Total Time)
        const durations = cases
            .filter(c => c.status === CaseStatus.APPROVED && c.submissionDate && c.approvalDate)
            .map(c => getDaysDiff(c.submissionDate, c.approvalDate!))
            .filter((d): d is number => d !== null && d > 0)
            .map(days => Math.round(days / 30.44)); // Convert to months

        if (durations.length === 0) return [];

        // Determine bucket range (e.g. 0-6, 7-12, etc.)
        const maxDuration = Math.max(...durations);
        const buckets: Record<string, number> = {};
        const range = 3; // 3 month buckets

        // Initialize Buckets
        for(let i=0; i <= maxDuration + range; i+=range) {
            buckets[`${i}-${i+range}`] = 0;
        }

        durations.forEach(m => {
            const bucketIndex = Math.floor(m / range) * range;
            const key = `${bucketIndex}-${bucketIndex+range}`;
            buckets[key] = (buckets[key] || 0) + 1;
        });

        // Determine User's Position
        let userBucket = null;
        if (userCase && userCase.submissionDate) {
            let myMonths = 0;
            if (userCase.status === CaseStatus.APPROVED && userCase.approvalDate) {
                myMonths = Math.round(getDaysDiff(userCase.submissionDate, userCase.approvalDate)! / 30.44);
            } else {
                // If waiting, just show current wait
                myMonths = Math.round(getDaysDiff(userCase.submissionDate, new Date().toISOString())! / 30.44);
            }
            const bucketIndex = Math.floor(myMonths / range) * range;
            userBucket = `${bucketIndex}-${bucketIndex+range}`;
        }

        return Object.entries(buckets).map(([name, count]) => ({
            name,
            count,
            isUser: name === userBucket
        }));
    }, [cases, userCase]);

    if (data.length === 0) return null;

    // Custom Tooltip for Clarity
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg text-xs">
                    <p className="font-bold text-gray-800">{payload[0].value} approved cases</p>
                    <p className="text-gray-500">Waited {label} months</p>
                    {payload[0].payload.isUser && (
                        <p className="text-de-gold font-bold mt-1">⭐ You are in this range!</p>
                    )}
                </div>
            );
        }
        return null;
    };

    const title = lang === 'es' ? "Tiempos de Aprobación (Histograma)" : "Approval Times (Histogram)";
    const subtitle = lang === 'es' ? "Distribución de casos aprobados por meses de espera." : "Distribution of approved cases by waiting months.";
    const xAxisLabel = lang === 'es' ? "Meses de Espera" : "Months Waited";

    return (
        <div className="bg-white p-4 sm:p-6 rounded-none sm:rounded-xl shadow-sm border-y sm:border border-gray-200 mb-8 -mx-0 sm:mx-0">
            <h3 className="text-lg font-bold text-de-black flex items-center gap-2">
                <TrendingUp size={20} className="text-blue-500" /> {title}
            </h3>
            <p className="text-xs text-gray-400 mb-4 ml-7">{subtitle}</p>

            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis 
                            dataKey="name" 
                            tick={{fontSize: 10}} 
                            label={{ value: xAxisLabel, position: 'insideBottom', offset: -10, fontSize: 10, fill: '#666' }} 
                        />
                        <YAxis />
                        <Tooltip content={<CustomTooltip />} cursor={{fill: '#f9fafb'}} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                             {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.isUser ? '#FFCC00' : '#d1d5db'} />
                             ))}
                             <LabelList dataKey="count" position="top" style={{fontSize: 10}} />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div className="flex justify-center items-center gap-4 mt-2 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-gray-300 rounded-sm"></span> {lang === 'es' ? 'Comunidad' : 'Community'}
                </div>
                {userCase && (
                    <div className="flex items-center gap-1">
                        <span className="w-3 h-3 bg-de-gold rounded-sm"></span> {lang === 'es' ? 'Tú (o tu rango)' : 'You (or your range)'}
                    </div>
                )}
            </div>
        </div>
    );
};

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
        byStatus: [],
        trendDirection: 'Stable'
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
    const recentApprovals: number[] = [];

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

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
        if (diff !== null && diff > 0) {
            subToApproval.push(diff);
            
            // Collect Recent Trend Data
            if (new Date(appDate) > ninetyDaysAgo) {
                recentApprovals.push(diff);
            }
        }
      }
      if (subDate && c.status !== CaseStatus.APPROVED && c.status !== CaseStatus.CLOSED) {
         const diff = getDaysDiff(subDate, new Date().toISOString());
        if (diff !== null && diff > 0) currentWaiting.push(diff);
      }
    });

    const calcMean = (arr: number[]) => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
    
    const overallAvg = calcMean(subToApproval);
    const recentAvg = calcMean(recentApprovals);
    
    let trendDirection = 'Stable';
    if (recentApprovals.length > 0) {
        if (recentAvg < overallAvg * 0.95) trendDirection = 'Faster';
        else if (recentAvg > overallAvg * 1.05) trendDirection = 'Slower';
    }

    return {
      totalCases: total,
      approvedCases: approvedCount,
      closedCases: closedCount,
      avgDaysToProtocol: calcMean(subToProtocol),
      avgDaysToApproval: calcMean(protoToApproval),
      avgDaysTotal: overallAvg,
      waitingStats: calculateAdvancedStats(currentWaiting),
      byType,
      byStatus,
      trendDirection
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
    const myDays = (myDiff !== null && myDiff >= 0) ? Math.round(myDiff) : 0;
    // CONVERT TO MONTHS (30.44 days per month)
    const myMonths = parseFloat((myDays / 30.44).toFixed(1));

    const myLabel = userCase.status === CaseStatus.APPROVED ? t.compareMyTime : t.compareMyWait;

    // 2. Calculate Cohort Stats
    // Ensure we only include valid dates in calculation to prevent NaN
    const cohort = cases.filter(c => 
        c.status === CaseStatus.APPROVED &&
        c.approvalDate && c.submissionDate
    );

    const totalDays = cohort
        .map(c => getDaysDiff(c.submissionDate, c.approvalDate!))
        .filter((d): d is number => d !== null && d > 0);
        
    const avgDays = totalDays.length > 0 ? Math.round(totalDays.reduce((a,b)=>a+b,0)/totalDays.length) : (stats.avgDaysTotal || 0);
    const avgMonths = parseFloat((avgDays / 30.44).toFixed(1));

    return [
        { name: myLabel, value: myMonths, fill: "#FFCC00" },
        { name: t.compareCohortAvg, value: avgMonths, fill: "#333" }
    ];
  }, [userCase, cases, stats.avgDaysTotal, stats.totalCases, t]);

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
          <div className="mx-0 sm:mx-0">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
              <div className="bg-white p-3 sm:p-6 rounded-xl shadow-sm border border-gray-200 mb-8 animate-pulse h-40"></div>
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
          <div className="p-8 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-300 mx-0 sm:mx-0">
             <p>{t.noCasesFound || "No cases found for the selected filters."}</p>
          </div>
      );
  }

  return (
    <div className="mx-0 sm:mx-0">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 px-2 sm:px-0">
          <div className="bg-white p-3 sm:p-5 rounded-xl shadow border-b-4 border-de-black">
            <div className="flex items-center gap-2 mb-2">
                <FileText size={16} className="text-gray-400" />
                <p className="text-xs text-gray-500 font-bold uppercase">{t.totalCases}</p>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-de-black">{stats.totalCases}</p>
          </div>
          
          <div className="bg-white p-3 sm:p-5 rounded-xl shadow border-b-4 border-green-500">
            <div className="flex items-center gap-2 mb-2">
                <Award size={16} className="text-green-500" />
                <p className="text-xs text-gray-500 font-bold uppercase">{statusT[CaseStatus.APPROVED]}</p>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-de-black">{stats.approvedCases}</p>
          </div>

          <div className="bg-white p-3 sm:p-5 rounded-xl shadow border-b-4 border-gray-600 relative">
             <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={16} className="text-gray-600" />
                <p className="text-xs text-gray-500 font-bold uppercase">{t.avgTotal}</p>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-de-black">{formatDuration(stats.avgDaysTotal, lang)}</p>
            
            {/* Trend Indicator */}
            {stats.trendDirection !== 'Stable' && (
                <div className={`absolute top-4 right-4 text-xs font-bold px-2 py-1 rounded flex items-center gap-1 ${stats.trendDirection === 'Faster' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {stats.trendDirection === 'Faster' ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                    {stats.trendDirection === 'Faster' ? t.trendFaster : t.trendSlower}
                </div>
            )}
            {stats.trendDirection === 'Stable' && (
                <div className="absolute top-4 right-4 text-xs font-bold px-2 py-1 rounded bg-gray-100 text-gray-500 flex items-center gap-1">
                    <Minus size={14} /> {t.trendStable}
                </div>
            )}
          </div>

          <div className="bg-white p-3 sm:p-5 rounded-xl shadow border-b-4 border-blue-500">
            <div className="flex items-center gap-2 mb-2">
                <Clock size={16} className="text-blue-400" />
                <p className="text-xs text-gray-500 font-bold uppercase">{t.avgProtocol}</p>
            </div>
            {/* Format in months/years always */}
            <p className="text-xl sm:text-2xl font-bold text-de-black">{formatDuration(stats.avgDaysToProtocol, lang)}</p>
          </div>
          <div className="bg-white p-3 sm:p-5 rounded-xl shadow border-b-4 border-de-gold">
             <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={16} className="text-de-gold" />
                <p className="text-xs text-gray-500 font-bold uppercase">{t.avgApproval}</p>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-de-black">{formatDuration(stats.avgDaysToApproval, lang)}</p>
          </div>
           
           <div className="bg-white p-3 sm:p-5 rounded-xl shadow border-b-4 border-red-500">
            <div className="flex items-center gap-2 mb-2">
                <XCircle size={16} className="text-red-500" />
                <p className="text-xs text-gray-500 font-bold uppercase">{statusT[CaseStatus.CLOSED]}</p>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-de-black">{stats.closedCases}</p>
          </div>
      </div>

      {/* Feature 7: Wait Time Distribution */}
      <WaitTimeDistribution cases={cases} userCase={userCase} t={t} lang={lang} />

      {/* Feature: Sankey Diagram */}
      <CaseFlowDiagram cases={cases} lang={lang} />

      {/* Waiting Stats */}
      {stats.waitingStats && stats.waitingStats.count > 0 && (
        <div className="bg-white p-4 sm:p-6 rounded-none sm:rounded-xl shadow-sm border-y sm:border border-gray-200 mb-8 -mx-0 sm:mx-0">
            <h3 className="text-lg font-bold text-de-black mb-4 flex items-center gap-2">
                <Hourglass className="text-de-red" size={20} /> {t.waitTime} ({stats.waitingStats.count})
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                <div className="bg-gray-50 p-4 rounded">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">{t.waitingAverage}</p>
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

      {/* Feature 5 (Previous): Compare Me Chart */}
      {userCase && comparisonData.length > 0 && (
         <div className="bg-white p-4 sm:p-6 rounded-none sm:rounded-xl shadow-sm border-y sm:border border-gray-200 mb-8 -mx-0 sm:mx-0">
             <h3 className="text-lg font-bold text-de-black mb-4 flex items-center gap-2">
                <BarChart2 className="text-de-gold" size={20} /> {t.compareMe}
             </h3>
             <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={comparisonData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" unit={" " + t.months} />
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
             <p className="text-xs text-gray-400 text-center mt-2">{t.compareDesc}</p>
         </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-2 sm:p-6 rounded-none sm:rounded-xl shadow-sm border-y sm:border border-gray-200 flex flex-col h-auto min-h-[350px] -mx-0 sm:mx-0">
          <h3 className="text-lg font-bold text-de-black mb-4 px-4 sm:px-0 pt-4 sm:pt-0">{t.caseType}</h3>
          <div className="h-64 w-full flex-grow">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie
                  data={stats.byType}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius="75%"
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
                <Legend verticalAlign="bottom" height={60} wrapperStyle={{ fontSize: '11px', lineHeight: '14px', overflowY: 'auto' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-2 sm:p-6 rounded-none sm:rounded-xl shadow-sm border-y sm:border border-gray-200 flex flex-col h-auto min-h-[350px] -mx-0 sm:mx-0">
          <h3 className="text-lg font-bold text-de-black mb-4 px-4 sm:px-0 pt-4 sm:pt-0">{t.statusDist}</h3>
          <div className="h-64 w-full flex-grow">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie
                  data={stats.byStatus}
                  cx="50%"
                  cy="50%"
                  outerRadius="75%"
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
                <Legend verticalAlign="bottom" height={60} wrapperStyle={{ fontSize: '11px', lineHeight: '14px', overflowY: 'auto' }} />
              </PieChart>
            </ResponsiveContainer>
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
            t={t}
          />
      )}
    </div>
  );
};