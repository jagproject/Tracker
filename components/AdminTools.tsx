import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Download, Upload, FileSpreadsheet, Lock, Unlock, CheckCircle, AlertTriangle, X, Send, Shield, Activity, Trash2, Search, Database, Edit, Save, ArrowLeft, Power, CheckSquare, Square, Loader2, BarChart3, PieChart as PieChartIcon, Filter, LayoutGrid, FileJson, Clock, Wifi, WifiOff, RefreshCw, ShieldCheck, Ghost, LockKeyhole, Mail, Recycle, RefreshCcw, ScanSearch, Server, FileText, ArrowUpDown, ChevronUp, ChevronDown, Check, EyeOff, AlertOctagon } from 'lucide-react';
import { CitizenshipCase, Language, CaseType, CaseStatus, AuditLogEntry } from '../types';
import { TRANSLATIONS, STATUS_TRANSLATIONS, COUNTRIES } from '../constants';
import { importCases, fetchCases, fetchDeletedCases, restoreCase, hardDeleteCase, addAuditLog, getAuditLogs, deleteCase, upsertCase, getAppConfig, setMaintenanceMode, getFullDatabaseDump, getLastFetchError, checkConnection, parseAndImportCSV, fetchGlobalConfig, deleteAllCases } from '../services/storageService';
import { detectAnomalies } from '../services/geminiService';
import { calculateQuickStats, formatDuration, isGhostCase, formatISODateToLocale } from '../services/statsUtils';
import { isSupabaseEnabled } from '../services/authService';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAppStore } from '../store/useAppStore';

interface AdminToolsProps {
  lang: Language;
  onClose: () => void;
  onDataChange: () => void;
}

type AuthState = 'EMAIL' | 'OTP' | 'AUTHENTICATED';
type AdminTab = 'SUMMARY' | 'ACTIONS' | 'MANAGE' | 'RECYCLE' | 'LOGS';

const COLORS = ['#000000', '#DD0000', '#FFCC00', '#666666', '#A9A9A9', '#8B0000'];

