
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { 
  LayoutDashboard, Globe, Users, ShieldCheck, LogOut, AlertCircle, Sparkles, BellRing, Settings, Mail, Check, HelpCircle, Monitor, User, Power, ChevronDown, ChevronUp, Filter, Search, UserPlus, Link as LinkIcon, Ghost, Eye, EyeOff, Palette, Image as ImageIcon, RefreshCw, LogIn, Database, X, ArrowRight, Edit3, Loader2, Info, ShieldAlert, FileLock
} from 'lucide-react';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { CitizenshipCase, UserSession, CaseType, CaseStatus, Language } from './types';
import { generateFantasyUsername, generateStatisticalInsights } from './services/geminiService';
import { fetchCases, fetchCaseByEmail, upsertCase, fetchCaseByFantasyName, isCaseUnclaimed, claimCase, getAppConfig, subscribeToCases, getLastFetchError, fetchGlobalConfig, fetchUnclaimedCases } from './services/storageService';
import { getDaysDiff, filterActiveCases, calculateQuickStats, formatISODateToLocale, isGhostCase, formatDuration } from './services/statsUtils';
import { logoutUser, subscribeToAuthChanges, isSupabaseEnabled } from './services/authService';
import { TRANSLATIONS, COUNTRIES, STATUS_TRANSLATIONS } from './constants';
import { useAppStore } from './store/useAppStore';
import { InfoTip } from './components/ui/InfoTip';
import { AnimatePresence, motion } from 'framer-motion';

const StatsDashboard = React.lazy(() => import('./components/StatsCharts').then(module => ({ default: module.StatsDashboard })));
const WorldMapStats = React.lazy(() => import('./components/WorldMapStats').then(module => ({ default: module.WorldMapStats })));
const CaseForm = React.lazy(() => import('./components/CaseForm').then(module => ({ default: module.CaseForm })));
const AdminTools = React.lazy(() => import('./components/AdminTools').then(module => ({ default: module.AdminTools })));
const FAQ = React.lazy(() => import('./components/FAQ').then(module => ({ default: module.FAQ })));
const AIModelTab = React.lazy(() => import('./components/AIModelTab').then(module => ({ default: module.AIModelTab })));
const CommunityFeed = React.lazy(() => import('./components/CommunityFeed').then(module => ({ default: module.CommunityFeed })));
const SuccessTicker = React.lazy(() => import('./components/SuccessTicker').then(module => ({ default: module.SuccessTicker })));
const PrivacyPolicyModal = React.lazy(() => import('./components/PrivacyPolicyModal').then(module => ({ default: module.PrivacyPolicyModal })));

const BG_IMAGES = [
  "https://images.unsplash.com/photo-1534313314376-a7f2c8c5c944?q=80&w=2070&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?q=80&w=2070&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?q=80&w=2070&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1516212110294-4d834927b58b?q=80&w=2070&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1590059393160-c4d632230491?q=80&w=2070&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1563828759539-773a9072bd0d?q=80&w=2070&auto=format&fit=crop"
];

const ToastContainer = () => {
    const { notifications, removeNotification } = useAppStore();
    return (
        <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2">
            <AnimatePresence>
            {notifications.map(n => (
                <motion.div key={n.id} initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}
                    className={`p-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[250px] ${
                        n.type === 'success' ? 'bg-green-600 text-white' : 
                        n.type === 'error' ? 'bg-red-600 text-white' : 
                        n.type === 'warning' ? 'bg-orange-500 text-white' : 'bg-gray-800 text-white'
                    }`}
                >
                    {n.type === 'success' ? <Check size={18}/> : n.type === 'error' ? <AlertCircle size={18}/> : <Info size={18}/>}
                    <span className="text-sm font-bold flex-1">{n.message}</span>
                    <button onClick={() => removeNotification(n.id)} className="opacity-50 hover:opacity-100"><X size={16}/></button>
                </motion.div>
            ))}
            </AnimatePresence>
        </div>
    );
};

