import React, { useMemo, useState, useEffect } from 'react';
import { 
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, LineChart, Line, Sankey, Rectangle, Layer
} from 'recharts';
import { CitizenshipCase, Language, CaseStatus } from '../types';
import { TRANSLATIONS, STATUS_TRANSLATIONS } from '../constants';
import { calculateAdvancedStats, formatDuration, getDaysDiff, formatISODateToLocale } from '../services/statsUtils';
import { Clock, CheckCircle, FileText, Hourglass, BarChart2, XCircle, Award, X, TrendingUp, TrendingDown, Minus, Filter, GitMerge, ListFilter } from 'lucide-react';
import { InfoTip } from './ui/InfoTip';
import { motion, AnimatePresence } from 'framer-motion';
import { useInView } from 'react-intersection-observer';

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

// --- Lazy Loader Component ---
const LazyLoad: React.FC<{ children: React.ReactNode, height?: string }> = ({ children, height = '300px' }) => {
    const { ref, inView } = useInView({
        triggerOnce: true,
        rootMargin: '100px 0px', // Preload 100px before appearing
    });

    return (
        <div ref={ref} style={{ minHeight: height }} className="w-full">
            {inView ? (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    {children}
                </motion.div>
            ) : (
                <div className="w-full h-full bg-gray-50/50 animate-pulse rounded-xl" />
            )}
        </div>
    );
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
        <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white text-gray-900 rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col" 
            onClick={e => e.stopPropagation()}
        >
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
        </motion.div>
    </div>
);

