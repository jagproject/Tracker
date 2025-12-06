import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { 
  LayoutDashboard, 
  Globe, 
  Users, 
  ShieldCheck, 
  LogOut, 
  AlertCircle,
  Sparkles,
  BellRing,
  Settings,
  Mail,
  Check,
  HelpCircle,
  BrainCircuit,
  FileUser,
  X,
  ArrowRight,
  Edit3,
  Loader2,
  Monitor,
  User,
  Power,
  ChevronDown,
  ChevronUp,
  Filter,
  Search,
  UserPlus,
  Link as LinkIcon,
  Ghost,
  Eye,
  EyeOff,
  Palette,
  Image as ImageIcon,
  RefreshCw,
  Home,
  ArrowLeftRight,
  Clock,
  Calendar,
  LogIn,
  TableProperties
} from 'lucide-react';
import { CitizenshipCase, UserSession, CaseType, CaseStatus, Language } from './types';
import { generateFantasyUsername, generateStatisticalInsights } from './services/geminiService';
import { fetchCases, fetchCaseByEmail, upsertCase, fetchCaseByFantasyName, isCaseUnclaimed, claimCase, getAppConfig, subscribeToCases, getLastFetchError, fetchGlobalConfig } from './services/storageService';
import { getDaysDiff, filterActiveCases, calculateAdvancedStats, calculateQuickStats, formatISODateToLocale, isGhostCase, formatDuration } from './services/statsUtils';
import { logoutUser, subscribeToAuthChanges, isSupabaseEnabled } from './services/authService';
import { TRANSLATIONS, COUNTRIES, STATUS_TRANSLATIONS } from './constants';

// Lazy Load Components (Code Splitting)
const StatsDashboard = React.lazy(() => import('./components/StatsCharts').then(module => ({ default: module.StatsDashboard })));
const WorldMapStats = React.lazy(() => import('./components/WorldMapStats').then(module => ({ default: module.WorldMapStats })));
const CaseForm = React.lazy(() => import('./components/CaseForm').then(module => ({ default: module.CaseForm })));
const AdminTools = React.lazy(() => import('./components/AdminTools').then(module => ({ default: module.AdminTools })));
const FAQ = React.lazy(() => import('./components/FAQ').then(module => ({ default: module.FAQ })));
const AIModelTab = React.lazy(() => import('./components/AIModelTab').then(module => ({ default: module.AIModelTab })));
const CommunityFeed = React.lazy(() => import('./components/CommunityFeed').then(module => ({ default: module.CommunityFeed })));
const SuccessTicker = React.lazy(() => import('./components/SuccessTicker').then(module => ({ default: module.SuccessTicker })));
const PrivacyPolicyModal = React.lazy(() => import('./components/PrivacyPolicyModal').then(module => ({ default: module.PrivacyPolicyModal })));

// High-quality, attractive German landscapes (No people, no sad concepts)
const BG_IMAGES = [
  "https://images.unsplash.com/photo-1590059393160-c4d632230491?q=80&w=2670&auto=format&fit=crop", // Neuschwanstein (Fairytale)
  "https://images.unsplash.com/photo-1534313314376-a7f2c8c5c944?q=80&w=2070&auto=format&fit=crop", // Eibsee Lake
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=2670&auto=format&fit=crop", // Bastei Bridge (Saxon Switzerland)
  "https://images.unsplash.com/photo-1528659576973-2e0f7692120b?q=80&w=2670&auto=format&fit=crop", // Moselle Loop
  "https://images.unsplash.com/photo-1516212110294-4d834927b58b?q=80&w=2574&auto=format&fit=crop", // Heidelberg
  "https://images.unsplash.com/photo-1500320821405-8fc1732209ca?q=80&w=2670&auto=format&fit=crop", // Black Forest
  "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?q=80&w=2670&auto=format&fit=crop", // Green Forest
  "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?q=80&w=2613&auto=format&fit=crop", // Bavarian Castle
];

// Item 8: Automatic Translation Detection
const detectLanguage = (): Language => {
  const browserLang = navigator.language.split('-')[0];
  if (['es', 'en', 'de', 'it', 'pt'].includes(browserLang)) {
    return browserLang as Language;
  }
  return 'en';
};

const LanguageSelector = ({ lang, setLang }: { lang: Language, setLang: (l: Language) => void }) => (
  <div className="flex items-center gap-2 text-xs font-medium border border-gray-700 rounded px-2 py-1 bg-white/90 backdrop-blur-sm shadow-sm">
      <Globe size={14} className="text-gray-500" />
      <button onClick={() => setLang('en')} className={`hover:text-de-gold transition-colors ${lang === 'en' ? 'text-de-gold font-bold' : 'text-gray-500'}`}>EN</button>
      <span className="text-gray-300">|</span>
      <button onClick={() => setLang('es')} className={`hover:text-de-gold transition-colors ${lang === 'es' ? 'text-de-gold font-bold' : 'text-gray-500'}`}>ES</button>
      <span className="text-gray-300">|</span>
      <button onClick={() => setLang('it')} className={`hover:text-de-gold transition-colors ${lang === 'it' ? 'text-de-gold font-bold' : 'text-gray-500'}`}>IT</button>
      <span className="text-gray-300">|</span>
      <button onClick={() => setLang('pt')} className={`hover:text-de-gold transition-colors ${lang === 'pt' ? 'text-de-gold font-bold' : 'text-gray-500'}`}>PT</button>
      <span className="text-gray-300">|</span>
      <button onClick={() => setLang('de')} className={`hover:text-de-gold transition-colors ${lang === 'de' ? 'text-de-gold font-bold' : 'text-gray-500'}`}>DE</button>
  </div>
);

// Loading Spinner for Suspense Fallbacks
const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-12 w-full h-full min-h-[200px]">
    <div className="flex flex-col items-center gap-2">
      <Loader2 className="w-8 h-8 animate-spin text-de-gold" />
      <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Loading...</span>
    </div>
  </div>
);

// Define Interface for List Data
interface CaseRowData {
    cases: CitizenshipCase[];
    lang: Language;
    onSelect: (c: CitizenshipCase) => void;
}