const LanguageSelector = () => {
  const { lang, setLang } = useAppStore();
  return (
    <div className="flex items-center gap-2 text-xs font-medium border border-gray-700 rounded px-2 py-1 bg-white/90 dark:bg-black/50 backdrop-blur-sm shadow-sm">
        <Globe size={14} className="text-gray-500 dark:text-gray-300" />
        {['en', 'es', 'it', 'pt', 'de'].map(l => (
            <React.Fragment key={l}>
                <button onClick={() => setLang(l as Language)} className={`hover:text-de-gold transition-colors ${lang === l ? 'text-de-gold font-bold' : 'text-gray-500 dark:text-gray-400'}`}>{l.toUpperCase()}</button>
                {l !== 'de' && <span className="text-gray-300">|</span>}
            </React.Fragment>
        ))}
    </div>
  );
};

const MobileCaseCard = ({ c, lang, onSelect }: { c: CitizenshipCase, lang: Language, onSelect: (c: CitizenshipCase) => void }) => {
    const isGhost = isGhostCase(c);
    return (
        <div onClick={() => onSelect(c)} className={`p-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer ${isGhost ? 'opacity-60 bg-gray-50' : 'bg-white dark:bg-gray-900'}`}>
            <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-de-black dark:text-white flex items-center gap-2">{c.fantasyName}{isGhost && <Ghost size={14} className="text-gray-400" />}</span>
                <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${c.status === CaseStatus.APPROVED ? 'bg-green-100 text-green-800' : c.status === CaseStatus.CLOSED ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_TRANSLATIONS[lang][c.status]}
                </span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 flex justify-between items-center">
                <span>{c.countryOfApplication}</span><span className="font-mono">{formatISODateToLocale(c.submissionDate, lang)}</span>
            </div>
        </div>
    );
};

