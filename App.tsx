import React, { useState, useEffect, useMemo } from 'react';
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
  LogIn
} from 'lucide-react';
import { CitizenshipCase, UserSession, CaseType, CaseStatus, Language } from './types';
import { generateFantasyUsername, generateStatisticalInsights } from './services/geminiService';
import { fetchCases, fetchCaseByEmail, upsertCase, fetchCaseByFantasyName, isCaseUnclaimed, claimCase, getAppConfig, subscribeToCases, getLastFetchError } from './services/storageService';
import { getDaysDiff, filterActiveCases, calculateAdvancedStats, calculateQuickStats, formatISODateToLocale, isGhostCase, formatDuration } from './services/statsUtils';
import { logoutUser, subscribeToAuthChanges, isSupabaseEnabled } from './services/authService';
import { StatsDashboard } from './components/StatsCharts';
import { WorldMapStats } from './components/WorldMapStats';
import { CaseForm } from './components/CaseForm';
import { AdminTools } from './components/AdminTools';
import { FAQ } from './components/FAQ';
import { AIModelTab } from './components/AIModelTab';
import { CommunityFeed } from './components/CommunityFeed'; 
import { SuccessTicker } from './components/SuccessTicker'; 
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal';
import { TRANSLATIONS, COUNTRIES, STATUS_TRANSLATIONS } from './constants';

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