// --- Feature: Sankey Chart (Interactive) ---
const CaseSankeyChart = ({ cases, lang }: { cases: CitizenshipCase[], lang: Language }) => {
    const t = TRANSLATIONS[lang];
    const statusT = STATUS_TRANSLATIONS[lang];
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const data = useMemo(() => {
        if (!cases.length) return { nodes: [], links: [] };

        // Constants for nodes
        const TOTAL_NODE = 0;
        const PROCESSING_NODE = 1;
        const DECISION_NODE = 2;
        const SUBMITTED_NODE = 3;
        const PROTOCOL_NODE = 4;
        const APPROVED_NODE = 5;
        const CLOSED_NODE = 6;

        const nodes = [
            { name: t.totalCases, fill: '#1F2937' },      // 0: Dark Gray
            { name: t.flowInProcess, fill: '#3B82F6' },   // 1: Blue
            { name: t.flowDecision, fill: '#10B981' },    // 2: Green
            { name: statusT[CaseStatus.SUBMITTED], fill: '#9CA3AF' }, // 3: Gray
            { name: statusT[CaseStatus.PROTOCOL_RECEIVED], fill: '#F59E0B' }, // 4: Amber/Gold
            { name: statusT[CaseStatus.APPROVED], fill: '#059669' }, // 5: Emerald
            { name: statusT[CaseStatus.CLOSED], fill: '#EF4444' } // 6: Red
        ];

        let submittedCount = 0;
        let protocolCount = 0;
        let approvedCount = 0;
        let closedCount = 0;

        cases.forEach(c => {
            if (c.status === CaseStatus.APPROVED) approvedCount++;
            else if (c.status === CaseStatus.CLOSED) closedCount++;
            else if (c.status === CaseStatus.SUBMITTED) submittedCount++;
            else protocolCount++; // Includes PROTOCOL_RECEIVED and ADDITIONAL_DOCS
        });

        const inProgressTotal = submittedCount + protocolCount;
        const finishedTotal = approvedCount + closedCount;

        const links = [
            // Level 1: Total -> Processing / Decision
            { source: TOTAL_NODE, target: PROCESSING_NODE, value: inProgressTotal },
            { source: TOTAL_NODE, target: DECISION_NODE, value: finishedTotal },

            // Level 2: Processing -> Specifics
            { source: PROCESSING_NODE, target: SUBMITTED_NODE, value: submittedCount },
            { source: PROCESSING_NODE, target: PROTOCOL_NODE, value: protocolCount },

            // Level 2: Decision -> Specifics
            { source: DECISION_NODE, target: APPROVED_NODE, value: approvedCount },
            { source: DECISION_NODE, target: CLOSED_NODE, value: closedCount },
        ];

        return {
            nodes,
            links: links.filter(l => l.value > 0)
        };
    }, [cases, t, statusT]);

    if (!data.nodes.length || !data.links.length) return null;

    // Custom Node Renderer
    const renderSankeyNode = ({ x, y, width, height, index, payload, containerWidth }: any) => {
        // Assume Index 0 (Total) is Left, everything else propagates to Right
        const isLeftNode = index === 0;
        const percent = ((payload.value / cases.length) * 100).toFixed(1);
        
        return (
            <Layer key={`sankey-node-${index}`}>
                <Rectangle
                    x={x} y={y} width={width} height={height}
                    fill={payload.fill || '#8884d8'}
                    fillOpacity={1}
                    radius={[4, 4, 4, 4]}
                />
                {/* Value Number (Vertical inside bar) */}
                {payload.value > 0 && height > 24 && (
                    <text
                        x={x + width / 2}
                        y={y + height / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        transform={`rotate(270, ${x + width / 2}, ${y + height / 2})`}
                        className="text-xs font-bold fill-white pointer-events-none drop-shadow-md select-none"
                        style={{ fontSize: '11px', fontWeight: 'bold', fill: '#fff', textShadow: '0px 1px 2px rgba(0,0,0,0.8)' }}
                    >
                        {payload.value}
                    </text>
                )}
                
                {/* External Label (Name + %) */}
                {/* Logic: Total on Left, Others on Right */}
                <text
                    textAnchor={isLeftNode ? 'end' : 'start'}
                    x={isLeftNode ? x - 8 : x + width + 8}
                    y={y + height / 2}
                    dominantBaseline="middle"
                    fontSize="11"
                    fill="#374151"
                    fontWeight="bold"
                >
                    {payload.name} ({percent}%)
                </text>
            </Layer>
        );
    };

    // Custom Tooltip
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            // Differentiate between Node and Link
            if (data.source && data.target) {
                // Link Hover
                return (
                    <div className="bg-white p-2 border border-gray-200 shadow-xl rounded-lg text-xs z-50">
                        <span className="font-bold text-gray-500">{data.source.name}</span>
                        <span className="mx-2 text-gray-300">→</span>
                        <span className="font-bold text-de-black">{data.target.name}</span>
                        <div className="mt-1 font-bold text-lg text-blue-600">{data.value} cases</div>
                    </div>
                );
            } else {
                // Node Hover
                return (
                    <div className="bg-white p-3 border border-gray-200 shadow-xl rounded-lg text-xs z-50 min-w-[150px]">
                        <div className="font-bold text-sm text-de-black mb-1 flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{background: data.fill}}></div>
                            {data.name}
                        </div>
                        <div className="flex justify-between items-center mt-2 border-t pt-2 border-gray-100">
                            <span className="text-gray-500">Count:</span>
                            <span className="font-bold text-base">{data.value}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-500">Share:</span>
                            <span className="font-mono text-gray-700">{((data.value / cases.length) * 100).toFixed(1)}%</span>
                        </div>
                    </div>
                );
            }
        }
        return null;
    };

    return (
        <div className="bg-white p-2 sm:p-6 rounded-none sm:rounded-xl shadow-sm border-y sm:border border-gray-200 mb-8 -mx-0 sm:mx-0">
            <h3 className="text-lg font-bold text-de-black mb-6 px-4 sm:px-0 pt-4 sm:pt-0 flex items-center gap-2">
                <ListFilter className="text-de-black" size={20} /> {t.caseFlow || "Case Flow (Sankey)"}
            </h3>
            <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <Sankey
                        data={data}
                        node={renderSankeyNode}
                        link={{ stroke: '#E5E7EB', strokeOpacity: 0.4 }} // Subtle links
                        nodePadding={40}
                        // Increased margins to allow labels to sit outside the chart area
                        margin={isMobile ? { left: 10, right: 10, top: 10, bottom: 10 } : { left: 100, right: 180, top: 20, bottom: 20 }}
                    >
                        <Tooltip content={<CustomTooltip />} />
                    </Sankey>
                </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-4 mt-4 px-4">
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]"></span> {t.flowInProcess}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]"></span> {t.flowDecision}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]"></span> {statusT[CaseStatus.PROTOCOL_RECEIVED]}
                </div>
            </div>
        </div>
    );
};