const CaseRow: React.FC<{ index: number, style: React.CSSProperties, data: { cases: CitizenshipCase[], lang: Language, onSelect: (c: CitizenshipCase) => void, isMobile: boolean } }> = ({ index, style, data }) => {
    const { cases, lang, onSelect, isMobile } = data;
    const c = cases[index];
    if (!c) return null;
    if (isMobile) return <div style={style}><MobileCaseCard c={c} lang={lang} onSelect={onSelect} /></div>;
    const isGhost = isGhostCase(c);
    return (
        <div style={style} className="px-0">
             <div onDoubleClick={() => onSelect(c)} onClick={() => onSelect(c)} className={`flex items-center gap-3 px-3 sm:px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800 cursor-pointer select-none h-full ${isGhost ? 'bg-gray-50/50 dark:bg-gray-800/50' : ''}`}>
                <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0 shadow-sm ${isGhost ? 'bg-gray-400' : c.status === CaseStatus.APPROVED ? 'bg-green-500' : c.status === CaseStatus.PROTOCOL_RECEIVED ? 'bg-blue-500' : c.status === CaseStatus.SUBMITTED ? 'bg-gray-300' : c.status === CaseStatus.CLOSED ? 'bg-red-500' : 'bg-orange-400'}`} />
                <div className="flex-1 min-w-0 flex items-center justify-between">
                    <span className={`font-bold text-sm truncate mr-2 flex items-center gap-2 ${isGhost ? 'text-gray-500' : 'text-de-black dark:text-gray-200'}`}>{c.fantasyName}{isGhost && <Ghost size={12} className="text-gray-400" />}</span>
                    <div className="flex items-center gap-2 sm:gap-4 text-gray-500 text-xs whitespace-nowrap">
                        <span className="truncate max-w-[80px] sm:max-w-[120px] hidden xs:inline-block bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 text-[10px] sm:text-xs">{c.caseType}</span>
                        <span className="font-mono text-[10px] sm:text-xs">{formatISODateToLocale(c.submissionDate, lang)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
  const { 
      allCases, userCase, session, lang, activeTab, showAdmin, bgMode, bgImage, filters, fetchError, isMaintenance, isDataLoading,
      setLang, setActiveTab, setShowAdmin, setBgMode, setBgImage, setSession, setUserCase, setFilters, refreshData, optimisticUpdateCase, getFilteredCases, getGhostCount
  } = useAppStore();

  const [emailInput, setEmailInput] = useState('');
  const [loginStep, setLoginStep] = useState<'INPUT' | 'CONFIRM' | 'USERNAME_SELECTION'>('INPUT');
  const [loading, setLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<string>("");
  const [selectedDetailCase, setSelectedDetailCase] = useState<CitizenshipCase | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [onboardingMode, setOnboardingMode] = useState<'CREATE' | 'CLAIM'>('CREATE');
  const [proposedUsername, setProposedUsername] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const t = TRANSLATIONS[lang];

  useEffect(() => {
      const handleResize = () => setIsMobile(window.innerWidth < 768);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    refreshData();
    if (!bgImage && BG_IMAGES.length > 0) setBgImage(BG_IMAGES[Math.floor(Math.random() * BG_IMAGES.length)]);
    const { unsubscribe } = subscribeToAuthChanges(async (user) => { if (user && user.email) await handleSessionStart(user.email); });
    const channel = subscribeToCases(() => refreshData(true));
    return () => { unsubscribe(); if (channel) channel.unsubscribe(); };
  }, []);

  const filteredCases = useMemo(() => getFilteredCases(), [allCases, filters]);
  const activeCases = useMemo(() => filterActiveCases(allCases), [allCases]);

  const handleSessionStart = async (email: string) => {
    if (isMaintenance) return; 
    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    const existingCase = await fetchCaseByEmail(cleanEmail);
    if (existingCase) {
        setSession({ email: cleanEmail, fantasyName: existingCase.fantasyName, isAuthenticated: true, language: 'en' });
        setUserCase(existingCase);
        setLoading(false);
        setLoginStep('INPUT'); 
    } else {
        setLoginStep('USERNAME_SELECTION');
        const genName = await generateFantasyUsername(cleanEmail.split('@')[0]);
        setProposedUsername(genName);
        setOnboardingMode('CREATE'); 
        setLoading(false);
    }
  };

  const handleFinalizeOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isMaintenance) return;
    setUsernameError(null);
    setLoading(true);
    const cleanEmail = emailInput.trim().toLowerCase();
    const finalName = proposedUsername.trim();
    if (finalName.length < 3) { setUsernameError(t.usernameShort); setLoading(false); return; }
    const existing = await fetchCaseByFantasyName(finalName);
    if (existing) { setUsernameError(t.usernameTaken); setLoading(false); return; }
    
    const newUser = { id: crypto.randomUUID(), email: cleanEmail, fantasyName: finalName, caseType: CaseType.STAG_5, countryOfApplication: 'Unknown', status: CaseStatus.SUBMITTED, submissionDate: new Date().toISOString().split('T')[0], lastUpdated: new Date().toISOString() };
    await upsertCase(newUser);
    setSession({ email: cleanEmail, fantasyName: finalName, isAuthenticated: true, language: 'en' });
    setUserCase(newUser);
    setLoginStep('INPUT');
    setLoading(false);
  };

  const userTypeStats = useMemo(() => {
     if (!userCase) return calculateQuickStats(activeCases);
     const typeSpecific = activeCases.filter(c => c.caseType === userCase.caseType);
     return typeSpecific.length > 2 ? calculateQuickStats(typeSpecific) : calculateQuickStats(activeCases);
  }, [userCase, activeCases]);

  useEffect(() => {
    if (activeCases.length > 0) {
      let targetCases = activeCases;
      if (userCase) {
        const specific = activeCases.filter(c => c.caseType === userCase.caseType);
        if (specific.length >= 3) targetCases = specific;
      }
      generateStatisticalInsights(calculateQuickStats(targetCases), targetCases, lang).then(setAiInsight);
    }
  }, [activeCases, userCase, lang]); 

  const handleLoginSubmit = async (e: React.FormEvent) => { e.preventDefault(); if (!emailInput || isMaintenance) return; setLoginStep('CONFIRM'); };
  const handleLoginConfirm = async () => { if (!emailInput || isMaintenance) return; await handleSessionStart(emailInput); };
  const enterGuestMode = () => { setIsGuest(true); setActiveTab('dashboard'); setSession({ email: 'guest@tracker.local', fantasyName: 'Guest', isAuthenticated: false, language: 'en' }); };
  const handleLogout = async () => { if (!isGuest) await logoutUser(); setSession(null); setEmailInput(''); setUserCase(undefined); setLoginStep('INPUT'); setIsGuest(false); };

  const Footer = () => (
      <footer className="mt-auto py-8 border-t border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-black/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4">
              <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                  <div className="text-center md:text-left space-y-1">
                      <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">{t.title}</p>
                      <p className="text-xs text-gray-500 max-w-sm leading-relaxed">{t.disclaimer}</p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-4 text-xs font-bold uppercase tracking-wide">
                      <button onClick={() => setShowPrivacyModal(true)} className="flex items-center gap-2 text-gray-500 hover:text-de-gold transition-colors">
                          <FileLock size={14} /> {t.privacyTitle}
                      </button>
                      <span className="text-gray-300">|</span>
                      <button onClick={() => setShowAdmin(true)} className="flex items-center gap-2 text-gray-500 hover:text-de-red transition-colors">
                          <ShieldAlert size={14} /> {t.admin}
                      </button>
                  </div>
              </div>
              <div className="mt-6 text-center text-[10px] text-gray-400">
                  &copy; {new Date().getFullYear()} Community Project. Built for the r/GermanCitizenship community.
              </div>
          </div>
      </footer>
  );

  if (!session && !isGuest) {
    return (
      <div className={`min-h-screen flex flex-col justify-center items-center p-4 font-sans relative transition-all duration-1000 bg-gradient-to-br from-gray-900 to-black`}>
        <ToastContainer />
        <Suspense fallback={null}>{showPrivacyModal && <PrivacyPolicyModal lang={lang} onClose={() => setShowPrivacyModal(false)} />}</Suspense>
        <Suspense fallback={null}>{showAdmin && <AdminTools lang={lang} onClose={() => setShowAdmin(false)} onDataChange={refreshData} />}</Suspense>
        
        <div className="absolute top-4 right-4 z-20"><LanguageSelector /></div>
        
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full bg-white rounded-xl shadow-2xl overflow-hidden border-t-8 border-de-black relative z-10 p-8 my-12">
            <div className="text-center mb-6">
                <div className="flex flex-col w-12 h-8 shadow-sm mb-4 mx-auto">
                    <div className="h-1/3 bg-black w-full"></div>
                    <div className="h-1/3 bg-de-red w-full"></div>
                    <div className="h-1/3 bg-de-gold w-full"></div>
                </div>
                <h1 className="text-xl font-bold text-gray-800 tracking-tight">{t.title}</h1>
            </div>
            
            {isMaintenance ? (
                <div className="text-center bg-orange-50 border border-orange-200 p-6 rounded-lg">
                    <Power size={48} className="mx-auto text-orange-400 mb-4" />
                    <h3 className="font-bold text-lg text-gray-800 mb-2">{t.maintenance}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{t.maintenanceMessage}</p>
                </div>
            ) : loginStep === 'INPUT' ? (
                <form onSubmit={handleLoginSubmit} className="space-y-6">
                    <div>
                        <label className="block text-xs font-bold text-de-gray uppercase mb-2">{t.loginEmailLabel}</label>
                        <input type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} className="w-full px-4 py-3 rounded border border-gray-300 focus:ring-2 focus:ring-de-gold outline-none transition-all text-gray-900" placeholder={t.loginPlaceholder} required />
                        <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">{t.fakeEmailInfo}</p>
                    </div>
                    <button type="submit" className="w-full bg-de-black hover:bg-gray-800 text-white font-bold py-3 px-4 rounded transition-all transform hover:scale-[1.02] active:scale-[0.98] flex justify-center items-center gap-2 shadow-lg">
                        {t.loginButton} <ArrowRight size={16} />
                    </button>
                    <button type="button" onClick={enterGuestMode} className="w-full text-gray-500 hover:text-de-black font-medium text-sm flex items-center justify-center gap-1 transition-colors">
                        <Eye size={16} /> {t.guestAccess}
                    </button>
                </form>
            ) : loginStep === 'CONFIRM' ? (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-5 text-center">
                        <h3 className="font-bold text-gray-800 mb-2">{t.confirmEmail}</h3>
                        <p className="text-lg font-bold text-de-black break-all">{emailInput}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => setLoginStep('INPUT')} className="w-full bg-white border border-gray-300 text-gray-600 font-bold py-3 px-4 rounded hover:bg-gray-50 transition-colors">Volver</button>
                        <button onClick={handleLoginConfirm} disabled={loading} className="w-full bg-de-gold hover:bg-yellow-400 text-de-black font-bold py-3 px-4 rounded transition-all flex justify-center items-center shadow-md">
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : t.confirm}
                        </button>
                    </div>
                </div>
            ) : loginStep === 'USERNAME_SELECTION' ? (
                <div className="space-y-6 animate-in fade-in">
                    <div className="text-center">
                        <h3 className="font-bold text-xl text-gray-800">{t.welcome}</h3>
                        <p className="text-sm text-gray-500">Generando identidad anónima...</p>
                    </div>
                    <form onSubmit={handleFinalizeOnboarding} className="space-y-4">
                        <div className="relative">
                            <label className="block text-xs font-bold text-de-gray uppercase mb-2">{t.chooseFantasyName}</label>
                            <input type="text" value={proposedUsername} onChange={(e) => setProposedUsername(e.target.value)} className={`w-full px-4 py-3 rounded border ${usernameError ? 'border-red-500' : 'border-gray-300'} focus:ring-2 focus:ring-de-gold outline-none text-gray-900 font-bold`} required />
                            {loading && <div className="absolute right-3 top-9"><Loader2 className="animate-spin text-de-gold" size={16} /></div>}
                        </div>
                        <button type="submit" disabled={loading} className="w-full bg-de-gold hover:bg-yellow-400 text-de-black font-bold py-3 px-4 rounded shadow-md transition-all">
                            {t.createUser}
                        </button>
                    </form>
                </div>
            ) : null}
        </motion.div>
        
        <div className="flex gap-4 text-xs font-bold uppercase tracking-widest text-gray-500 mt-4">
            <button onClick={() => setShowPrivacyModal(true)} className="hover:text-de-gold transition-colors">{t.privacyTitle}</button>
            <span className="text-gray-700">|</span>
            <button onClick={() => setShowAdmin(true)} className="hover:text-de-red transition-colors">{t.admin}</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col font-sans text-de-black dark:text-white transition-all duration-1000 ${bgMode === 'image' ? 'bg-fixed bg-cover bg-center' : 'bg-gray-100 dark:bg-gray-900'}`} style={bgMode === 'image' ? { backgroundImage: `url('${bgImage}')` } : {}}>
        <div className={`min-h-screen flex flex-col ${bgMode === 'image' ? 'bg-gray-50/70 dark:bg-black/70 backdrop-blur-sm' : ''}`}>
            <ToastContainer />
            <Suspense fallback={null}>{showPrivacyModal && <PrivacyPolicyModal lang={lang} onClose={() => setShowPrivacyModal(false)} />}</Suspense>
            <Suspense fallback={null}>{showAdmin && <AdminTools lang={lang} onClose={() => setShowAdmin(false)} onDataChange={refreshData} />}</Suspense>

            <nav className="bg-de-black/95 backdrop-blur text-white shadow-lg sticky top-0 z-50 border-b-4 border-de-red">
                <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
                    <div className="flex items-center gap-3"><span className="font-bold text-lg tracking-tight">{t.title}</span></div>
                    <div className="flex items-center gap-4">
                        <LanguageSelector />
                        {!isGuest && <div className="hidden md:block text-right"><span className="text-[10px] text-gray-400 uppercase font-bold block leading-none">Usuario</span><span className="text-sm font-bold text-de-gold leading-none">{session?.fantasyName}</span></div>}
                        <button onClick={handleLogout} className="p-2 hover:bg-gray-800 rounded-full text-gray-300 transition-colors">{isGuest ? <LogIn size={20} /> : <LogOut size={20} />}</button>
                    </div>
                </div>
            </nav>
            
            <Suspense fallback={null}>{activeTab === 'dashboard' && <SuccessTicker cases={allCases} lang={lang} />}</Suspense>
            
            <main className="max-w-7xl mx-auto px-4 py-8 flex-grow w-full">
                <div className="flex gap-1 mb-6 border-b border-gray-300 dark:border-gray-700 overflow-x-auto scrollbar-hide">
                    {!isGuest && <TabButton id='myCase' label={t.myCase} icon={<User size={16} />} active={activeTab} onClick={setActiveTab} />}
                    <TabButton id='dashboard' label={t.dashboard} icon={<LayoutDashboard size={16} />} active={activeTab} onClick={setActiveTab} />
                    {!isGuest && <TabButton id='ai' label={t.aiModel} icon={<Monitor size={16} />} active={activeTab} onClick={setActiveTab} />}
                    <TabButton id='faq' label={t.faq} icon={<HelpCircle size={16} />} active={activeTab} onClick={setActiveTab} />
                </div>
                
                <AnimatePresence mode="wait">
                    <motion.div key={activeTab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-8">
                        {activeTab === 'myCase' && (
                            <div className="space-y-6">
                                <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl border-l-4 border-de-gold p-6 text-white flex items-start gap-4 shadow-lg">
                                    <Sparkles className="text-de-gold shrink-0" />
                                    <div><h3 className="font-bold text-lg text-de-gold">{t.aiAnalysis}</h3><p className="text-gray-300 text-sm">{aiInsight || "Cargando análisis..."}</p></div>
                                </div>
                                <CaseForm initialData={userCase} userEmail={session?.email || ''} fantasyName={session?.fantasyName || 'Guest'} existingNames={allCases.map(c => c.fantasyName)} lang={lang} avgWaitTime={userTypeStats.avgDaysTotal} onSave={optimisticUpdateCase} isMaintenanceMode={isMaintenance} isGuest={isGuest} stats={userTypeStats} />
                            </div>
                        )}
                        {activeTab === 'dashboard' && (
                            <div className="space-y-8">
                                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-wrap gap-4 items-center">
                                    <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-2 top-2.5 text-gray-400" size={14} /><input type="text" placeholder={t.searchDashboard} value={filters.search} onChange={(e) => setFilters({ search: e.target.value })} className="w-full pl-8 pr-2 py-2 text-sm border rounded bg-white dark:bg-gray-700 focus:ring-1 focus:ring-de-gold outline-none" /></div>
                                    <select value={filters.country} onChange={(e) => setFilters({ country: e.target.value })} className="border rounded text-sm p-2 bg-white dark:bg-gray-700 outline-none"><option value="All">{t.allCountries}</option>{COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
                                    <select value={filters.type} onChange={(e) => setFilters({ type: e.target.value })} className="border rounded text-sm p-2 bg-white dark:bg-gray-700 outline-none"><option value="All">{t.allTypes}</option>{Object.values(CaseType).map(c => <option key={c} value={c}>{c}</option>)}</select>
                                </div>
                                <WorldMapStats cases={filteredCases} lang={lang} loading={isDataLoading} selectedCountryFilter={filters.country} onSelectCountry={(c) => setFilters({ country: c })} onSetFilterStatus={(s) => setFilters({ status: s })} />
                                <StatsDashboard cases={filteredCases} userCase={userCase} lang={lang} loading={isDataLoading} />
                                <CommunityFeed cases={filteredCases} lang={lang} />
                                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                                    <div className="flex justify-between items-center mb-4 px-2"><h3 className="font-bold text-lg">{t.activeCases}</h3><div className="text-sm text-gray-500 font-bold uppercase tracking-wider">{t.showing} {filteredCases.length}</div></div>
                                    <div className="h-[400px] w-full border border-gray-100 dark:border-gray-700 rounded overflow-hidden bg-gray-50/30">
                                        <AutoSizer>{({ height, width }) => (<List height={height} width={width} itemCount={filteredCases.length} itemSize={isMobile ? 120 : 72} itemData={{ cases: filteredCases, lang, onSelect: setSelectedDetailCase, isMobile }}>{CaseRow}</List>)}</AutoSizer>
                                    </div>
                                </div>
                            </div>
                        )}
                        {activeTab === 'ai' && <AIModelTab userCase={userCase} stats={userTypeStats} lang={lang} />}
                        {activeTab === 'faq' && <FAQ lang={lang} userEmail={session?.email || ''} />}
                    </motion.div>
                </AnimatePresence>
            </main>
            
            <Footer />
        </div>
    </div>
  );
};

const TabButton = ({id, label, icon, active, onClick}: any) => (
    <button onClick={() => onClick(id)} className={`px-4 sm:px-6 py-3 font-bold text-sm rounded-t-lg transition-all flex items-center gap-2 whitespace-nowrap border-b-2 ${active === id ? 'bg-white/50 dark:bg-gray-800/50 text-de-red dark:text-de-gold border-de-red dark:border-de-gold z-10' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border-transparent'}`}>
        {icon} {label}
    </button>
);

export default App;