// Detail Modal with Comparison Feature (Suggestion 6)
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
        let myClass = "text-gray-700";
        let theirClass = "text-gray-700";
        
        if (isDuration && myVal && theirVal) {
             if (myVal < theirVal) { myClass = "text-green-600 font-bold"; theirClass = "text-red-400"; }
             else if (myVal > theirVal) { myClass = "text-red-400"; theirClass = "text-green-600 font-bold"; }
        }

        return (
            <div className="grid grid-cols-3 gap-2 text-xs border-b border-gray-100 py-2">
                 <div className={`text-center font-mono ${myClass}`}>{displayMy}</div>
                 <div className="text-center font-bold text-gray-400 uppercase tracking-tighter text-[10px] self-center">{label}</div>
                 <div className={`text-center font-mono ${theirClass}`}>{displayTheir}</div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-in fade-in" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="bg-de-black p-4 flex justify-between items-center text-white">
                    <h3 className="font-bold flex items-center gap-2">
                        {compareMode ? <ArrowLeftRight size={18} className="text-de-gold" /> : <User size={18} />}
                        {compareMode ? "Compare Cases" : caseData.fantasyName}
                    </h3>
                    <button onClick={onClose}><X size={20} className="hover:text-de-gold" /></button>
                </div>
                
                <div className="p-6 space-y-4">
                     {compareMode && userCase ? (
                        <div className="animate-in slide-in-from-right-4">
                            <div className="grid grid-cols-3 gap-2 mb-4 text-center pb-2 border-b-2 border-gray-100">
                                <div className="font-bold text-de-gold truncate">{userCase.fantasyName}</div>
                                <div className="text-gray-300 text-xs self-center">VS</div>
                                <div className="font-bold text-gray-700 truncate">{caseData.fantasyName}</div>
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
                                className="mt-6 w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded uppercase transition-colors"
                            >
                                Back to Details
                            </button>
                        </div>
                     ) : (
                        <>
                             {isGhost && (
                                <div className="bg-gray-100 p-3 rounded border border-gray-200 text-xs text-gray-500 flex items-start gap-2">
                                    <Ghost size={16} className="shrink-0 mt-0.5" />
                                    <span>This case is categorized as a "Ghost Case" due to long inactivity.</span>
                                </div>
                             )}
                             <div className="grid grid-cols-2 gap-4 text-sm">
                                 <div>
                                     <span className="text-xs text-gray-500 font-bold uppercase block">{t.country}</span>
                                     <span className="font-medium">{caseData.countryOfApplication}</span>
                                 </div>
                                 <div>
                                     <span className="text-xs text-gray-500 font-bold uppercase block">{t.caseType}</span>
                                     <span className="font-medium">{caseData.caseType}</span>
                                 </div>
                             </div>
                             <div className="border-t border-gray-100 pt-3 space-y-2">
                                 <div className="flex justify-between">
                                    <span className="text-xs text-gray-500 font-bold uppercase">{t.submissionDate}</span>
                                    <span className="text-sm font-mono">{formatISODateToLocale(caseData.submissionDate, lang)}</span>
                                 </div>
                                 {caseData.protocolDate && (
                                     <div className="flex justify-between">
                                        <span className="text-xs text-gray-500 font-bold uppercase">{t.protocolDate}</span>
                                        <span className="text-sm font-mono text-blue-600">{formatISODateToLocale(caseData.protocolDate, lang)}</span>
                                     </div>
                                 )}
                                 {caseData.approvalDate && (
                                     <div className="flex justify-between bg-green-50 p-1 rounded">
                                        <span className="text-xs text-green-700 font-bold uppercase">{t.approvalDate}</span>
                                        <span className="text-sm font-mono text-green-700 font-bold">{formatISODateToLocale(caseData.approvalDate, lang)}</span>
                                     </div>
                                 )}
                                 {caseData.closedDate && (
                                     <div className="flex justify-between bg-red-50 p-1 rounded">
                                        <span className="text-xs text-red-700 font-bold uppercase">{t.closedDate}</span>
                                        <span className="text-sm font-mono text-red-700 font-bold">{formatISODateToLocale(caseData.closedDate, lang)}</span>
                                     </div>
                                 )}
                             </div>
                             <div className="border-t border-gray-100 pt-3 text-center">
                                 <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase ${
                                    caseData.status === CaseStatus.APPROVED ? 'bg-green-100 text-green-800' :
                                    caseData.status === CaseStatus.CLOSED ? 'bg-red-100 text-red-800' :
                                    'bg-gray-100 text-gray-600'
                                 }`}>
                                     {statusT[caseData.status] || caseData.status}
                                 </span>
                             </div>

                             {userCase && userCase.id !== caseData.id && (
                                <button 
                                    onClick={() => setCompareMode(true)}
                                    className="w-full mt-4 bg-de-gold/10 hover:bg-de-gold/20 text-de-black/80 font-bold py-2 rounded text-sm flex items-center justify-center gap-2 border border-de-gold/30 transition-colors"
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
  const [fetchError, setFetchError] = useState<string | null>(null); // New state for fetch errors
  
  // Dashboard Filters State (Hoisted from StatsCharts)
  const [filterCountry, setFilterCountry] = useState<string>('All');
  const [filterMonth, setFilterMonth] = useState<string>('All');
  const [filterYear, setFilterYear] = useState<string>('All');
  const [filterType, setFilterType] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All'); // New Status Filter
  const [dashboardSearchTerm, setDashboardSearchTerm] = useState<string>(''); // NEW: Dashboard Search
  
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
    // Simulate slight delay for Skeletons (Item 5) ONLY if not silent
    if (!silent && !dataLoading) await new Promise(r => setTimeout(r, 600)); 

    const loadedCases = await fetchCases();
    setAllCases(loadedCases);
    setFetchError(getLastFetchError()); // Check if there was an error fetching
    
    const config = getAppConfig();
    setIsMaintenance(config.maintenanceMode);

    if (session) {
       // Re-find user case using normalized email
       const mine = loadedCases.find(c => c.email.trim().toLowerCase() === session.email.trim().toLowerCase());
       setUserCase(mine);
    }
    if (!silent) setDataLoading(false);
  };

  // Compute filtered cases for the Dashboard (affects charts, active list, and community notes)
  const filteredCases = useMemo(() => {
    let filtered;

    if (viewGhosts) {
        // Show ONLY ghost cases if toggled
        filtered = allCases.filter(c => isGhostCase(c));
    } else {
        // Normal mode: Show active cases (excludes ghosts via filterActiveCases)
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
    
    // NEW: Text Search Filter
    if (dashboardSearchTerm) {
        const term = dashboardSearchTerm.toLowerCase();
        filtered = filtered.filter(c => 
            c.fantasyName.toLowerCase().includes(term) ||
            c.countryOfApplication.toLowerCase().includes(term)
        );
    }

    return filtered;
  }, [allCases, filterCountry, filterMonth, filterYear, filterType, filterStatus, viewGhosts, dashboardSearchTerm]);

  // Compute Ghost Count (Total available in DB)
  const ghostCount = useMemo(() => {
     return allCases.filter(c => isGhostCase(c)).length;
  }, [allCases]);

  // Compute Unclaimed Cases for Search
  const unclaimedCases = useMemo(() => {
      // 1. Get all unclaimed cases
      const unclaimed = allCases.filter(c => isCaseUnclaimed(c));
      
      // 2. Filter by search term if provided
      if (!claimSearchTerm) return unclaimed;
      
      const lowerTerm = claimSearchTerm.toLowerCase();
      return unclaimed.filter(c => 
          c.fantasyName.toLowerCase().includes(lowerTerm) ||
          c.countryOfApplication.toLowerCase().includes(lowerTerm) ||
          // SEARCH by Date (Fix for user request)
          (c.submissionDate && c.submissionDate.includes(lowerTerm))
      );
  }, [allCases, claimSearchTerm]);

  const handleSessionStart = async (email: string) => {
    if (isMaintenance) return; // Block login if maintenance

    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 800));

    // TRIM and LOWERCASE EMAIL to ensure robust matching
    const cleanEmail = email.trim().toLowerCase();
    const existingCase = await fetchCaseByEmail(cleanEmail);
    
    if (existingCase) {
        // Case exists with this email - Log in directly
        setSession({
            email: cleanEmail,
            fantasyName: existingCase.fantasyName,
            isAuthenticated: true,
            language: 'en'
        });
        setUserCase(existingCase);
        setLoading(false);
        setLoginStep('INPUT'); // Reset login step, UI will now show dashboard via session check
    } else {
        // Case not found by email - Go to Onboarding
        // User MUST choose to Create New OR Claim Existing
        const genName = await generateFantasyUsername(cleanEmail.split('@')[0]);
        setProposedUsername(genName);
        setOnboardingMode('CREATE'); // Default to create
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

        // Create New User
        const newSession: UserSession = {
            email: cleanEmail,
            fantasyName: finalName,
            isAuthenticated: true,
            language: 'en'
        };
        setSession(newSession);
        
        // IMPORTANT: We do NOT create the case object here. 
        // We let the CaseForm handle the "first save" or initialize an empty one.
        // But for context, we can init a dummy one in state so CaseForm renders correctly.
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

        // Claim logic
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

  // Calculate Case-Type specific stats for the AI Prediction Tab (as requested by user)
  const userTypeStats = useMemo(() => {
     if (!userCase) return globalStats;
     const typeSpecificCases = activeCases.filter(c => c.caseType === userCase.caseType);
     // Fallback to global if not enough data
     return typeSpecificCases.length > 2 ? calculateQuickStats(typeSpecificCases) : globalStats;
  }, [userCase, activeCases, globalStats]);

  // AI Insights Effect
  useEffect(() => {
    if (activeCases.length > 0) {
      let targetCases = activeCases;
      
      // Feature: Filter AI Analysis by User Case Type if available
      if (userCase && userCase.caseType) {
        const specificCases = activeCases.filter(c => c.caseType === userCase.caseType);
        // Only switch to specific analysis if we have a decent sample size, else fallback to global
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
      setActiveTab('dashboard'); // Default to dashboard for guests
      setUserCase(undefined);
      setSession({
          email: 'guest@tracker.local',
          fantasyName: 'Guest',
          isAuthenticated: false,
          language: 'en'
      });
  };

  // Item 2: Optimistic UI Updates
  const handleUpdateCase = async (updatedCase: CitizenshipCase) => {
    // 1. Optimistic Update (Immediate)
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

    // 2. Commit to Storage (Async)
    await upsertCase(updatedCase);
    
    // 3. Clear warnings
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
    setPrivacyAccepted(false); // Reset privacy
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
        {showPrivacyModal && <PrivacyPolicyModal lang={lang} onClose={() => setShowPrivacyModal(false)} />}
        
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
                            {/* Fake Email Disclaimer */}
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

                        {/* Privacy Policy Checkbox */}
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
                    
                    {/* Guest Access Button */}
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

                        {/* Onboarding Tabs */}
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
                                                        {/* FIX: Ensure date format is readable in search list */}
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
        {showAdmin && <AdminTools lang={lang} onClose={() => setShowAdmin(false)} onDataChange={refreshData} />}
      </div>
    );
  }

  return (
    <>
      {showAdmin && <AdminTools lang={lang} onClose={() => setShowAdmin(false)} onDataChange={refreshData} />}
      {selectedDetailCase && <CaseDetailsModal caseData={selectedDetailCase} userCase={userCase} onClose={() => setSelectedDetailCase(null)} lang={lang} />}

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
                
                {/* User Info or Guest Info */}
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

        {activeTab === 'dashboard' && <SuccessTicker cases={allCases} lang={lang} />}

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

          {/* FETCH ERROR WARNING (OFFLINE MODE) */}
          {fetchError && !isMaintenance && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded shadow mb-6 mx-0 sm:mx-0 flex items-start gap-3 animate-in slide-in-from-top-2">
              <AlertCircle className="flex-shrink-0 mt-1" size={20} />
              <div className="pr-6">
                  <p className="font-bold">Connection Issue</p>
                  <p className="text-sm">{fetchError}. Some community cases may be missing or outdated.</p>
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
              <div className="col-span-1 xl:col-span-3 animate-in slide-in-from-left-4 px-0 sm:px-0">
                  {/* AI Analysis Banner - Moved here from Dashboard */}
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
            )}

            {activeTab === 'dashboard' && (
              <div className="col-span-1 xl:col-span-3 space-y-8 animate-in fade-in">
                  
                  {/* GLOBAL DASHBOARD FILTERS */}
                  <div className="bg-white p-4 mx-0 sm:mx-0 rounded-xl shadow-sm border border-gray-200 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-8 gap-3 items-center sticky top-20 z-40 bg-opacity-95 backdrop-blur">
                      <div className="flex items-center gap-2 text-de-black font-bold col-span-2 md:col-span-1">
                          <Filter size={18} />
                          <span>{t.filters}</span>
                      </div>
                      
                      {/* Dashboard Search */}
                      <div className="relative col-span-2 lg:col-span-2">
                        <Search className="absolute left-2 top-2.5 text-gray-400" size={14} />
                        <input 
                            type="text"
                            placeholder={t.searchDashboard}
                            value={dashboardSearchTerm}
                            onChange={(e) => setDashboardSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-2 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-de-gold outline-none"
                        />
                      </div>

                      {/* NEW: Month Filter */}
                      <select 
                          value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
                          className="border-gray-300 rounded text-sm p-2 bg-white cursor-pointer focus:ring-de-gold focus:border-de-gold"
                      >
                          <option value="All">{t.allMonths}</option>
                          {Array.from({length: 12}, (_, i) => (
                              <option key={i} value={(i+1).toString()}>{getMonthName(i)}</option>
                          ))}
                      </select>

                      {/* NEW: Year Filter */}
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

                      {/* NEW: Status Filter */}
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

                  {/* Dashboard Components receiving FILTERED cases & Loading state for Skeletons */}
                  <WorldMapStats cases={filteredCases} lang={lang} loading={dataLoading} />
                  <StatsDashboard cases={filteredCases} userCase={userCase} lang={lang} loading={dataLoading} />
                  <div className="mx-0 sm:mx-0"><CommunityFeed cases={filteredCases} lang={lang} /></div>
              </div>
            )}

            {(activeTab === 'faq' || activeTab === 'ai') && (
              <div className="xl:col-span-3 col-span-1 px-2 sm:px-0">
                {activeTab === 'faq' && <FAQ lang={lang} userEmail={session?.email || ''} />}
                {/* IMPORTANT: Passing userTypeStats here satisfies the requirement for AI analysis to be by Case Type */}
                {activeTab === 'ai' && <AIModelTab userCase={userCase} stats={userTypeStats} lang={lang} />}
              </div>
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
                  
                  {/* List without Virtual Scrolling */}
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