// --- Feature: Year Over Year (YoY) Chart ---
const YearOverYearChart = ({ cases, lang }: { cases: CitizenshipCase[], lang: Language }) => {
    const t = TRANSLATIONS[lang];
    
    // Process Data: Cumulative Approval % by Month for each Year
    const data = useMemo(() => {
        const yearsOfInterest = [2021, 2022, 2023, 2024];
        const monthBuckets: Record<number, Record<string, number>> = {};
        const maxMonths = 36; // Show up to 3 years curve

        // Initialize buckets
        for(let i=0; i <= maxMonths; i++) {
            monthBuckets[i] = { month: i };
            yearsOfInterest.forEach(y => monthBuckets[i][y] = 0);
        }

        yearsOfInterest.forEach(year => {
            const cohort = cases.filter(c => {
                 if (!c.submissionDate) return false;
                 return new Date(c.submissionDate).getFullYear() === year;
            });
            
            const totalInCohort = cohort.length;
            if (totalInCohort < 5) return; // Skip tiny cohorts to avoid noise

            const approvedCases = cohort.filter(c => c.status === CaseStatus.APPROVED && c.approvalDate && c.submissionDate);
            
            // Map approval times
            const approvalTimes = approvedCases.map(c => {
                const diff = getDaysDiff(c.submissionDate, c.approvalDate!);
                return diff !== null && diff > 0 ? Math.floor(diff / 30.44) : null;
            }).filter((d): d is number => d !== null);

            // Calculate Cumulative Counts
            let cumulativeCount = 0;
            for(let m=0; m <= maxMonths; m++) {
                const approvedInThisMonth = approvalTimes.filter(t => t === m).length;
                cumulativeCount += approvedInThisMonth;
                const percentage = (cumulativeCount / totalInCohort) * 100;
                monthBuckets[m][year] = parseFloat(percentage.toFixed(1));
            }
        });

        return Object.values(monthBuckets);

    }, [cases]);

    if (data.length === 0) return null;

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg text-xs">
                    <p className="font-bold text-gray-800 mb-2">{label} {t.monthsSinceSub || "Months"}</p>
                    {payload.map((p: any) => (
                         <div key={p.dataKey} className="flex justify-between gap-4" style={{color: p.color}}>
                             <span className="font-bold">{p.dataKey}</span>
                             <span>{p.value}%</span>
                         </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="bg-white p-2 sm:p-6 rounded-none sm:rounded-xl shadow-sm border-y sm:border border-gray-200 mb-8 -mx-0 sm:mx-0">
             <h3 className="text-lg font-bold text-de-black mb-4 px-4 sm:px-0 pt-4 sm:pt-0 flex items-center gap-2">
                <GitMerge className="text-purple-600" size={20} /> {t.yoyTitle || "Year over Year Performance"}
            </h3>
            <p className="text-xs text-gray-400 mb-4 px-4 sm:px-0">
                {t.yoyDesc || "Comparison of approval speed (cumulative %) by submission year."}
            </p>
            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis 
                            dataKey="month" 
                            type="number" 
                            tick={{fontSize: 10}}
                            label={{ value: t.months || 'Months', position: 'insideBottom', offset: -5, fontSize: 10 }} 
                        />
                        <YAxis 
                            unit="%" 
                            width={40} 
                            tick={{fontSize: 10}}
                            domain={[0, 100]}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend verticalAlign="top" height={36} iconSize={10} wrapperStyle={{fontSize: '10px'}} />
                        <Line type="monotone" dataKey="2021" stroke="#A9A9A9" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                        <Line type="monotone" dataKey="2022" stroke="#000000" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="2023" stroke="#DD0000" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="2024" stroke="#FFCC00" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
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
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 }} className="bg-white p-3 sm:p-5 rounded-xl shadow border-b-4 border-de-black">
            <div className="flex items-center gap-2 mb-2">
                <FileText size={16} className="text-gray-400" />
                <p className="text-xs text-gray-500 font-bold uppercase">{t.totalCases}</p>
                <InfoTip content={t.tooltipTotalCases} />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-de-black">{stats.totalCases}</p>
          </motion.div>
          
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="bg-white p-3 sm:p-5 rounded-xl shadow border-b-4 border-green-500">
            <div className="flex items-center gap-2 mb-2">
                <Award size={16} className="text-green-500" />
                <p className="text-xs text-gray-500 font-bold uppercase">{statusT[CaseStatus.APPROVED]}</p>
                <InfoTip content={t.tooltipApproved} />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-de-black">{stats.approvedCases}</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }} className="bg-white p-3 sm:p-5 rounded-xl shadow border-b-4 border-gray-600 relative">
             <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={16} className="text-gray-600" />
                <p className="text-xs text-gray-500 font-bold uppercase">{t.avgTotal}</p>
                <InfoTip content={t.tooltipAvgTotal} />
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
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} className="bg-white p-3 sm:p-5 rounded-xl shadow border-b-4 border-blue-500">
            <div className="flex items-center gap-2 mb-2">
                <Clock size={16} className="text-blue-400" />
                <p className="text-xs text-gray-500 font-bold uppercase">{t.avgProtocol}</p>
                <InfoTip content={t.tooltipAvgProto} />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-de-black">{formatDuration(stats.avgDaysToProtocol, lang)}</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 }} className="bg-white p-3 sm:p-5 rounded-xl shadow border-b-4 border-de-gold">
             <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={16} className="text-de-gold" />
                <p className="text-xs text-gray-500 font-bold uppercase">{t.avgApproval}</p>
                <InfoTip content={t.tooltipAvgAppr} />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-de-black">{formatDuration(stats.avgDaysToApproval, lang)}</p>
          </motion.div>
           
           <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} className="bg-white p-3 sm:p-5 rounded-xl shadow border-b-4 border-red-500">
            <div className="flex items-center gap-2 mb-2">
                <XCircle size={16} className="text-red-500" />
                <p className="text-xs text-gray-500 font-bold uppercase">{statusT[CaseStatus.CLOSED]}</p>
                <InfoTip content={t.tooltipClosed} />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-de-black">{stats.closedCases}</p>
          </motion.div>
      </div>

      <LazyLoad>
        <YearOverYearChart cases={cases} lang={lang} />
      </LazyLoad>

      <LazyLoad>
        <WaitTimeDistribution cases={cases} userCase={userCase} t={t} lang={lang} />
      </LazyLoad>

      {/* Replaced Funnel with Sankey */}
      <LazyLoad>
        <CaseSankeyChart cases={cases} lang={lang} />
      </LazyLoad>

      {/* Waiting Stats */}
      {stats.waitingStats && stats.waitingStats.count > 0 && (
        <LazyLoad height="200px">
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
        </LazyLoad>
      )}

      {/* Feature 5 (Previous): Compare Me Chart */}
      {userCase && comparisonData.length > 0 && (
         <LazyLoad>
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
         </LazyLoad>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <LazyLoad>
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
        </LazyLoad>

        <LazyLoad>
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
        </LazyLoad>
      </div>

      <AnimatePresence>
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
      </AnimatePresence>
    </div>
  );
};