// Case Row Component - Expanded Version
const CaseRow: React.FC<{ index: number, style: React.CSSProperties, data: CaseRowData }> = ({ index, style, data }) => {
    const { cases, lang, onSelect } = data;
    const c = cases[index];
    if (!c) return null;
    
    // Check if ghost
    const isGhost = isGhostCase(c);

    return (
        <div style={style} className="px-0">
             <div 
                onDoubleClick={() => onSelect(c)}
                onClick={() => onSelect(c)}
                className={`flex items-center gap-3 px-3 sm:px-4 py-4 hover:bg-gray-50 transition-colors border-b border-gray-100 cursor-pointer select-none ${isGhost ? 'bg-gray-50/50' : ''}`}
             >
                <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0 shadow-sm ${
                isGhost ? 'bg-gray-400' :
                c.status === CaseStatus.APPROVED ? 'bg-green-500' : 
                c.status === CaseStatus.PROTOCOL_RECEIVED ? 'bg-blue-500' : 
                c.status === CaseStatus.SUBMITTED ? 'bg-gray-300' :
                c.status === CaseStatus.CLOSED ? 'bg-red-500' : 'bg-orange-400'
                }`} />
                <div className="flex-1 min-w-0 flex items-center justify-between">
                    <span className={`font-bold text-sm truncate mr-2 flex items-center gap-2 ${isGhost ? 'text-gray-500' : 'text-de-black'}`}>
                        {c.fantasyName}
                        {isGhost && <Ghost size={12} className="text-gray-400" title="Ghost Case (Inactive)" />}
                    </span>
                    <div className="flex items-center gap-2 sm:gap-4 text-gray-500 text-xs whitespace-nowrap">
                        <span className="truncate max-w-[80px] sm:max-w-[120px] hidden xs:inline-block bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 text-[10px] sm:text-xs">{c.caseType}</span>
                        <span className="font-mono text-[10px] sm:text-xs">{formatISODateToLocale(c.submissionDate, lang)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Cohort Comparison Modal (New Feature)
const CohortModal = ({ userCase, allCases, onClose, lang }: { userCase: CitizenshipCase, allCases: CitizenshipCase[], onClose: () => void, lang: Language }) => {
    const t = TRANSLATIONS[lang];
    const statusT = STATUS_TRANSLATIONS[lang];
    
    const cohortCases = useMemo(() => {
        if (!userCase.submissionDate) return [];
        const userDate = new Date(userCase.submissionDate);
        return allCases.filter(c => {
            if (!c.submissionDate) return false;
            const d = new Date(c.submissionDate);
            return d.getMonth() === userDate.getMonth() && d.getFullYear() === userDate.getFullYear();
        });
    }, [userCase, allCases]);

    const stats = calculateQuickStats(cohortCases);

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-in fade-in" onClick={onClose}>
            <div className="bg-white text-gray-900 rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="bg-de-black p-4 flex justify-between items-center text-white">
                    <h3 className="font-bold flex items-center gap-2">
                        <Users size={18} className="text-de-gold" /> {t.cohort} ({cohortCases.length})
                    </h3>
                    <button onClick={onClose}><X size={20} className="text-white hover:text-de-gold" /></button>
                </div>
                
                <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between text-xs">
                     <div className="text-center">
                         <span className="block font-bold text-gray-500 uppercase">{t.avgWait}</span>
                         <span className="font-bold text-lg">{formatDuration(stats.avgDaysTotal, lang)}</span>
                     </div>
                     <div className="text-center">
                         <span className="block font-bold text-gray-500 uppercase">{statusT[CaseStatus.APPROVED]}</span>
                         <span className="font-bold text-lg text-green-600">{stats.approvedCases} / {stats.totalCases}</span>
                     </div>
                </div>

                <div className="overflow-y-auto p-4 space-y-2 flex-1">
                    {cohortCases.map(c => (
                        <div key={c.id} className={`text-sm p-3 border rounded flex justify-between items-center ${c.id === userCase.id ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-100'}`}>
                            <div>
                                <span className={`font-bold block ${c.id === userCase.id ? 'text-de-black' : 'text-gray-700'}`}>
                                    {c.fantasyName} {c.id === userCase.id && "(You)"}
                                </span>
                                <span className="text-xs text-gray-500">
                                    {c.countryOfApplication} • {formatISODateToLocale(c.submissionDate, lang)}
                                </span>
                            </div>
                            <span className={`text-xs font-bold px-2 py-1 rounded ${
                                c.status === CaseStatus.APPROVED ? 'bg-green-100 text-green-800' : 
                                c.status === CaseStatus.PROTOCOL_RECEIVED ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                            }`}>
                               {statusT[c.status] || c.status}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// Detail Modal with Comparison Feature
const CaseDetailsModal = ({ caseData, userCase, onClose, lang }: { caseData: CitizenshipCase, userCase?: CitizenshipCase, onClose: () => void, lang: Language }) => {
    const t = TRANSLATIONS[lang];
    const statusT = STATUS_TRANSLATIONS[lang];
    const isGhost = isGhostCase(caseData);
    const [compareMode, setCompareMode] = useState(false);

    // Helpers for Comparison
    const getDur = (c: CitizenshipCase, endType: 'proto' | 'app') => {
        const start = c.submissionDate;
        const end = endType === 'proto' ? c.protocolDate : c.approvalDate;
        if (!start || !end) return null;
        return getDaysDiff(start, end);
    };

    const ComparisonRow = ({ label, myVal, theirVal, isDate = false, isDuration = false }: { label: string, myVal: any, theirVal: any, isDate?: boolean, isDuration?: boolean }) => {
        let displayMy = myVal;
        let displayTheir = theirVal;

        if (isDate) {
            displayMy = myVal ? formatISODateToLocale(myVal, lang) : '--';
            displayTheir = theirVal ? formatISODateToLocale(theirVal, lang) : '--';
        } else if (isDuration) {
            displayMy = myVal ? formatDuration(myVal, lang) : '--';
            displayTheir = theirVal ? formatDuration(theirVal, lang) : '--';
        }

        // Color coding for duration/speed
        let myClass = "text-gray-900"; // Enforce Dark Text
        let theirClass = "text-gray-900"; // Enforce Dark Text
        
        if (isDuration && myVal && theirVal) {
             if (myVal < theirVal) { myClass = "text-green-600 font-bold"; theirClass = "text-red-500"; }
             else if (myVal > theirVal) { myClass = "text-red-500"; theirClass = "text-green-600 font-bold"; }
        }

        return (
            <div className="grid grid-cols-3 gap-2 text-xs border-b border-gray-100 py-2">
                 <div className={`text-center font-mono ${myClass}`}>{displayMy}</div>
                 <div className="text-center font-bold text-gray-500 uppercase tracking-tighter text-[10px] self-center">{label}</div>
                 <div className={`text-center font-mono ${theirClass}`}>{displayTheir}</div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-in fade-in" onClick={onClose}>
            <div className="bg-white text-gray-900 rounded-xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="bg-de-black p-4 flex justify-between items-center text-white">
                    <h3 className="font-bold flex items-center gap-2 text-white">
                        {compareMode ? <ArrowLeftRight size={18} className="text-de-gold" /> : <User size={18} />}
                        {compareMode ? "Compare Cases" : caseData.fantasyName}
                    </h3>
                    <button onClick={onClose}><X size={20} className="text-white hover:text-de-gold" /></button>
                </div>
                
                <div className="p-6 space-y-4">
                     {compareMode && userCase ? (
                        <div className="animate-in slide-in-from-right-4">
                            <div className="grid grid-cols-3 gap-2 mb-4 text-center pb-2 border-b-2 border-gray-100">
                                <div className="font-bold text-de-gold truncate">{userCase.fantasyName}</div>
                                <div className="text-gray-400 text-xs self-center">VS</div>
                                <div className="font-bold text-gray-900 truncate">{caseData.fantasyName}</div>
                            </div>
                            
                            <div className="space-y-1">
                                <ComparisonRow label={t.submissionDate} myVal={userCase.submissionDate} theirVal={caseData.submissionDate} isDate />
                                <ComparisonRow label={t.protocolDate} myVal={userCase.protocolDate} theirVal={caseData.protocolDate} isDate />
                                <ComparisonRow label="Wait (Sub → Proto)" myVal={getDur(userCase, 'proto')} theirVal={getDur(caseData, 'proto')} isDuration />
                                <ComparisonRow label={t.approvalDate} myVal={userCase.approvalDate} theirVal={caseData.approvalDate} isDate />
                                <ComparisonRow label="Total Wait" myVal={getDur(userCase, 'app')} theirVal={getDur(caseData, 'app')} isDuration />
                            </div>

                            <button 
                                onClick={() => setCompareMode(false)}
                                className="mt-6 w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded uppercase transition-colors"
                            >
                                Back to Details
                            </button>
                        </div>
                     ) : (
                        <>
                             {isGhost && (
                                <div className="bg-gray-100 p-3 rounded border border-gray-200 text-xs text-gray-600 flex items-start gap-2">
                                    <Ghost size={16} className="shrink-0 mt-0.5" />
                                    <span>This case is categorized as a "Ghost Case" due to long inactivity.</span>
                                </div>
                             )}
                             <div className="grid grid-cols-2 gap-4 text-sm text-gray-900">
                                 <div>
                                     <span className="text-xs text-gray-500 font-bold uppercase block">{t.country}</span>
                                     <span className="font-medium text-gray-900">{caseData.countryOfApplication}</span>
                                 </div>
                                 <div>
                                     <span className="text-xs text-gray-500 font-bold uppercase block">{t.caseType}</span>
                                     <span className="font-medium text-gray-900">{caseData.caseType}</span>
                                 </div>
                             </div>
                             <div className="border-t border-gray-100 pt-3 space-y-2">
                                 <div className="flex justify-between">
                                    <span className="text-xs text-gray-500 font-bold uppercase">{t.submissionDate}</span>
                                    <span className="text-sm font-mono text-gray-900">{formatISODateToLocale(caseData.submissionDate, lang)}</span>
                                 </div>
                                 {caseData.protocolDate && (
                                     <div className="flex justify-between">
                                        <span className="text-xs text-gray-500 font-bold uppercase">{t.protocolDate}</span>
                                        <span className="text-sm font-mono text-blue-700">{formatISODateToLocale(caseData.protocolDate, lang)}</span>
                                     </div>
                                 )}
                                 {caseData.approvalDate && (
                                     <div className="flex justify-between bg-green-50 p-1 rounded">
                                        <span className="text-xs text-green-800 font-bold uppercase">{t.approvalDate}</span>
                                        <span className="text-sm font-mono text-green-800 font-bold">{formatISODateToLocale(caseData.approvalDate, lang)}</span>
                                     </div>
                                 )}
                                 {caseData.closedDate && (
                                     <div className="flex justify-between bg-red-50 p-1 rounded">
                                        <span className="text-xs text-red-800 font-bold uppercase">{t.closedDate}</span>
                                        <span className="text-sm font-mono text-red-800 font-bold">{formatISODateToLocale(caseData.closedDate, lang)}</span>
                                     </div>
                                 )}
                             </div>
                             <div className="border-t border-gray-100 pt-3 text-center">
                                 <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase ${
                                    caseData.status === CaseStatus.APPROVED ? 'bg-green-100 text-green-800' :
                                    caseData.status === CaseStatus.CLOSED ? 'bg-red-100 text-red-800' :
                                    'bg-gray-100 text-gray-700'
                                 }`}>
                                     {STATUS_TRANSLATIONS[lang][caseData.status] || caseData.status}
                                 </span>
                             </div>

                             {userCase && userCase.id !== caseData.id && (
                                <button 
                                    onClick={() => setCompareMode(true)}
                                    className="w-full mt-4 bg-de-gold/10 hover:bg-de-gold/20 text-de-black/90 font-bold py-2 rounded text-sm flex items-center justify-center gap-2 border border-de-gold/30 transition-colors"
                                >
                                    <ArrowLeftRight size={16} /> {lang === 'es' ? 'Comparar conmigo' : 'Compare with My Case'}
                                </button>
                             )}
                        </>
                     )}
                </div>
            </div>
        </div>
    );
};

// Bottom Navigation for Mobile
const MobileNavBar = ({ activeTab, setActiveTab, t, isGuest }: { activeTab: string, setActiveTab: (t: 'myCase' | 'dashboard' | 'faq' | 'ai') => void, t: any, isGuest: boolean }) => (
  <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 flex justify-around items-center h-16 pb-safe md:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
    {!isGuest && (
      <button 
        onClick={() => setActiveTab('myCase')}
        className={`flex flex-col items-center justify-center w-full h-full active:scale-95 transition-transform ${activeTab === 'myCase' ? 'text-de-gold' : 'text-gray-400 hover:text-gray-600'}`}
      >
        <User size={22} className={activeTab === 'myCase' ? 'fill-current' : ''} strokeWidth={2} />
        <span className="text-[10px] font-bold mt-1">{t.myCase}</span>
      </button>
    )}
    <button 
      onClick={() => setActiveTab('dashboard')}
      className={`flex flex-col items-center justify-center w-full h-full active:scale-95 transition-transform ${activeTab === 'dashboard' ? 'text-de-gold' : 'text-gray-400 hover:text-gray-600'}`}
    >
      <LayoutDashboard size={22} className={activeTab === 'dashboard' ? 'fill-current' : ''} strokeWidth={2} />
      <span className="text-[10px] font-bold mt-1">{t.dashboard}</span>
    </button>
    {!isGuest && (
      <button 
        onClick={() => setActiveTab('ai')}
        className={`flex flex-col items-center justify-center w-full h-full active:scale-95 transition-transform ${activeTab === 'ai' ? 'text-de-gold' : 'text-gray-400 hover:text-gray-600'}`}
      >
        <Sparkles size={22} className={activeTab === 'ai' ? 'fill-current' : ''} strokeWidth={2} />
        <span className="text-[10px] font-bold mt-1">AI</span>
      </button>
    )}
    <button 
      onClick={() => setActiveTab('faq')}
      className={`flex flex-col items-center justify-center w-full h-full active:scale-95 transition-transform ${activeTab === 'faq' ? 'text-de-gold' : 'text-gray-400 hover:text-gray-600'}`}
    >
      <HelpCircle size={22} className={activeTab === 'faq' ? 'fill-current' : ''} strokeWidth={2} />
      <span className="text-[10px] font-bold mt-1">FAQ</span>
    </button>
  </div>
);

const App: React.FC = () => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [loginStep, setLoginStep] = useState<'INPUT' | 'CONFIRM' | 'USERNAME_SELECTION'>('INPUT');
  const [isMockAuth, setIsMockAuth] = useState(!isSupabaseEnabled());
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false); // For skeletons
  const [allCases, setAllCases] = useState<CitizenshipCase[]>([]);
  const [userCase, setUserCase] = useState<CitizenshipCase | undefined>(undefined);
  const [aiInsight, setAiInsight] = useState<string>("");
  const [activeTab, setActiveTab] = useState<'myCase' | 'dashboard' | 'faq' | 'ai'>('myCase');
  const [lang, setLang] = useState<Language>(detectLanguage); 
  const [showAdmin, setShowAdmin] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);
  const [selectedDetailCase, setSelectedDetailCase] = useState<CitizenshipCase | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null); 
  const [showCohortModal, setShowCohortModal] = useState(false); // NEW STATE for Cohort Modal
  
  // Dashboard Filters State
  const [showFilters, setShowFilters] = useState(false); 
  const [filterCountry, setFilterCountry] = useState<string>('All');
  const [filterMonth, setFilterMonth] = useState<string>('All');
  const [filterYear, setFilterYear] = useState<string>('All');
  const [filterType, setFilterType] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All'); 
  const [dashboardSearchTerm, setDashboardSearchTerm] = useState<string>(''); 
  
  // Ghost Case View Mode
  const [viewGhosts, setViewGhosts] = useState(false);

  // Guest Mode
  const [isGuest, setIsGuest] = useState(false);

  // Onboarding / Claiming State
  const [onboardingMode, setOnboardingMode] = useState<'CREATE' | 'CLAIM'>('CREATE');
  const [proposedUsername, setProposedUsername] = useState('');
  const [claimSearchTerm, setClaimSearchTerm] = useState('');
  const [selectedClaimCase, setSelectedClaimCase] = useState<CitizenshipCase | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // New state for Maintenance Mode
  const [isMaintenance, setIsMaintenance] = useState(false);

  // Privacy Policy State
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  // Background Control State
  const [bgMode, setBgMode] = useState<'image' | 'simple'>('image');
  const [bgImage, setBgImage] = useState<string>(() => {
    try {
      if (BG_IMAGES && BG_IMAGES.length > 0) {
        return BG_IMAGES[Math.floor(Math.random() * BG_IMAGES.length)];
      }
    } catch (e) {
      console.error("Error selecting background image", e);
    }
    return BG_IMAGES[0];
  });

  const t = TRANSLATIONS[lang];

  // Helper for month names
  const getMonthName = (monthIndex: number) => {
    try {
        const date = new Date(2023, monthIndex, 1);
        return date.toLocaleString(lang, { month: 'long' });
    } catch (e) {
        return new Date(2023, monthIndex, 1).toLocaleString('en', { month: 'long' });
    }
  };

  // Background Effects
  useEffect(() => {
    const savedMode = localStorage.getItem('de_tracker_bg_mode') as 'image' | 'simple';
    if (savedMode) setBgMode(savedMode);
  }, []);

  const handleToggleBgMode = () => {
      const newMode = bgMode === 'image' ? 'simple' : 'image';
      setBgMode(newMode);
      localStorage.setItem('de_tracker_bg_mode', newMode);
  };

  const handleShuffleBg = () => {
      let newImg = bgImage;
      while (newImg === bgImage && BG_IMAGES.length > 1) {
          newImg = BG_IMAGES[Math.floor(Math.random() * BG_IMAGES.length)];
      }
      setBgImage(newImg);
  };

  useEffect(() => {
    refreshData();
    
    // Subscribe to Auth
    const { unsubscribe } = subscribeToAuthChanges(async (user) => {
        if (user && user.email) {
            await handleSessionStart(user.email);
        } else if (!isMockAuth) {
            if (session && !session.email.includes('gmail')) {
               // Keep session if it was manual entry
            }
        }
    });

    // Realtime subscription
    const channel = subscribeToCases(() => {
        refreshData(true); // Silent refresh
    });

    return () => {
        unsubscribe();
        if (channel) channel.unsubscribe();
    };
  }, [isMockAuth]);

  const refreshData = async (silent: boolean = false) => {
    if (!silent) setDataLoading(true);
    // Simulate slight delay for Skeletons ONLY if not silent
    if (!silent && !dataLoading) await new Promise(r => setTimeout(r, 600)); 

    const loadedCases = await fetchCases();
    setAllCases(loadedCases);
    setFetchError(getLastFetchError()); 
    
    // FETCH GLOBAL CONFIG NOW
    const config = await fetchGlobalConfig();
    
    // AUTO-MAINTENANCE: Safety mechanism
    if (loadedCases.length < 790) {
        setIsMaintenance(true);
    } else {
        setIsMaintenance(config.maintenanceMode);
    }

    if (session) {
        // Fetch full details for the logged-in user explicitly since public fetchCases excludes PII
       const mine = await fetchCaseByEmail(session.email);
       if (mine) {
           // Ensure the user's full data is used for "My Case"
           setUserCase(mine);
           
           // Optionally update the entry in allCases to reflect full data locally (if needed)
           // But allCases usually drives the charts which don't need email.
       } else {
           // Fallback if not found (e.g. fresh session but case deleted?)
           setUserCase(undefined);
       }
    }
    if (!silent) setDataLoading(false);
  };

  // Compute filtered cases for the Dashboard
  const filteredCases = useMemo(() => {
    let filtered;

    if (viewGhosts) {
        filtered = allCases.filter(c => isGhostCase(c));
    } else {
        filtered = filterActiveCases(allCases); 
    }
    
    if (filterCountry !== 'All') filtered = filtered.filter(c => c.countryOfApplication === filterCountry);
    if (filterType !== 'All') filtered = filtered.filter(c => c.caseType === filterType);
    if (filterStatus !== 'All') filtered = filtered.filter(c => c.status === filterStatus);
    if (filterMonth !== 'All') {
      filtered = filtered.filter(c => {
        const d = new Date(c.submissionDate);
        return (d.getMonth() + 1).toString() === filterMonth;
      });
    }
    if (filterYear !== 'All') {
      filtered = filtered.filter(c => {
        const d = new Date(c.submissionDate);
        return d.getFullYear().toString() === filterYear;
      });
    }
    
    if (dashboardSearchTerm) {
        const term = dashboardSearchTerm.toLowerCase();
        filtered = filtered.filter(c => 
            c.fantasyName.toLowerCase().includes(term) ||
            c.countryOfApplication.toLowerCase().includes(term)
        );
    }

    return filtered;
  }, [allCases, filterCountry, filterMonth, filterYear, filterType, filterStatus, viewGhosts, dashboardSearchTerm]);

  // Compute Ghost Count
  const ghostCount = useMemo(() => {
     return allCases.filter(c => isGhostCase(c)).length;
  }, [allCases]);

  // Compute Unclaimed Cases for Search
  const unclaimedCases = useMemo(() => {
      const unclaimed = allCases.filter(c => isCaseUnclaimed(c));
      
      if (!claimSearchTerm) return unclaimed;
      
      const lowerTerm = claimSearchTerm.toLowerCase();
      return unclaimed.filter(c => 
          c.fantasyName.toLowerCase().includes(lowerTerm) ||
          c.countryOfApplication.toLowerCase().includes(lowerTerm) ||
          (c.submissionDate && c.submissionDate.includes(lowerTerm))
      );
  }, [allCases, claimSearchTerm]);

  const handleSessionStart = async (email: string) => {
    if (isMaintenance) return; 

    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 800));

    const cleanEmail = email.trim().toLowerCase();
    const existingCase = await fetchCaseByEmail(cleanEmail);
    
    if (existingCase) {
        setSession({
            email: cleanEmail,
            fantasyName: existingCase.fantasyName,
            isAuthenticated: true,
            language: 'en'
        });
        setUserCase(existingCase);
        setLoading(false);
        setLoginStep('INPUT'); 
    } else {
        const genName = await generateFantasyUsername(cleanEmail.split('@')[0]);
        setProposedUsername(genName);
        setOnboardingMode('CREATE'); 
        setLoginStep('USERNAME_SELECTION');
        setLoading(false);
    }
  };

  const handleFinalizeOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMaintenance) return;
    setUsernameError(null);
    setLoading(true);

    const cleanEmail = emailInput.trim().toLowerCase();

    if (onboardingMode === 'CREATE') {
        const finalName = proposedUsername.trim();
        if (finalName.length < 3) {
            setUsernameError(t.usernameShort);
            setLoading(false);
            return;
        }

        const existingCaseByName = await fetchCaseByFantasyName(finalName);
        if (existingCaseByName) {
            setUsernameError(t.usernameTaken);
            setLoading(false);
            return;
        }

        const newSession: UserSession = {
            email: cleanEmail,
            fantasyName: finalName,
            isAuthenticated: true,
            language: 'en'
        };
        setSession(newSession);
        
        setUserCase({
            id: crypto.randomUUID(),
            email: cleanEmail,
            fantasyName: finalName,
            caseType: CaseType.STAG_5,
            countryOfApplication: 'Unknown',
            status: CaseStatus.SUBMITTED,
            submissionDate: new Date().toISOString().split('T')[0],
            lastUpdated: new Date().toISOString()
        });

    } else if (onboardingMode === 'CLAIM') {
        if (!selectedClaimCase) {
            setUsernameError(t.selectCase);
            setLoading(false);
            return;
        }

        const claimedCase = await claimCase(selectedClaimCase, cleanEmail);
        setUserCase(claimedCase);
        setSession({
            email: cleanEmail,
            fantasyName: claimedCase.fantasyName,
            isAuthenticated: true,
            language: 'en'
        });
    }

    setLoginStep('INPUT');
    setLoading(false);
  };

  useEffect(() => {
    if (session && userCase) {
      const isStale = getDaysDiff(userCase.lastUpdated, new Date().toISOString())! > 365;
      const msgs: string[] = [];
      
      if (userCase.notifySameDateSubmission && !userCase.protocolDate) {
        const twin = allCases.find(c => 
          c.id !== userCase.id && 
          c.submissionDate === userCase.submissionDate && 
          c.status !== CaseStatus.SUBMITTED &&
          c.protocolDate
        );
        if (twin) msgs.push(t.notificationTwin.replace('{date}', formatISODateToLocale(userCase.submissionDate, lang)));
      }

      if (userCase.notifySameMonthUrkunde && userCase.protocolDate && !userCase.approvalDate) {
        const myProto = new Date(userCase.protocolDate);
        if (!isNaN(myProto.getTime())) {
            const cohort = allCases.find(c => 
                c.id !== userCase.id &&
                c.protocolDate &&
                new Date(c.protocolDate).getMonth() === myProto.getMonth() &&
                new Date(c.protocolDate).getFullYear() === myProto.getFullYear() &&
                c.approvalDate
            );
            if (cohort) msgs.push(t.notificationCohort.replace('{date}', `${myProto.getMonth()+1}/${myProto.getFullYear()}`));
        }
      }

      if (isStale) msgs.push(t.staleWarning);
      if (msgs.length > 0) setNotificationMsg(msgs.join(' | '));
    }
  }, [session, userCase, allCases, t]);

  const activeCases = useMemo(() => filterActiveCases(allCases), [allCases]);
  const allFantasyNames = useMemo(() => allCases.map(c => c.fantasyName), [allCases]);

  const globalStats = useMemo(() => {
     return calculateQuickStats(activeCases);
  }, [activeCases]);

  const userTypeStats = useMemo(() => {
     if (!userCase) return globalStats;
     const typeSpecificCases = activeCases.filter(c => c.caseType === userCase.caseType);
     return typeSpecificCases.length > 2 ? calculateQuickStats(typeSpecificCases) : globalStats;
  }, [userCase, activeCases, globalStats]);

  useEffect(() => {
    if (activeCases.length > 0) {
      let targetCases = activeCases;
      
      if (userCase && userCase.caseType) {
        const specificCases = activeCases.filter(c => c.caseType === userCase.caseType);
        if (specificCases.length >= 3) {
            targetCases = specificCases;
        }
      }

      const insightStats = calculateQuickStats(targetCases);
      generateStatisticalInsights(insightStats, targetCases, lang).then(setAiInsight);
    }
  }, [activeCases, userCase, lang]); 

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) return;
    if (isMaintenance) return;
    setLoginStep('CONFIRM');
  };

  const handleLoginConfirm = async () => {
    if (isMaintenance) return;
    await handleSessionStart(emailInput.trim().toLowerCase());
  };

  const enterGuestMode = () => {
      setIsGuest(true);
      setActiveTab('dashboard'); 
      setUserCase(undefined);
      setSession({
          email: 'guest@tracker.local',
          fantasyName: 'Guest',
          isAuthenticated: false,
          language: 'en'
      });
  };

  const handleUpdateCase = async (updatedCase: CitizenshipCase) => {
    setAllCases(prev => {
        const idx = prev.findIndex(c => c.id === updatedCase.id);
        if (idx >= 0) {
            const newArr = [...prev];
            newArr[idx] = updatedCase;
            return newArr;
        }
        return [...prev, updatedCase];
    });
    
    setUserCase(updatedCase);
    
    if (session && updatedCase.fantasyName !== session.fantasyName) {
        setSession({ ...session, fantasyName: updatedCase.fantasyName });
    }

    await upsertCase(updatedCase);
    
    setNotificationMsg(null); 
  };

  const handleLogout = async () => {
    if (isGuest) {
        setIsGuest(false);
    } else {
        await logoutUser();
    }
    setSession(null);
    setEmailInput('');
    setUserCase(undefined);
    setNotificationMsg(null);
    setLoginStep('INPUT');
    setOnboardingMode('CREATE');
    setProposedUsername('');
    setSelectedClaimCase(null);
    setPrivacyAccepted(false); 
  };

  if (!session && !isGuest) {
    return (
      <div 
        className={`min-h-screen flex flex-col justify-center items-center p-4 font-sans relative transition-all duration-1000 ${
            bgMode === 'image' ? 'bg-cover bg-center' : 'bg-gradient-to-br from-gray-900 to-black'
        }`}
        style={bgMode === 'image' ? {
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url('${bgImage}')` 
        } : {}}
      >
        <Suspense fallback={null}>
          {showPrivacyModal && <PrivacyPolicyModal lang={lang} onClose={() => setShowPrivacyModal(false)} />}
        </Suspense>
        
        <div className="absolute top-4 right-4 z-20">
            <LanguageSelector lang={lang} setLang={setLang} />
        </div>
        <div className="max-w-md w-full bg-white rounded shadow-2xl overflow-hidden border-t-8 border-de-black relative z-10 animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-white p-8 text-center flex flex-col items-center relative">
             <div className="flex flex-col w-20 h-14 shadow-md mb-6">
                <div className="h-1/3 bg-black w-full rounded-t-sm"></div>
                <div className="h-1/3 bg-[#DD0000] w-full"></div>
                <div className="h-1/3 bg-[#FFCC00] w-full rounded-b-sm"></div>
             </div>
            <h1 className="text-xl font-bold text-gray-800">{t.title}</h1>
          </div>
          
          <div className="p-8 pt-0">
            {isMaintenance ? (
                <div className="text-center bg-orange-50 border border-orange-200 p-6 rounded-lg animate-in fade-in">
                    <Power size={48} className="mx-auto text-orange-400 mb-4" />
                    <h3 className="font-bold text-lg text-gray-800 mb-2">{t.maintenance}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{t.maintenanceMessage}</p>
                </div>
            ) : (
                loginStep === 'INPUT' ? (
                <>
                    <form onSubmit={handleLoginSubmit} className="space-y-6">
                        <div>
                            <label className="block text-xs font-bold text-de-gray uppercase mb-2">{t.loginEmailLabel}</label>
                            <div className="mb-2 p-2 bg-blue-50 border border-blue-100 rounded flex items-start gap-2">
                                <AlertCircle size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
                                <p className="text-[10px] text-blue-800 leading-tight">
                                    {t.fakeEmailInfo}
                                </p>
                            </div>
                            <input 
                                type="email" 
                                value={emailInput} 
                                onChange={(e) => setEmailInput(e.target.value)} 
                                className="w-full px-4 py-3 rounded border border-gray-300 focus:ring-2 focus:ring-de-gold focus:border-transparent outline-none transition-all bg-white text-gray-900" 
                                placeholder={t.loginPlaceholder} 
                                required 
                            />
                        </div>

                        <div className="flex items-start gap-3 p-3 bg-gray-50 rounded border border-gray-100">
                        <input 
                            type="checkbox"
                            checked={privacyAccepted}
                            onChange={e => setPrivacyAccepted(e.target.checked)}
                            className="mt-1 h-4 w-4 text-de-gold border-gray-300 rounded focus:ring-de-gold cursor-pointer flex-shrink-0"
                            id="privacy-check"
                        />
                        <label htmlFor="privacy-check" className="text-xs text-gray-600 cursor-pointer select-none">
                            {t.acceptPrivacy}
                            <button 
                            type="button"
                            onClick={(e) => { e.preventDefault(); setShowPrivacyModal(true); }}
                            className="block text-de-gold font-bold hover:underline mt-1 flex items-center gap-1"
                            >
                            <ShieldCheck size={12} /> {t.privacyLink}
                            </button>
                        </label>
                        </div>

                        <button 
                            type="submit" 
                            disabled={loading || !privacyAccepted} 
                            className="w-full bg-de-black hover:bg-gray-800 text-white font-bold py-3 px-4 rounded transition-colors flex justify-center items-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                        {t.loginButton} <ArrowRight size={16} />
                        </button>
                    </form>
                    
                    <div className="mt-4 pt-4 border-t border-gray-100 text-center">
                        <button 
                            type="button"
                            onClick={enterGuestMode}
                            className="text-gray-500 hover:text-de-black font-medium text-sm flex items-center justify-center gap-1 mx-auto transition-colors"
                        >
                            <Eye size={16} /> {t.guestAccess}
                        </button>
                    </div>
                </>
                ) : loginStep === 'CONFIRM' ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-5 text-center">
                        <div className="bg-yellow-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Mail className="text-yellow-600" />
                        </div>
                        <h3 className="font-bold text-gray-800 mb-2">{t.confirmEmail}</h3>
                        <p className="text-xl font-bold text-de-black break-all mb-4 bg-white p-2 rounded border border-gray-100 shadow-inner">
                            {emailInput}
                        </p>
                        <div className="flex items-start gap-2 text-left text-xs text-yellow-800 bg-yellow-100/50 p-2 rounded">
                            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                            <p>{t.ensureEmail}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={() => setLoginStep('INPUT')}
                            className="w-full bg-white border border-gray-300 text-gray-600 font-bold py-3 px-4 rounded hover:bg-gray-50 flex items-center justify-center gap-2"
                        >
                            <Edit3 size={16} /> {t.edit}
                        </button>
                        <button 
                            onClick={handleLoginConfirm} 
                            disabled={loading} 
                            className="w-full bg-de-gold hover:bg-yellow-400 text-de-black font-bold py-3 px-4 rounded transition-colors flex justify-center items-center gap-2 shadow-md"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check size={16} />}
                            {t.confirm}
                        </button>
                    </div>
                </div>
                ) : loginStep === 'USERNAME_SELECTION' ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                        <div className="text-center mb-4">
                            <h3 className="font-bold text-xl text-gray-800">{t.welcome}</h3>
                            <p className="text-sm text-gray-500">{t.newEmailPrompt}</p>
                        </div>

                        <div className="flex border-b border-gray-200 mb-4">
                            <button 
                                onClick={() => setOnboardingMode('CREATE')}
                                className={`flex-1 py-2 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${onboardingMode === 'CREATE' ? 'border-de-gold text-de-black' : 'border-transparent text-gray-400'}`}
                            >
                                <UserPlus size={16} /> {t.createNew}
                            </button>
                            <button 
                                onClick={() => setOnboardingMode('CLAIM')}
                                className={`flex-1 py-2 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-colors ${onboardingMode === 'CLAIM' ? 'border-de-gold text-de-black' : 'border-transparent text-gray-400'}`}
                            >
                                <LinkIcon size={16} /> {t.claimExisting}
                            </button>
                        </div>

                        <form onSubmit={handleFinalizeOnboarding} className="space-y-4">
                            
                            {onboardingMode === 'CREATE' && (
                                <div className="space-y-4 animate-in fade-in">
                                     <div className="bg-blue-50 p-3 rounded border border-blue-100 text-xs text-blue-800">
                                        <p>{t.createProfileDesc} <strong>{emailInput}</strong>.</p>
                                     </div>
                                    <div>
                                        <label className="block text-xs font-bold text-de-gray uppercase mb-2">{t.chooseFantasyName}</label>
                                        <input 
                                            type="text" 
                                            value={proposedUsername} 
                                            onChange={(e) => setProposedUsername(e.target.value)} 
                                            className={`w-full px-4 py-3 rounded border ${usernameError ? 'border-red-500 focus:ring-red-200' : 'border-gray-300 focus:ring-de-gold'} focus:ring-2 focus:border-transparent outline-none transition-all bg-white text-gray-900 font-bold`} 
                                            placeholder="e.g. Bavarian Eagle"
                                            required 
                                        />
                                        {usernameError && <p className="text-xs text-red-500 font-bold mt-2">{usernameError}</p>}
                                    </div>
                                </div>
                            )}

                            {onboardingMode === 'CLAIM' && (
                                <div className="space-y-4 animate-in fade-in">
                                     <div className="bg-green-50 p-3 rounded border border-green-100 text-xs text-green-800">
                                        <p>{t.claimDesc}</p>
                                     </div>
                                    
                                     <div>
                                        <label className="block text-xs font-bold text-de-gray uppercase mb-2">{t.searchCase}</label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-3 text-gray-400" size={16} />
                                            <input 
                                                type="text"
                                                value={claimSearchTerm}
                                                onChange={(e) => setClaimSearchTerm(e.target.value)}
                                                className="w-full pl-10 pr-4 py-3 rounded border border-gray-300 focus:ring-2 focus:ring-de-gold outline-none text-sm"
                                                placeholder={t.searchPlaceholder}
                                            />
                                        </div>
                                     </div>

                                     <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg bg-gray-50">
                                        {unclaimedCases.length === 0 ? (
                                            <div className="p-4 text-center text-xs text-gray-400">{t.noUnclaimed}</div>
                                        ) : (
                                            unclaimedCases.map(c => (
                                                <div 
                                                    key={c.id} 
                                                    onClick={() => setSelectedClaimCase(c)}
                                                    className={`p-3 border-b border-gray-100 last:border-0 cursor-pointer flex justify-between items-center transition-colors ${selectedClaimCase?.id === c.id ? 'bg-de-gold/20 border-l-4 border-l-de-gold' : 'hover:bg-white'}`}
                                                >
                                                    <div>
                                                        <p className="font-bold text-sm text-de-black">{c.fantasyName}</p>
                                                        <p className="text-[10px] text-gray-500">
                                                            {c.caseType} • {c.countryOfApplication} • <span className="font-medium text-gray-700">{formatISODateToLocale(c.submissionDate, lang)}</span>
                                                        </p>
                                                    </div>
                                                    {selectedClaimCase?.id === c.id && <CheckCircleIcon />}
                                                </div>
                                            ))
                                        )}
                                     </div>
                                     {usernameError && <p className="text-xs text-red-500 font-bold">{usernameError}</p>}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <button 
                                        type="button"
                                        onClick={() => setLoginStep('INPUT')}
                                        className="w-full bg-white border border-gray-300 text-gray-600 font-bold py-3 px-4 rounded hover:bg-gray-50"
                                    >
                                        {t.cancel}
                                    </button>
                                <button 
                                    type="submit" 
                                    disabled={loading} 
                                    className="w-full bg-de-gold hover:bg-yellow-400 text-de-black font-bold py-3 px-4 rounded transition-colors flex justify-center items-center gap-2 shadow-md"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight size={16} />}
                                    {onboardingMode === 'CREATE' ? t.createUser : t.claimCaseBtn}
                                </button>
                            </div>
                        </form>
                    </div>
                ) : (
                    <div />
                )
            )}
          </div>
        </div>
        <div className="mt-8 py-4 flex flex-col items-center justify-center gap-2 text-gray-400">
             <div className="flex items-center gap-3 bg-black/30 px-4 py-2 rounded-full backdrop-blur-sm">
                 <button onClick={handleToggleBgMode} className="flex items-center gap-1 text-xs hover:text-white transition-colors text-white/70">
                    {bgMode === 'image' ? <Palette size={12} /> : <ImageIcon size={12} />}
                    {bgMode === 'image' ? t.simpleMode : t.scenicMode}
                 </button>
                 {bgMode === 'image' && (
                    <button onClick={handleShuffleBg} className="flex items-center gap-1 text-xs hover:text-white transition-colors text-white/70">
                        <RefreshCw size={12} /> {t.shuffle}
                    </button>
                 )}
                 <span className="text-white/30">|</span>
                 <button onClick={() => setShowAdmin(true)} className="flex items-center gap-1 text-xs hover:text-white transition-colors text-white/70">
                    <Settings size={12} /> {t.ownerAccess}
                 </button>
             </div>
        </div>
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"><Loader2 className="animate-spin text-white" /></div>}>
          {showAdmin && <AdminTools lang={lang} onClose={() => setShowAdmin(false)} onDataChange={refreshData} />}
        </Suspense>
      </div>
    );
  }

  return (
    <>
      <Suspense fallback={<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"><Loader2 className="animate-spin text-white" /></div>}>
        {showAdmin && <AdminTools lang={lang} onClose={() => setShowAdmin(false)} onDataChange={refreshData} />}
      </Suspense>
      {selectedDetailCase && <CaseDetailsModal caseData={selectedDetailCase} userCase={userCase} onClose={() => setSelectedDetailCase(null)} lang={lang} />}
      {showCohortModal && userCase && <CohortModal userCase={userCase} allCases={allCases} onClose={() => setShowCohortModal(false)} lang={lang} />}

      <div 
          className={`min-h-screen font-sans text-de-black transition-all duration-1000 ${
              bgMode === 'image' ? 'bg-fixed bg-cover bg-center' : 'bg-gray-100'
          }`}
          style={bgMode === 'image' ? {
            backgroundImage: `url('${bgImage}')`
          } : {}}
      >
        <div className={`min-h-screen ${bgMode === 'image' ? 'bg-gray-50/70 backdrop-blur-sm' : ''}`}>
        
        <nav className="bg-de-black/95 backdrop-blur text-white shadow-lg sticky top-0 z-50 border-b-4 border-de-red">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16 items-center">
              <div className="flex items-center gap-3">
                <div className="flex flex-col w-8 h-6 shadow-sm rounded-sm overflow-hidden">
                  <div className="h-1/3 bg-black w-full"></div>
                  <div className="h-1/3 bg-[#DD0000] w-full"></div>
                  <div className="h-1/3 bg-[#FFCC00] w-full"></div>
                </div>
                <span className="font-bold text-lg tracking-tight hidden md:block">{t.title}</span>
              </div>
              <div className="flex items-center gap-4 md:gap-6">
                <div className="hidden md:block"><LanguageSelector lang={lang} setLang={setLang} /></div>
                
                {!isGuest ? (
                    <div className="hidden md:flex flex-col items-end border-l border-gray-700 pl-4">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] text-gray-400 uppercase font-bold">{t.username}</span>
                            <span className="text-sm font-bold text-de-gold">{session?.fantasyName}</span>
                        </div>
                    </div>
                ) : (
                    <div className="hidden md:flex items-center gap-2 border-l border-gray-700 pl-4 text-gray-400">
                        <Eye size={16} />
                        <span className="text-xs font-bold uppercase">{t.guestModeActive}</span>
                    </div>
                )}

                <button 
                    onClick={handleLogout} 
                    className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-300 hover:text-white flex items-center gap-2"
                    title={isGuest ? t.guestLoginPrompt : t.logout}
                >
                    {isGuest ? <LogIn size={20} /> : <LogOut size={20} />}
                </button>
              </div>
            </div>
          </div>
        </nav>

        <Suspense fallback={<div className="h-8 bg-gray-900 animate-pulse" />}>
          {activeTab === 'dashboard' && <SuccessTicker cases={allCases} lang={lang} />}
        </Suspense>

        <main className="max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 py-0 sm:py-8 pb-24">
          <div className="block md:hidden mb-6 px-3 pt-4"><LanguageSelector lang={lang} setLang={setLang} /></div>
          
          {isMaintenance && (
              <div className="bg-orange-50 border border-orange-200 text-orange-800 p-4 rounded shadow mb-6 mx-0 sm:mx-0 flex items-start gap-3 animate-in slide-in-from-top-2">
                  <Power className="flex-shrink-0 mt-1" size={20} />
                  <div className="pr-6">
                      <p className="font-bold">{t.maintenance}</p>
                      <p className="text-sm">{t.maintenanceMessage}</p>
                  </div>
              </div>
          )}

          {fetchError && !isMaintenance && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded shadow mb-6 mx-0 sm:mx-0 flex items-start gap-3 animate-in slide-in-from-top-2">
              <AlertCircle className="flex-shrink-0 mt-1" size={20} />
              <div className="pr-6">
                  <p className="font-bold">Database Connection Issue</p>
                  <p className="text-sm">{fetchError}. Some data might be unavailable.</p>
              </div>
            </div>
          )}

          {notificationMsg && !isMaintenance && (
            <div className="bg-de-gold text-de-black p-4 rounded shadow mb-6 mx-0 sm:mx-0 flex items-start gap-3 animate-in slide-in-from-top-2 relative">
              <BellRing className="flex-shrink-0 mt-1" />
              <div className="pr-6">
                  <p className="font-bold">{t.attention}</p>
                  <p>{notificationMsg}</p>
              </div>
              <button 
                  onClick={() => setNotificationMsg(null)} 
                  className="absolute top-2 right-2 text-de-black hover:text-gray-700 bg-white/20 rounded-full p-1"
              >
                  <X size={16} />
              </button>
            </div>
          )}

          <div className="hidden md:flex gap-1 mb-6 border-b border-gray-300 overflow-x-auto">
            {!isGuest && <TabButton id='myCase' label={t.myCase} icon={<User size={16} />} active={activeTab} onClick={setActiveTab} />}
            <TabButton id='dashboard' label={t.dashboard} icon={<LayoutDashboard size={16} />} active={activeTab} onClick={setActiveTab} />
            {!isGuest && <TabButton id='ai' label={t.aiModel} icon={<Monitor size={16} />} active={activeTab} onClick={setActiveTab} />}
            <TabButton id='faq' label={t.faq} icon={<HelpCircle size={16} />} active={activeTab} onClick={setActiveTab} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-8 mb-8">
            {activeTab === 'myCase' && (
              <Suspense fallback={<div className="col-span-1 xl:col-span-3"><LoadingSpinner /></div>}>
              <div className="col-span-1 xl:col-span-3 animate-in slide-in-from-left-4 px-0 sm:px-0">
                  <div className="mb-6 mx-2 sm:mx-0">
                    <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl border-l-4 border-de-gold p-6 text-white shadow-lg relative overflow-hidden">
                      <div className="flex items-start gap-4 relative z-10">
                        <div className="bg-white/10 p-3 rounded"><Sparkles className="text-de-gold" /></div>
                        <div>
                          <h3 className="font-bold text-lg mb-1 text-de-gold">{t.aiAnalysis} {userCase?.caseType ? `(${userCase.caseType})` : ''}</h3>
                          <p className="text-gray-300 text-sm leading-relaxed max-w-4xl">{aiInsight || "Loading insights..."}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* NEW: View My Cohort Button */}
                  {userCase && (
                      <div className="mx-2 sm:mx-0 mb-4 flex justify-end">
                          <button 
                              onClick={() => setShowCohortModal(true)}
                              className="bg-white border border-gray-300 hover:bg-gray-50 text-de-black px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
                          >
                              <Users size={16} className="text-de-gold" /> {t.viewCohort}
                          </button>
                      </div>
                  )}

                  <CaseForm 
                    initialData={userCase} 
                    userEmail={session?.email || ''} 
                    fantasyName={session?.fantasyName || 'Guest'}
                    existingNames={allFantasyNames}
                    lang={lang}
                    avgWaitTime={userTypeStats.avgDaysTotal}
                    onSave={handleUpdateCase} 
                    isMaintenanceMode={isMaintenance}
                    isGuest={isGuest}
                  />
              </div>
              </Suspense>
            )}

            {activeTab === 'dashboard' && (
              <Suspense fallback={<div className="col-span-1 xl:col-span-3"><LoadingSpinner /></div>}>
              <div className="col-span-1 xl:col-span-3 space-y-8 animate-in fade-in">
                  
                  <div className="bg-white p-4 mx-0 sm:mx-0 rounded-xl shadow-sm border border-gray-200 sticky top-20 z-40 bg-opacity-95 backdrop-blur">
                      <div className="flex justify-between items-center gap-3">
                         <button 
                            onClick={() => setShowFilters(!showFilters)}
                            className="flex items-center gap-2 text-de-black font-bold text-sm bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded transition-colors"
                         >
                            <Filter size={16} />
                            <span>{t.filters}</span>
                            {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                         </button>

                         <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-2 top-2.5 text-gray-400" size={14} />
                            <input 
                                type="text"
                                placeholder={t.searchDashboard}
                                value={dashboardSearchTerm}
                                onChange={(e) => setDashboardSearchTerm(e.target.value)}
                                className="w-full pl-8 pr-2 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-de-gold outline-none"
                            />
                         </div>
                      </div>
                      
                      {showFilters && (
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-4 pt-4 border-t border-gray-100 animate-in slide-in-from-top-2">
                            <select 
                                value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
                                className="border-gray-300 rounded text-sm p-2 bg-white cursor-pointer focus:ring-de-gold focus:border-de-gold"
                            >
                                <option value="All">{t.allMonths}</option>
                                {Array.from({length: 12}, (_, i) => (
                                    <option key={i} value={(i+1).toString()}>{getMonthName(i)}</option>
                                ))}
                            </select>

                            <select 
                                value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
                                className="border-gray-300 rounded text-sm p-2 bg-white cursor-pointer focus:ring-de-gold focus:border-de-gold"
                            >
                                <option value="All">{t.allYears}</option>
                                {Array.from({length: new Date().getFullYear() - 2020 + 2}, (_, i) => (2020 + i).toString()).map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>

                            <select 
                                value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)}
                                className="border-gray-300 rounded text-sm p-2 bg-white cursor-pointer focus:ring-de-gold focus:border-de-gold"
                            >
                                <option value="All">{t.allCountries}</option>
                                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <select 
                                value={filterType} onChange={(e) => setFilterType(e.target.value)}
                                className="border-gray-300 rounded text-sm p-2 bg-white cursor-pointer focus:ring-de-gold focus:border-de-gold"
                            >
                                <option value="All">{t.allTypes}</option>
                                {Object.values(CaseType).sort().map(c => <option key={c} value={c}>{c}</option>)}
                            </select>

                            <select 
                                value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                                className="border-gray-300 rounded text-sm p-2 bg-white cursor-pointer focus:ring-de-gold focus:border-de-gold"
                            >
                                <option value="All">{t.allStatuses}</option>
                                {Object.values(CaseStatus).map(s => (
                                    <option key={s} value={s}>{STATUS_TRANSLATIONS[lang][s] || s}</option>
                                ))}
                            </select>
                        </div>
                      )}
                  </div>

                  <WorldMapStats 
                     cases={filteredCases} 
                     lang={lang} 
                     loading={dataLoading} 
                     selectedCountryFilter={filterCountry} 
                     onSelectCountry={(c) => setFilterCountry(c)}
                     onSetFilterStatus={setFilterStatus}
                  />
                  <StatsDashboard cases={filteredCases} userCase={userCase} lang={lang} loading={dataLoading} />
                  <div className="mx-0 sm:mx-0"><CommunityFeed cases={filteredCases} lang={lang} /></div>
              </div>
              </Suspense>
            )}

            {(activeTab === 'faq' || activeTab === 'ai') && (
              <Suspense fallback={<div className="xl:col-span-3 col-span-1"><LoadingSpinner /></div>}>
              <div className="xl:col-span-3 col-span-1 px-2 sm:px-0">
                {activeTab === 'faq' && <FAQ lang={lang} userEmail={session?.email || ''} />}
                {activeTab === 'ai' && <AIModelTab userCase={userCase} stats={userTypeStats} lang={lang} />}
              </div>
              </Suspense>
            )}
          </div>

          {activeTab === 'dashboard' && (
              <div className="bg-white p-4 sm:p-6 rounded-none sm:rounded-xl shadow-sm border-y sm:border border-gray-200 mt-8 -mx-0 sm:mx-0">
                  <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="text-lg font-bold text-de-black">{viewGhosts ? t.ghostCases : t.activeCases}</h3>
                    {viewGhosts && (
                      <button 
                        onClick={() => setViewGhosts(false)}
                        className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full flex items-center gap-2 transition-colors"
                      >
                        <ArrowRight size={12} /> {t.backToActive}
                      </button>
                    )}
                  </div>
                  
                  <div className="flex flex-col sm:flex-row justify-between text-sm mb-4 gap-2">
                      <span className="text-gray-500">{t.showing} {filteredCases.length}</span>
                      <div className="flex gap-4">
                          <span className="text-de-red font-medium">{t.pausedCases}: {allCases.filter(c => !isGhostCase(c) && c.status !== CaseStatus.APPROVED && c.status !== CaseStatus.CLOSED).length - filteredCases.length}</span>
                          {ghostCount > 0 && (
                              <button 
                                  onClick={() => setViewGhosts(!viewGhosts)}
                                  className={`font-medium flex items-center gap-1 transition-colors hover:underline ${viewGhosts ? 'text-de-black font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                                  title={viewGhosts ? "Click to hide Ghost Cases" : "Click to view Ghost Cases"}
                              >
                                  {viewGhosts ? <EyeOff size={14} /> : <Eye size={14} />} {t.ghostCases}: {ghostCount}
                              </button>
                          )}
                      </div>
                  </div>
                  
                  <div className="border border-gray-100 rounded">
                      {filteredCases.length > 0 ? (
                          <div className="h-[400px] w-full overflow-y-auto">
                              {filteredCases.map((c, index) => (
                                  <CaseRow 
                                      key={c.id || index} 
                                      index={index} 
                                      style={{}} 
                                      data={{ cases: filteredCases, lang, onSelect: setSelectedDetailCase }} 
                                  />
                              ))}
                          </div>
                      ) : (
                          <div className="flex flex-col items-center justify-center p-8 text-gray-400">
                            <p className="italic text-sm mb-2">{t.noCasesFound}</p>
                            {viewGhosts && <p className="text-xs">No ghost cases match your current filters.</p>}
                          </div>
                      )}
                  </div>
              </div>
          )}

          <div className="bg-gray-100/50 backdrop-blur border border-gray-200 rounded p-4 mt-8 flex gap-3 opacity-80 hover:opacity-100 transition-opacity w-full max-w-full mx-0 sm:mx-0">
              <AlertCircle className="text-gray-400 flex-shrink-0" />
              <div><h4 className="font-bold text-sm text-de-black mb-1">{t.legalDisclaimer}</h4><p className="text-xs text-gray-600 leading-relaxed">{t.disclaimer}</p></div>
          </div>
          
          <div className="mt-8 py-4 flex flex-col items-center justify-center gap-2 text-gray-400 border-t border-gray-200">
              <div className="flex items-center gap-3">
                  <button onClick={handleToggleBgMode} className="flex items-center gap-1 text-xs hover:text-de-black transition-colors text-gray-500">
                      {bgMode === 'image' ? <Palette size={12} /> : <ImageIcon size={12} />}
                      {bgMode === 'image' ? t.simpleMode : t.scenicMode}
                  </button>
                  {bgMode === 'image' && (
                      <button onClick={handleShuffleBg} className="flex items-center gap-1 text-xs hover:text-de-black transition-colors text-gray-500">
                          <RefreshCw size={12} /> {t.shuffle}
                      </button>
                  )}
                  <span className="text-gray-300">|</span>
                  <button onClick={() => setShowAdmin(true)} className="flex items-center gap-1 text-xs hover:text-de-black transition-colors text-gray-500">
                      <Settings size={12} /> {t.ownerAccess}
                  </button>
              </div>
          </div>
        </main>
        
        </div>
      </div>

      <MobileNavBar activeTab={activeTab} setActiveTab={setActiveTab} t={t} isGuest={isGuest} />
    </>
  );
};

const TabButton = ({id, label, icon, active, onClick}: any) => (
    <button 
        onClick={() => onClick(id)}
        className={`px-6 py-3 font-bold text-sm rounded-t-lg transition-all whitespace-nowrap ${
            active === id 
            ? 'bg-white text-de-red border border-gray-300 border-b-white -mb-px shadow-sm' 
            : 'bg-gray-100/80 text-gray-500 hover:text-gray-700 hover:bg-gray-200/80'
        }`}
    >
        <span className="flex items-center gap-2">{icon} {label}</span>
    </button>
);

const CheckCircleIcon = () => (
    <svg className="w-5 h-5 text-de-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
);

export default App;