export const AdminTools: React.FC<AdminToolsProps> = ({ lang, onClose, onDataChange }) => {
  const t = TRANSLATIONS[lang];
  const { optimisticDeleteCase, optimisticUpdateCase, optimisticRestoreCase, optimisticHardDeleteCase } = useAppStore();
  const [authState, setAuthState] = useState<AuthState>('EMAIL');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('SUMMARY');
  const [importStatus, setImportStatus] = useState<{success: boolean, msg: string} | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [allCases, setAllCases] = useState<CitizenshipCase[]>([]);
  const [deletedCases, setDeletedCases] = useState<CitizenshipCase[]>([]);
  
  // Manage Tab State
  const [manageSearchTerm, setManageSearchTerm] = useState('');
  const [editForm, setEditForm] = useState<CitizenshipCase | null>(null);
  const [emailEditValue, setEmailEditValue] = useState(''); // Separate state for email editing
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [isUpdatingMaint, setIsUpdatingMaint] = useState(false);
  
  const [dbError, setDbError] = useState<string | null>(null);
  const [isVerifyingDb, setIsVerifyingDb] = useState(false);

  // Anomaly Detection State
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  // Nuclear Option State
  const [showNukeModal, setShowNukeModal] = useState(false);
  const [nukePin, setNukePin] = useState('');
  const [isNuking, setIsNuking] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const OWNER_EMAIL = "jaalvarezgarcia@gmail.com";
  const SECRET_KEY = "Alemania2023.tracker!project"; 

  useEffect(() => {
    const initData = async () => {
        if (authState === 'AUTHENTICATED') {
            setAuditLogs(getAuditLogs());
            setAllCases(await fetchCases()); // Fetch Active
            setDeletedCases(await fetchDeletedCases()); // Fetch Deleted (Recycle Bin)
            
            // Async fetch for global config
            const config = await fetchGlobalConfig();
            setMaintenanceEnabled(config.maintenanceMode);

            setDbError(getLastFetchError());
        }
    };
    initData();
  }, [authState, activeTab]);

  const refreshAll = async () => {
       setAllCases(await fetchCases());
       setDeletedCases(await fetchDeletedCases());
       const config = await fetchGlobalConfig();
       setMaintenanceEnabled(config.maintenanceMode);
       onDataChange();
  };

  const maskEmail = (emailStr: string) => {
    if (!emailStr) return '';
    if (emailStr.startsWith('unclaimed_') || emailStr.startsWith('imported_')) return 'System/Unclaimed';
    const parts = emailStr.split('@');
    if (parts.length !== 2) return emailStr;
    const user = parts[0];
    const domain = parts[1];
    const maskedUser = user.length > 2 ? `${user.substring(0, 2)}***` : `${user}***`;
    return `${maskedUser}@${domain}`;
  };

  const handleVerifyConnection = async () => {
      setIsVerifyingDb(true);
      const isOk = await checkConnection();
      if (isOk) {
          setDbError(null);
          setTimeout(() => {
             setIsVerifyingDb(false);
          }, 800);
      } else {
          setDbError("Verification Failed. Check Console.");
          setIsVerifyingDb(false);
      }
  };

  const handleScanAnomalies = async () => {
      setIsScanning(true);
      const issues = await detectAnomalies(allCases);
      setAnomalies(issues);
      setIsScanning(false);
  };

  const handleEmailBackup = async () => {
      const dump = await getFullDatabaseDump();
      
      const mailtoLink = `mailto:${OWNER_EMAIL}?subject=TRACKER_BACKUP_${new Date().toISOString()}&body=Please find the database backup attached.`;
      window.open(mailtoLink);
  };

  const handleDownloadJSON = async () => {
      const dump = await getFullDatabaseDump();
      const jsonString = JSON.stringify(dump, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TRACKER_FULL_BACKUP_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const headers = ['id', 'fantasyName', 'country', 'type', 'status', 'submitted', 'protocol', 'approved', 'closed', 'lastUpdated'];
    const csvContent = [
      headers.join(','),
      ...allCases.map(c => [
        c.id,
        `"${c.fantasyName}"`,
        `"${c.countryOfApplication}"`,
        c.caseType,
        c.status,
        c.submissionDate,
        c.protocolDate || '',
        c.approvalDate || '',
        c.closedDate || '',
        c.lastUpdated
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `citizenship_cases_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportStatus(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        let count = 0;

        if (file.name.endsWith('.json')) {
            const json = JSON.parse(text);
            let casesToImport: CitizenshipCase[] = [];
            if (json.data && Array.isArray(json.data.cases)) {
                casesToImport = json.data.cases;
            } else if (Array.isArray(json)) {
                casesToImport = json;
            }
            await importCases(casesToImport);
            count = casesToImport.length;
        } else if (file.name.endsWith('.csv')) {
             count = await parseAndImportCSV(text);
        } else {
             throw new Error("Unsupported file format");
        }

        setImportStatus({ success: true, msg: `Successfully imported ${count} cases.` });
        addAuditLog("Import", `Bulk imported ${count} cases`, email);
        await refreshAll();
      } catch (err: any) {
        setImportStatus({ success: false, msg: err.message || "Error parsing file." });
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  const handleRestoreCase = async (id: string) => {
      optimisticRestoreCase(id);
      setDeletedCases(prev => prev.filter(c => c.id !== id));
      addAuditLog("Restore", `Restored case ${id} from Recycle Bin`, email);
  };

  const handleSoftDelete = async (id: string) => {
      if (confirm("Are you sure you want to move this case to the Recycle Bin?")) {
          optimisticDeleteCase(id);
          setAllCases(prev => prev.filter(c => c.id !== id));
          addAuditLog("Soft Delete", `Deleted case ${id}`, email);
      }
  }

  const handlePermanentDelete = async (id: string) => {
      if (confirm("DANGER: This will permanently destroy this record. It cannot be recovered. Continue?")) {
          optimisticHardDeleteCase(id);
          setDeletedCases(prev => prev.filter(c => c.id !== id));
          addAuditLog("Hard Delete", `Permanently deleted case ${id}`, email);
      }
  };
  
  const handleNukeDatabase = async () => {
      if (nukePin !== SECRET_KEY) {
          alert("INCORRECT PASSWORD.");
          return;
      }
      
      setIsNuking(true);
      try {
          await deleteAllCases();
          addAuditLog("NUCLEAR", "DELETED ALL DATABASE RECORDS", email);
          alert("Database has been wiped.");
          setShowNukeModal(false);
          setNukePin('');
          await refreshAll();
      } catch(e: any) {
          alert("Error deleting database: " + e.message);
      } finally {
          setIsNuking(false);
      }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editForm) return;
      
      const caseToSave = { ...editForm };
      
      if (emailEditValue && emailEditValue.trim() !== '') {
          caseToSave.email = emailEditValue.trim().toLowerCase();
      }

      optimisticUpdateCase(caseToSave);
      
      setAllCases(prev => {
          const idx = prev.findIndex(c => c.id === caseToSave.id);
          if (idx >= 0) {
              const newArr = [...prev];
              newArr[idx] = caseToSave;
              return newArr;
          }
          return prev;
      });

      addAuditLog("Edit", `Admin edited case ${editForm.id}`, email);
      
      setEditForm(null);
      setEmailEditValue('');
  }

  const handleSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.toLowerCase() === OWNER_EMAIL) { setAuthState('OTP'); } else { alert("Access Denied"); }
  };
  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp === SECRET_KEY) { setAuthState('AUTHENTICATED'); } else { alert("Invalid Password"); }
  };
  
  const handleToggleMaintenance = async () => {
    setIsUpdatingMaint(true);
    const newState = !maintenanceEnabled; 
    await setMaintenanceMode(newState); 
    setMaintenanceEnabled(newState);
    setIsUpdatingMaint(false);
    onDataChange();
  };
  
  const handleSort = (key: string) => {
      setSortConfig(prev => {
          if (prev?.key === key) {
              return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
          }
          return { key, direction: 'asc' };
      });
  };

  const isDbConnected = useMemo(() => isSupabaseEnabled() && !dbError, [dbError]);

  const filteredManageCases = useMemo(() => {
      let filtered = allCases;
      if (manageSearchTerm) {
         const term = manageSearchTerm.toLowerCase();
         filtered = allCases.filter(c => 
             c.fantasyName.toLowerCase().includes(term) || 
             c.countryOfApplication.toLowerCase().includes(term) ||
             c.email.toLowerCase().includes(term)
         );
      }

      if (sortConfig) {
          filtered = [...filtered].sort((a, b) => {
              let valA = (a as any)[sortConfig.key] || '';
              let valB = (b as any)[sortConfig.key] || '';
              
              if (typeof valA === 'string') valA = valA.toLowerCase();
              if (typeof valB === 'string') valB = valB.toLowerCase();

              if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
              if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
              return 0;
          });
      }
      return filtered;
  }, [allCases, manageSearchTerm, sortConfig]);

  const breakdown = useMemo(() => {
      const ghosts = allCases.filter(c => isGhostCase(c));
      const nonGhosts = allCases.filter(c => !isGhostCase(c));
      
      const approved = nonGhosts.filter(c => c.status === CaseStatus.APPROVED);
      const closed = nonGhosts.filter(c => c.status === CaseStatus.CLOSED);
      const inProgress = nonGhosts.filter(c => c.status !== CaseStatus.APPROVED && c.status !== CaseStatus.CLOSED);
      
      const submitted = inProgress.filter(c => c.status === CaseStatus.SUBMITTED);
      const protocol = inProgress.filter(c => c.status === CaseStatus.PROTOCOL_RECEIVED);
      const docs = inProgress.filter(c => c.status === CaseStatus.ADDITIONAL_DOCS);

      const typeData = allCases.reduce((acc, curr) => {
          acc[curr.caseType] = (acc[curr.caseType] || 0) + 1;
          return acc;
      }, {} as Record<string, number>);

      return {
          total: allCases.length,
          ghosts,
          nonGhosts,
          approved,
          closed,
          inProgress,
          submitted,
          protocol,
          docs,
          typeData: Object.entries(typeData).map(([name, value]) => ({ name, value }))
      };
  }, [allCases]);

  if (authState !== 'AUTHENTICATED') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
          <div className="bg-de-black p-4 flex justify-between items-center text-white font-bold">
             <h3>Admin Access</h3>
             <button onClick={onClose}><X size={20}/></button>
          </div>
          <div className="p-6 bg-white">
            {authState === 'EMAIL' ? (
               <form onSubmit={handleSendCode} className="space-y-4">
                 <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-2 border rounded text-black bg-white focus:ring-2 focus:ring-de-black outline-none placeholder:text-gray-500" placeholder="Email" required />
                 <button type="submit" className="w-full bg-de-red hover:bg-red-700 text-white py-2 rounded font-bold transition-colors">Next</button>
               </form>
            ) : (
               <form onSubmit={handleVerifyOtp} className="space-y-4">
                 <input type="password" value={otp} onChange={e => setOtp(e.target.value)} className="w-full p-2 border rounded text-black bg-white focus:ring-2 focus:ring-de-black outline-none placeholder:text-gray-500" placeholder="Password" required />
                 <button type="submit" className="w-full bg-de-gold hover:bg-yellow-400 font-bold py-2 rounded text-black transition-colors">Login</button>
               </form>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full overflow-hidden border-t-8 border-de-gold flex flex-col max-h-[90vh]">
        <div className="bg-white p-4 flex justify-between items-center border-b flex-shrink-0">
             <h3 className="text-black font-bold flex items-center gap-2 text-lg">
                <Unlock size={20} className="text-de-gold" /> {t.admin}
             </h3>
             <button onClick={onClose} className="text-black hover:text-red-600"><X size={24} /></button>
        </div>

        <div className="flex border-b-2 border-gray-200 flex-shrink-0 overflow-x-auto bg-white">
           {['SUMMARY', 'ACTIONS', 'MANAGE'].map(tab => (
               <button 
                key={tab}
                onClick={() => setActiveTab(tab as AdminTab)} 
                className={`flex-1 py-3 text-sm font-extrabold min-w-[100px] transition-colors uppercase tracking-wider ${activeTab === tab ? 'text-black border-b-4 border-black bg-gray-50' : 'text-black hover:bg-gray-100 opacity-60 hover:opacity-100'}`}
              >
                {tab}
              </button>
           ))}
           <button 
                onClick={() => setActiveTab('RECYCLE')} 
                className={`flex-1 py-3 text-sm font-extrabold min-w-[120px] transition-colors uppercase tracking-wider ${activeTab === 'RECYCLE' ? 'text-red-700 border-b-4 border-red-700 bg-red-50' : 'text-gray-500 hover:bg-red-50 hover:text-red-600'}`}
              >
                <div className="flex items-center justify-center gap-2"><Recycle size={16}/> Recycle</div>
           </button>
           <button 
                onClick={() => setActiveTab('LOGS')} 
                className={`flex-1 py-3 text-sm font-extrabold min-w-[80px] transition-colors uppercase tracking-wider ${activeTab === 'LOGS' ? 'text-black border-b-4 border-black bg-gray-50' : 'text-black hover:bg-gray-100 opacity-60 hover:opacity-100'}`}
              >
                Logs
           </button>
        </div>

        <div className="p-6 overflow-y-auto flex-grow bg-white text-black">
            {activeTab === 'SUMMARY' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className={`p-4 rounded-lg border-2 text-sm flex items-center justify-between shadow-sm transition-colors ${isDbConnected ? 'bg-green-50 border-green-600 text-green-900' : 'bg-red-50 border-red-600 text-red-900'}`}>
                            <div className="flex items-center gap-3">
                                {isDbConnected ? <Wifi size={24} className="text-green-700" /> : <WifiOff size={24} className="text-red-700" />}
                                <div>
                                    <span className="font-extrabold block text-lg">Database Connection: {isDbConnected ? "Stable" : "Disconnected"}</span>
                                    <span className="text-sm font-medium">{isDbConnected ? "Supabase instance active." : "Check configuration."}</span>
                                </div>
                            </div>
                            <button onClick={handleVerifyConnection} disabled={isVerifyingDb} className="text-xs font-bold bg-white border-2 border-black text-black px-4 py-2 rounded hover:bg-gray-100 uppercase tracking-wide">
                                {isVerifyingDb ? "Checking..." : "Verify"}
                            </button>
                        </div>
                        <div className="p-4 rounded-lg border-2 border-blue-600 bg-blue-50 text-blue-900 text-sm flex items-center gap-3 shadow-sm">
                            <ShieldCheck size={32} className="text-blue-700 flex-shrink-0" />
                            <div>
                                <span className="font-extrabold block text-lg">Auto-Deletion: DISABLED</span>
                                <span className="text-sm font-medium text-blue-800 block mt-0.5">Records are soft-deleted to Recycle Bin. Safe Mode Active.</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border-2 border-gray-200 shadow-sm">
                        <h4 className="font-bold text-lg mb-4 text-black border-b-2 border-gray-100 pb-2">Record Breakdown Formula</h4>
                        
                        <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-center font-mono text-sm md:text-base">
                             <div className="bg-gray-100 p-4 rounded-lg w-full md:w-auto border border-gray-300">
                                <span className="block text-3xl font-black text-black">{breakdown.total}</span>
                                <span className="text-xs uppercase text-black font-bold">Total Records</span>
                             </div>
                             <span className="font-black text-gray-400 text-2xl">=</span>
                             <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-200 w-full md:w-auto">
                                <span className="block text-3xl font-black text-blue-800">{breakdown.inProgress.length}</span>
                                <span className="text-xs uppercase text-blue-800 font-bold">In Progress</span>
                             </div>
                             <span className="font-black text-gray-400 text-2xl">+</span>
                             <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200 w-full md:w-auto">
                                <span className="block text-3xl font-black text-green-800">{breakdown.approved.length + breakdown.closed.length}</span>
                                <span className="text-xs uppercase text-green-800 font-bold">Finished</span>
                             </div>
                             <span className="font-black text-gray-400 text-2xl">+</span>
                              <div className="bg-gray-100 p-4 rounded-lg border-2 border-gray-300 w-full md:w-auto">
                                <span className="block text-3xl font-black text-gray-600">{breakdown.ghosts.length}</span>
                                <span className="text-xs uppercase text-gray-600 font-bold">Ghosts</span>
                             </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-5 rounded-xl border-2 border-gray-200 shadow-sm h-80 flex flex-col">
                            <h4 className="font-bold text-md mb-2 text-black flex items-center gap-2">
                                <PieChartIcon size={18} /> Case Type Distribution
                            </h4>
                            <div className="flex-1 w-full min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={breakdown.typeData}
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {breakdown.typeData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip itemStyle={{color: 'black'}} />
                                        <Legend verticalAlign="bottom" height={36} iconSize={12} formatter={(value) => <span className="text-black font-bold">{value}</span>}/>
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-xl border-2 border-gray-200 shadow-sm flex flex-col justify-center gap-4">
                            <div className="text-center p-6 bg-gray-100 rounded-lg border border-gray-300">
                                <p className="text-gray-600 text-xs uppercase font-black mb-1 tracking-wider">Total Active (Non-Ghost)</p>
                                <p className="text-4xl font-black text-black">{breakdown.nonGhosts.length}</p>
                            </div>
                            <div className="text-center p-6 bg-red-50 rounded-lg border-2 border-red-200">
                                <p className="text-red-700 text-xs uppercase font-black mb-1 tracking-wider">Recycle Bin</p>
                                <p className="text-4xl font-black text-red-700">{deletedCases.length}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'ACTIONS' && (
                <div className="space-y-6 max-w-2xl mx-auto">
                    <div className="bg-white p-6 rounded-xl border-2 border-gray-200 shadow-sm">
                        <h4 className="font-bold text-lg text-black flex items-center gap-2 mb-6 border-b pb-2">
                            <Database size={20} /> Data Import / Export
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-400 rounded hover:bg-gray-100 transition-colors text-black font-bold">
                                <Upload className="text-blue-600 mb-2" size={32} /><span>Bulk Import</span>
                            </button>
                            <input type="file" ref={fileInputRef} className="hidden" accept=".json,.csv" onChange={handleFileChange} />
                            <button onClick={handleExportCSV} className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-400 rounded hover:bg-gray-100 transition-colors text-black font-bold">
                                <FileSpreadsheet className="text-green-600 mb-2" size={32} /><span>Export CSV</span>
                            </button>
                             <button onClick={handleDownloadJSON} className="md:col-span-2 flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-400 rounded hover:bg-gray-100 transition-colors text-black font-bold">
                                <FileJson className="text-yellow-600 mb-2" size={32} /><span>Export Full DB (JSON)</span>
                            </button>
                        </div>
                        {importStatus && <div className={`mt-4 p-4 rounded text-sm font-bold border-2 ${importStatus.success ? 'bg-green-100 border-green-300 text-green-900' : 'bg-red-100 border-red-300 text-red-900'}`}>{importStatus.msg}</div>}
                        {isImporting && <p className="text-center text-sm font-bold text-black mt-4">Processing file...</p>}
                    </div>
                    <div className="bg-white p-6 rounded-xl border-2 border-gray-200 shadow-sm flex justify-between items-center">
                        <div><h4 className="font-bold text-lg text-black flex items-center gap-2"><Mail size={20} /> Email Backup</h4><p className="text-sm text-black mt-1 font-medium">Send .JSON dump to owner.</p></div>
                        <button onClick={handleEmailBackup} className="px-6 py-3 bg-black text-white rounded font-bold text-sm hover:bg-gray-800 uppercase tracking-wide">Send Email</button>
                    </div>
                    <div className="bg-white p-6 rounded-xl border-2 border-gray-200 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <div><h4 className="font-bold text-lg text-black flex items-center gap-2"><ScanSearch size={20} /> AI Anomaly Detection</h4><p className="text-sm text-black mt-1 font-medium">Scan database for issues.</p></div>
                            <button onClick={handleScanAnomalies} disabled={isScanning} className="px-6 py-3 bg-blue-600 text-white rounded font-bold text-sm hover:bg-blue-700 flex items-center gap-2 uppercase tracking-wide">
                                {isScanning ? <Loader2 className="animate-spin" size={16}/> : <ScanSearch size={16} />} Scan
                            </button>
                        </div>
                        {anomalies.length > 0 && (
                            <div className="bg-gray-100 p-4 rounded border-2 border-gray-300 max-h-60 overflow-y-auto">
                                {anomalies.map((issue, idx) => (
                                    <div key={idx} className="text-sm p-2 border-b border-gray-300 last:border-0">
                                        <span className="font-black text-red-600">{issue.issueType}: </span><span className="font-bold text-black">{issue.name}</span><p className="text-black">{issue.details}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className={`p-6 rounded-xl border-2 transition-colors ${maintenanceEnabled ? 'bg-orange-100 border-orange-400' : 'bg-white border-gray-200 shadow-sm'}`}>
                         <div className="flex justify-between items-center">
                             <div className="flex items-center gap-2 font-bold text-lg text-black"><Power size={20} /> Maintenance Mode</div>
                             <button onClick={handleToggleMaintenance} disabled={isUpdatingMaint} className={`px-6 py-3 rounded font-bold text-sm flex items-center gap-2 uppercase tracking-wide ${maintenanceEnabled ? 'bg-orange-600 text-white hover:bg-orange-700' : 'border-2 border-black text-black hover:bg-gray-100'}`}>
                                 {isUpdatingMaint ? <Loader2 size={14} className="animate-spin" /> : null}{maintenanceEnabled ? "Resume App" : "Pause App"}
                             </button>
                         </div>
                    </div>
                    <div className="bg-red-50 p-6 rounded-xl border-2 border-red-300 shadow-sm mt-8">
                        <div className="flex justify-between items-center">
                             <div className="flex items-start gap-3">
                                 <AlertOctagon size={32} className="text-red-600 mt-1" />
                                 <div><h4 className="font-black text-lg text-red-700">Danger Zone</h4><p className="text-sm font-bold text-red-700 mt-1">Permanently delete ALL records.</p></div>
                             </div>
                             <button onClick={() => setShowNukeModal(true)} className="px-6 py-3 bg-red-600 text-white font-black text-sm rounded hover:bg-red-700 shadow-md uppercase tracking-wide">DELETE ALL DATABASE</button>
                        </div>
                    </div>
                </div>
            )}
            
            {showNukeModal && (
                <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-lg shadow-2xl max-w-sm w-full p-8 text-center border-t-8 border-red-600">
                        <AlertTriangle size={48} className="text-red-600 mx-auto mb-4" />
                        <h3 className="text-2xl font-black text-black mb-2">Confirm Database Wipe</h3>
                        <input type="password" value={nukePin} onChange={(e) => setNukePin(e.target.value)} placeholder="Enter Password" className="w-full p-4 border-2 border-black rounded mb-6 text-center font-mono text-black text-lg" autoFocus />
                        <div className="flex gap-4">
                            <button onClick={() => { setShowNukeModal(false); setNukePin(''); }} className="flex-1 py-4 bg-gray-200 hover:bg-gray-300 font-bold text-black rounded text-sm uppercase">Cancel</button>
                            <button onClick={handleNukeDatabase} disabled={isNuking} className="flex-1 py-4 bg-red-600 hover:bg-red-700 font-bold text-white rounded flex items-center justify-center gap-2 text-sm uppercase">{isNuking && <Loader2 size={16} className="animate-spin" />} DELETE ALL</button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'MANAGE' && (
                <div className="space-y-4">
                     {editForm && (
                         <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
                             <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col border-4 border-black">
                                 <div className="bg-black text-white p-4 font-bold flex justify-between items-center"><h3 className="text-xl">Edit Case: {editForm.fantasyName}</h3><button onClick={() => setEditForm(null)} className="hover:text-red-400"><X size={24}/></button></div>
                                 <div className="p-6 overflow-y-auto space-y-4 bg-white">
                                    <form id="edit-case-form" onSubmit={handleSaveEdit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div><label className="text-sm font-black block mb-2 text-black uppercase">Fantasy Name</label><input value={editForm.fantasyName} onChange={e => setEditForm({...editForm, fantasyName: e.target.value})} className="w-full border-2 border-gray-300 rounded p-3 text-black font-medium focus:border-black outline-none" /></div>
                                        <div><label className="text-sm font-black block mb-2 text-black uppercase">Email</label><div className="flex items-center gap-2 mb-2 p-3 bg-gray-100 border border-gray-300 rounded"><span className="font-mono text-sm text-black font-bold">{maskEmail(editForm.email)}</span></div><input type="text" value={emailEditValue} onChange={e => setEmailEditValue(e.target.value)} className="w-full border-2 border-gray-300 rounded p-3 text-black font-medium focus:border-black outline-none" placeholder="New Email Address" autoComplete="off" /></div>
                                        <div>
                                             <label className="text-sm font-black block mb-2 text-black uppercase">Case Type</label>
                                             <select value={editForm.caseType} onChange={e => setEditForm({...editForm, caseType: e.target.value as CaseType})} className="w-full border-2 border-gray-300 rounded p-3 text-black font-medium focus:border-black outline-none">
                                                 {Object.values(CaseType).map(t => <option key={t} value={t}>{t}</option>)}
                                             </select>
                                        </div>
                                        <div>
                                             <label className="text-sm font-black block mb-2 text-black uppercase">Country</label>
                                             <select value={editForm.countryOfApplication} onChange={e => setEditForm({...editForm, countryOfApplication: e.target.value})} className="w-full border-2 border-gray-300 rounded p-3 text-black font-medium focus:border-black outline-none">
                                                 {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                                             </select>
                                        </div>
                                        <div>
                                             <label className="text-sm font-black block mb-2 text-black uppercase">Status</label>
                                             <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value as CaseStatus})} className="w-full border-2 border-gray-300 rounded p-3 text-black font-medium focus:border-black outline-none">
                                                 {Object.values(CaseStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                             </select>
                                        </div>
                                        <div className="md:col-span-2 border-t-2 border-gray-200 pt-4 mt-2"><h4 className="font-black text-black text-sm uppercase mb-4 tracking-wide">Timeline</h4></div>
                                        <div><label className="text-xs font-bold block mb-1 text-gray-700 uppercase">Submission Date</label><input type="date" value={editForm.submissionDate || ''} onChange={e => setEditForm({...editForm, submissionDate: e.target.value})} className="w-full border-2 border-gray-300 rounded p-2 text-black" /></div>
                                        <div><label className="text-xs font-bold block mb-1 text-gray-700 uppercase">Protocol Date</label><input type="date" value={editForm.protocolDate || ''} onChange={e => setEditForm({...editForm, protocolDate: e.target.value})} className="w-full border-2 border-gray-300 rounded p-2 text-black" /></div>
                                        <div><label className="text-xs font-bold block mb-1 text-gray-700 uppercase">Docs Request Date</label><input type="date" value={editForm.docsRequestDate || ''} onChange={e => setEditForm({...editForm, docsRequestDate: e.target.value})} className="w-full border-2 border-gray-300 rounded p-2 text-black bg-yellow-50" /></div>
                                        <div><label className="text-xs font-bold block mb-1 text-gray-700 uppercase">Approval Date</label><input type="date" value={editForm.approvalDate || ''} onChange={e => setEditForm({...editForm, approvalDate: e.target.value})} className="w-full border-2 border-gray-300 rounded p-2 text-black bg-green-50" /></div>
                                        <div><label className="text-xs font-bold block mb-1 text-gray-700 uppercase">Closed Date</label><input type="date" value={editForm.closedDate || ''} onChange={e => setEditForm({...editForm, closedDate: e.target.value})} className="w-full border-2 border-gray-300 rounded p-2 text-black bg-red-50" /></div>
                                        <div className="md:col-span-2"><label className="text-sm font-black block mb-2 text-black uppercase">Notes</label><textarea value={editForm.notes || ''} onChange={e => setEditForm({...editForm, notes: e.target.value})} className="w-full border-2 border-gray-300 rounded p-3 text-black h-24 font-medium" placeholder="Admin notes..." /></div>
                                    </form>
                                 </div>
                                 <div className="p-4 bg-gray-100 border-t-2 border-gray-200 flex justify-end gap-3">
                                     <button onClick={() => setEditForm(null)} className="px-6 py-3 text-black font-bold hover:bg-gray-300 rounded border-2 border-gray-400 bg-white">CANCEL</button>
                                     <button type="submit" form="edit-case-form" className="px-6 py-3 bg-blue-600 text-white rounded font-bold shadow-md hover:bg-blue-700 uppercase tracking-wide">SAVE CHANGES</button>
                                 </div>
                             </div>
                         </div>
                     )}

                     <div className="flex gap-4 mb-6">
                         <div className="relative flex-1">
                             <Search className="absolute left-3 top-3 text-black" size={20} />
                             <input type="text" placeholder="Search by name, email or country..." value={manageSearchTerm} onChange={e => setManageSearchTerm(e.target.value)} className="w-full pl-10 p-3 border-2 border-gray-300 rounded-lg shadow-sm text-black font-medium focus:border-black outline-none placeholder:text-gray-500" />
                         </div>
                         <div className="bg-black text-white px-4 py-3 rounded-lg text-sm font-bold flex items-center shadow-md">Visible: {filteredManageCases.length}</div>
                     </div>

                     <div className="bg-white border-2 border-gray-200 rounded-lg shadow-sm overflow-hidden">
                         <table className="table-fixed w-full text-sm">
                             <thead className="bg-gray-100 border-b-2 border-black text-xs font-black text-black uppercase tracking-wider">
                                 <tr>
                                     <th className="w-1/4 p-4 text-left cursor-pointer hover:bg-gray-200 text-black" onClick={() => handleSort('fantasyName')}>Name <ArrowUpDown size={14} className="inline"/></th>
                                     <th className="w-1/4 p-4 text-left text-black">Email <EyeOff size={14} className="inline"/></th>
                                     <th className="w-32 p-4 text-left cursor-pointer hover:bg-gray-200 text-black" onClick={() => handleSort('countryOfApplication')}>Country <ArrowUpDown size={14} className="inline"/></th>
                                     <th className="w-1/6 p-4 text-left cursor-pointer hover:bg-gray-200 text-black" onClick={() => handleSort('status')}>Status <ArrowUpDown size={14} className="inline"/></th>
                                     <th className="w-[120px] p-4 text-right text-black">Actions</th>
                                 </tr>
                             </thead>
                             <tbody>
                                 {filteredManageCases.slice(0, 50).map(c => (
                                     <tr key={c.id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                                         <td className="p-4 truncate"><div className="font-bold text-black text-base">{c.fantasyName}</div><div className="text-xs text-gray-600 font-mono font-bold mt-1">{c.id.substring(0,8)}...</div></td>
                                         <td className="p-4 font-mono text-sm text-black font-medium truncate">{maskEmail(c.email)}</td>
                                         <td className="p-4 truncate"><div className="text-sm font-bold text-black">{c.countryOfApplication}</div><div className="text-xs text-gray-600 font-bold">{c.caseType}</div></td>
                                         <td className="p-4"><span className={`text-xs px-2 py-1 rounded font-black whitespace-nowrap uppercase ${c.status === CaseStatus.APPROVED ? 'bg-green-100 text-green-800' : c.status === CaseStatus.CLOSED ? 'bg-red-100 text-red-800' : 'bg-gray-200 text-gray-800'}`}>{STATUS_TRANSLATIONS[lang][c.status] || c.status}</span></td>
                                         <td className="p-4 text-right">
                                             <div className="flex justify-end gap-2">
                                                <button onClick={() => { setEditForm(c); setEmailEditValue(''); }} className="p-2 text-white bg-blue-600 hover:bg-blue-700 rounded shadow-sm"><Edit size={16} /></button>
                                                <button onClick={() => handleSoftDelete(c.id)} className="p-2 text-white bg-red-600 hover:bg-red-700 rounded shadow-sm"><Trash2 size={16} /></button>
                                             </div>
                                         </td>
                                     </tr>
                                 ))}
                             </tbody>
                         </table>
                     </div>
                </div>
            )}

            {activeTab === 'RECYCLE' && (
                <div className="space-y-6 max-w-4xl mx-auto animate-in slide-in-from-right-4">
                    <div className="bg-red-50 border-2 border-red-200 p-6 rounded-lg flex items-center gap-4 text-red-900 shadow-sm">
                        <Recycle size={32} />
                        <div><h4 className="font-black text-lg">Recycle Bin</h4><p className="text-sm font-bold">Restore or permanently destroy soft-deleted cases.</p></div>
                    </div>
                    <div className="bg-white border-2 border-gray-200 rounded-lg overflow-hidden shadow-sm">
                        {deletedCases.length === 0 ? (
                            <div className="p-12 text-center text-gray-500 text-lg font-bold">Recycle Bin is Empty.</div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className="bg-gray-100 border-b-2 border-black text-xs text-black font-black uppercase tracking-wide">
                                    <tr>
                                        <th className="p-4 text-left text-black">Name / ID</th>
                                        <th className="p-4 text-left text-black">Deleted At</th>
                                        <th className="p-4 text-right text-black">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {deletedCases.map(c => (
                                        <tr key={c.id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                                            <td className="p-4 font-medium"><div className="text-black font-bold text-base">{c.fantasyName}</div><div className="text-xs text-gray-600 font-mono font-bold">{c.id.substring(0,8)}...</div></td>
                                            <td className="p-4 text-black font-bold text-xs">{c.deletedAt ? new Date(c.deletedAt).toLocaleString() : 'Unknown'}</td>
                                            <td className="p-4 text-right flex justify-end gap-3">
                                                <button onClick={() => handleRestoreCase(c.id)} className="px-3 py-2 bg-green-100 text-green-800 rounded border border-green-300 hover:bg-green-200 flex items-center gap-1 text-xs font-black uppercase"><RefreshCcw size={14}/> Restore</button>
                                                <button onClick={() => handlePermanentDelete(c.id)} className="px-3 py-2 bg-red-100 text-red-800 rounded border border-red-300 hover:bg-red-200 flex items-center gap-1 text-xs font-black uppercase"><Trash2 size={14}/> Destroy</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}
            
            {activeTab === 'LOGS' && (
                <div className="space-y-3 max-w-4xl mx-auto">
                     {auditLogs.map(log => (
                         <div key={log.id} className="bg-white p-4 rounded border border-gray-300 text-sm flex justify-between text-black hover:bg-gray-50 transition-colors shadow-sm">
                             <div><span className="font-black text-black uppercase tracking-wide mr-2">{log.action}:</span> <span className="font-medium text-gray-800">{log.details}</span></div>
                             <div className="text-gray-500 font-mono text-xs font-bold">{new Date(log.timestamp).toLocaleString()}</div>
                         </div>
                     ))}
                </div>
            )}
        </div>

        <div className="bg-black text-gray-400 text-xs p-4 border-t border-gray-800 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-6">
                <span className="flex items-center gap-2"><Server size={14} /> Status: <span className="text-green-400 font-black uppercase">Operational</span></span>
                <span className="hidden sm:inline text-gray-600">|</span>
                <span className="flex items-center gap-2"><Database size={14} /> Records: <span className="text-white font-mono font-bold text-sm">{allCases.length + deletedCases.length}</span></span>
            </div>
            <div className="flex items-center gap-2 font-bold text-white"><LockKeyhole size={14} /> Logged in as Owner</div>
        </div>
      </div>
    </div>
  );
};