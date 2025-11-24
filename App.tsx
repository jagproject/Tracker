
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
  Link as LinkIcon
} from 'lucide-react';
import { CitizenshipCase, UserSession, CaseType, CaseStatus, Language } from './types';
import { generateFantasyUsername, generateStatisticalInsights } from './services/geminiService';
import { getCases, getCaseByEmail, upsertCase, getCaseByFantasyName, isCaseUnclaimed, claimCase, getAppConfig } from './services/storageService';
import { getDaysDiff, filterActiveCases, calculateAdvancedStats, calculateQuickStats, formatISODateToLocale } from './services/statsUtils';
import { logoutUser, subscribeToAuthChanges, isSupabaseEnabled } from './services/authService';
import { StatsDashboard } from './components/StatsCharts';
import { WorldMapStats } from './components/WorldMapStats';
import { CaseForm } from './components/CaseForm';
import { AdminTools } from './components/AdminTools';
import { FAQ } from './components/FAQ';
import { AIModelTab } from './components/AIModelTab';
import { CommunityFeed } from './components/CommunityFeed'; 
import { SuccessTicker } from './components/SuccessTicker'; 
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

// Current Version Timestamp
const APP_VERSION = "V.24.11.2025-11:05";

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
    return (
        <div style={style} className="px-0">
             <div 
                onDoubleClick={() => onSelect(c)}
                className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50 transition-colors border-b border-gray-100 cursor-pointer select-none"
             >
                <div className={`w-3 h-3 rounded-full flex-shrink-0 shadow-sm ${
                c.status === CaseStatus.APPROVED ? 'bg-green-500' : 
                c.status === CaseStatus.PROTOCOL_RECEIVED ? 'bg-blue-500' : 
                c.status === CaseStatus.SUBMITTED ? 'bg-gray-300' :
                c.status === CaseStatus.CLOSED ? 'bg-red-500' : 'bg-orange-400'
                }`} />
                <div className="flex-1 min-w-0 flex items-center justify-between">
                    <span className="font-bold text-de-black text-sm truncate mr-2">{c.fantasyName}</span>
                    <div className="flex items-center gap-4 text-gray-500 text-xs whitespace-nowrap">
                        <span className="truncate max-w-[120px] hidden sm:inline-block bg-gray-100 px-2 py-1 rounded border border-gray-200">{c.caseType}</span>
                        <span className="font-mono">{formatISODateToLocale(c.submissionDate, lang)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Detail Modal
const CaseDetailsModal = ({ caseData, onClose, lang }: { caseData: CitizenshipCase, onClose: () => void, lang: Language }) => {
    const t = TRANSLATIONS[lang];
    const statusT = STATUS_TRANSLATIONS[lang];

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-in fade-in" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="bg-de-black p-4 flex justify-between items-center text-white">
                    <h3 className="font-bold flex items-center gap-2"><User size={18} /> {caseData.fantasyName}</h3>
                    <button onClick={onClose}><X size={20} className="hover:text-de-gold" /></button>
                </div>
                <div className="p-6 space-y-4">
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
                         {caseData.docsRequestDate && (
                             <div className="flex justify-between">
                                <span className="text-xs text-gray-500 font-bold uppercase">{t.docsDate}</span>
                                <span className="text-sm font-mono text-orange-500">{formatISODateToLocale(caseData.docsRequestDate, lang)}</span>
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
                </div>
            </div>
        </div>
    );
};

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
  
  // Dashboard Filters State (Hoisted from StatsCharts)
  const [filterCountry, setFilterCountry] = useState<string>('All');
  const [filterMonth, setFilterMonth] = useState<string>('All');
  const [filterYear, setFilterYear] = useState<string>('All');
  const [filterType, setFilterType] = useState<string>('All');
  
  // Onboarding / Claiming State
  const [onboardingMode, setOnboardingMode] = useState<'CREATE' | 'CLAIM'>('CREATE');
  const [proposedUsername, setProposedUsername] = useState('');
  const [claimSearchTerm, setClaimSearchTerm] = useState('');
  const [selectedClaimCase, setSelectedClaimCase] = useState<CitizenshipCase | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // New state for Maintenance Mode
  const [isMaintenance, setIsMaintenance] = useState(false);

  // Random background image on mount with fallback
  const [bgImage] = useState<string>(() => {
    try {
      if (BG_IMAGES && BG_IMAGES.length > 0) {
        return BG_IMAGES[Math.floor(Math.random() * BG_IMAGES.length)];
      }
    } catch (e) {
      console.error("Error selecting background image", e);
    }
    return BG_IMAGES[0]; // Safe fallback
  });

  const t = TRANSLATIONS[lang];

  useEffect(() => {
    refreshData();
    
    const { unsubscribe } = subscribeToAuthChanges(async (user) => {
        if (user && user.email) {
            await handleSessionStart(user.email);
        } else if (!isMockAuth) {
            if (session && !session.email.includes('gmail')) {
               // Keep session if it was manual entry
            }
        }
    });

    return () => unsubscribe();
  }, [isMockAuth]);

  const refreshData = async () => {
    setDataLoading(true);
    // Simulate slight delay for Skeletons (Item 5)
    if (!dataLoading) await new Promise(r => setTimeout(r, 600)); 

    const loadedCases = getCases();
    setAllCases(loadedCases);
    const config = getAppConfig();
    setIsMaintenance(config.maintenanceMode);

    if (session) {
       // Re-find user case using normalized email
       const mine = loadedCases.find(c => c.email.trim().toLowerCase() === session.email.trim().toLowerCase());
       setUserCase(mine);
    }
    setDataLoading(false);
  };

  // Compute filtered cases for the Dashboard (affects charts, active list, and community notes)
  const filteredCases = useMemo(() => {
    let filtered = filterActiveCases(allCases); 
    if (filterCountry !== 'All') filtered = filtered.filter(c => c.countryOfApplication === filterCountry);
    if (filterType !== 'All') filtered = filtered.filter(c => c.caseType === filterType);
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
    return filtered;
  }, [allCases, filterCountry, filterMonth, filterYear, filterType]);

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
    const existingCase = getCaseByEmail(cleanEmail);
    
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

        const existingCaseByName = getCaseByFantasyName(finalName);
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
        const claimedCase = claimCase(selectedClaimCase, cleanEmail);
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
        if (twin) msgs.push(`A case submitted on ${userCase.submissionDate} just received their Aktenzeichen (Protocol)!`);
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
            if (cohort) msgs.push(`A case from your Protocol cohort (${myProto.getMonth()+1}/${myProto.getFullYear()}) just received their Urkunde!`);
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

  // Item 2: Optimistic UI Updates
  const handleUpdateCase = (updatedCase: CitizenshipCase) => {
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

    // 2. Commit to Storage
    upsertCase(updatedCase);
    
    // 3. Clear warnings
    setNotificationMsg(null); 
  };

  const handleLogout = async () => {
    await logoutUser();
    setSession(null);
    setEmailInput('');
    setUserCase(undefined);
    setNotificationMsg(null);
    setLoginStep('INPUT');
    setOnboardingMode('CREATE');
    setProposedUsername('');
    setSelectedClaimCase(null);
  };

  // Helper for month names
  const getMonthName = (monthIndex: number) => {
    try {
        const date = new Date(2023, monthIndex, 1);
        return date.toLocaleString(lang, { month: 'long' });
    } catch (e) {
        return new Date(2023, monthIndex, 1).toLocaleString('en', { month: 'long' });
    }
  };

  if (!session) {
    return (
      <div 
        className="min-h-screen flex flex-col justify-center items-center p-4 font-sans relative bg-gray-900 bg-cover bg-center transition-all duration-1000"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url('${bgImage}')` 
        }}
      >
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
                <form onSubmit={handleLoginSubmit} className="space-y-6">
                    <div>
                    <label className="block text-xs font-bold text-de-gray uppercase mb-2">{t.loginEmailLabel}</label>
                    <input 
                        type="email" 
                        value={emailInput} 
                        onChange={(e) => setEmailInput(e.target.value)} 
                        className="w-full px-4 py-3 rounded border border-gray-300 focus:ring-2 focus:ring-de-gold focus:border-transparent outline-none transition-all bg-white text-gray-900" 
                        placeholder={t.loginPlaceholder} 
                        required 
                    />
                    </div>
                    <button type="submit" disabled={loading} className="w-full bg-de-black hover:bg-gray-800 text-white font-bold py-3 px-4 rounded transition-colors flex justify-center items-center gap-2 shadow-md">
                    {t.loginButton} <ArrowRight size={16} />
                    </button>
                </form>
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
                 <button onClick={() => setShowAdmin(true)} className="flex items-center gap-1 text-xs hover:text-white transition-colors text-white/70">
                    <Settings size={12} /> {t.ownerAccess}
                 </button>
                 <span className="text-white/30">|</span>
                 <span className="text-[10px] font-mono text-white/50">{APP_VERSION}</span>
             </div>
        </div>
        {showAdmin && <AdminTools lang={lang} onClose={() => setShowAdmin(false)} onDataChange={refreshData} />}
      </div>
    );
  }

  return (
    <div 
        className="min-h-screen font-sans text-de-black bg-fixed bg-cover bg-center transition-all duration-1000"
        style={{
          backgroundImage: `url('${bgImage}')`
        }}
    >
      <div className="min-h-screen bg-gray-50/70 backdrop-blur-sm">
      {showAdmin && <AdminTools lang={lang} onClose={() => setShowAdmin(false)} onDataChange={refreshData} />}
      {selectedDetailCase && <CaseDetailsModal caseData={selectedDetailCase} onClose={() => setSelectedDetailCase(null)} lang={lang} />}

      <nav className="bg-de-black/95 backdrop-blur text-white shadow-lg sticky top-0 z-50 border-b-4 border-de-red">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
              <div className="hidden md:flex flex-col items-end border-l border-gray-700 pl-4">
                <span className="text-sm font-bold text-de-gold">{session.fantasyName}</span>
              </div>
              <button onClick={handleLogout} className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-300 hover:text-white"><LogOut size={20} /></button>
            </div>
          </div>
        </div>
      </nav>

      {activeTab === 'dashboard' && <SuccessTicker cases={allCases} lang={lang} />}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="block md:hidden mb-6"><LanguageSelector lang={lang} setLang={setLang} /></div>
        
        {isMaintenance && (
             <div className="bg-orange-50 border border-orange-200 text-orange-800 p-4 rounded shadow mb-6 flex items-start gap-3 animate-in slide-in-from-top-2">
                <Power className="flex-shrink-0 mt-1" size={20} />
                <div className="pr-6">
                    <p className="font-bold">{t.maintenance}</p>
                    <p className="text-sm">{t.maintenanceMessage}</p>
                </div>
            </div>
        )}

        {notificationMsg && !isMaintenance && (
          <div className="bg-de-gold text-de-black p-4 rounded shadow mb-6 flex items-start gap-3 animate-in slide-in-from-top-2 relative">
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

        <div className="mb-8">
          <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded border-l-4 border-de-gold p-6 text-white shadow-lg relative overflow-hidden">
            <div className="flex items-start gap-4 relative z-10">
              <div className="bg-white/10 p-3 rounded"><Sparkles className="text-de-gold" /></div>
              <div>
                <h3 className="font-bold text-lg mb-1 text-de-gold">{t.aiAnalysis} {userCase?.caseType ? `(${userCase.caseType})` : ''}</h3>
                <p className="text-gray-300 text-sm leading-relaxed max-w-4xl">{aiInsight || "Loading insights..."}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-1 mb-6 border-b border-gray-300 overflow-x-auto">
          <TabButton id='myCase' label={t.myCase} icon={<User size={16} />} active={activeTab} onClick={setActiveTab} />
          <TabButton id='dashboard' label={t.dashboard} icon={<LayoutDashboard size={16} />} active={activeTab} onClick={setActiveTab} />
          <TabButton id='ai' label={t.aiModel} icon={<Monitor size={16} />} active={activeTab} onClick={setActiveTab} />
          <TabButton id='faq' label={t.faq} icon={<HelpCircle size={16} />} active={activeTab} onClick={setActiveTab} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-8">
          {activeTab === 'myCase' && (
             <div className="col-span-1 xl:col-span-3 animate-in slide-in-from-left-4">
                <CaseForm 
                  initialData={userCase} 
                  userEmail={session.email} 
                  fantasyName={session.fantasyName}
                  existingNames={allFantasyNames}
                  lang={lang}
                  avgWaitTime={userTypeStats.avgDaysTotal}
                  onSave={handleUpdateCase} 
                  isMaintenanceMode={isMaintenance}
                />
             </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="col-span-1 xl:col-span-3 space-y-8 animate-in fade-in">
                
                {/* GLOBAL DASHBOARD FILTERS */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-center sticky top-20 z-40 bg-opacity-95 backdrop-blur">
                    <div className="flex items-center gap-2 text-de-black font-bold">
                        <Filter size={18} />
                        <span>{t.filters}</span>
                    </div>
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
                    <div className="grid grid-cols-2 gap-2">
                        <select 
                            value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
                            className="border-gray-300 rounded text-sm p-2 bg-white cursor-pointer focus:ring-de-gold focus:border-de-gold"
                        >
                            <option value="All">{t.allYears}</option>
                            {[2021, 2022, 2023, 2024, 2025].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <select 
                            value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
                            className="border-gray-300 rounded text-sm p-2 bg-white capitalize cursor-pointer focus:ring-de-gold focus:border-de-gold"
                        >
                            <option value="All">{t.allMonths}</option>
                            {Array.from({length: 12}, (_, i) => <option key={i+1} value={i+1}>{getMonthName(i)}</option>)}
                        </select>
                    </div>
                </div>

                {/* Dashboard Components receiving FILTERED cases & Loading state for Skeletons */}
                <WorldMapStats cases={filteredCases} lang={lang} loading={dataLoading} />
                <StatsDashboard cases={filteredCases} userCase={userCase} lang={lang} loading={dataLoading} />
                <CommunityFeed cases={filteredCases} lang={lang} />
            </div>
          )}

          {(activeTab === 'faq' || activeTab === 'ai') && (
            <div className="xl:col-span-3 col-span-1">
              {activeTab === 'faq' && <FAQ lang={lang} userEmail={session.email} />}
              {/* IMPORTANT: Passing userTypeStats here satisfies the requirement for AI analysis to be by Case Type */}
              {activeTab === 'ai' && <AIModelTab userCase={userCase} stats={userTypeStats} lang={lang} />}
            </div>
          )}
        </div>

        {activeTab === 'dashboard' && (
            <div className="bg-white p-6 rounded shadow-sm border border-gray-200 mt-8">
                <h3 className="text-lg font-bold text-de-black mb-4 border-b pb-2">{t.activeCases}</h3>
                <div className="flex justify-between text-sm mb-4">
                    <span className="text-gray-500">{t.showing} {filteredCases.length}</span>
                    <span className="text-de-red font-medium">{t.pausedCases}: {allCases.length - filterActiveCases(allCases).length}</span>
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
                        <p className="text-gray-400 italic text-sm p-4 text-center">{t.noCasesFound}</p>
                    )}
                </div>
            </div>
        )}

        <div className="bg-gray-100/50 backdrop-blur border border-gray-200 rounded p-4 mt-8 flex gap-3 opacity-80 hover:opacity-100 transition-opacity w-full max-w-full">
            <AlertCircle className="text-gray-400 flex-shrink-0" />
            <div><h4 className="font-bold text-sm text-de-black mb-1">Legal Disclaimer</h4><p className="text-xs text-gray-600 leading-relaxed">{t.disclaimer}</p></div>
        </div>
        
        <div className="mt-8 py-4 flex flex-col items-center justify-center gap-2 text-gray-400 border-t border-gray-200">
             <div className="flex items-center gap-3">
                 <button onClick={() => setShowAdmin(true)} className="flex items-center gap-1 text-xs hover:text-de-black transition-colors">
                    <Settings size={12} /> {t.ownerAccess}
                 </button>
                 <span className="text-gray-300">|</span>
                 <span className="text-[10px] font-mono opacity-60">{APP_VERSION}</span>
             </div>
        </div>
      </main>
      </div>
    </div>
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
