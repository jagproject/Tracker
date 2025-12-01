import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Download, Upload, FileSpreadsheet, Lock, Unlock, CheckCircle, AlertTriangle, X, Send, Shield, Activity, Trash2, Search, Database, Edit, Save, ArrowLeft, Power, CheckSquare, Square, Loader2, BarChart3, PieChart as PieChartIcon, Filter, LayoutGrid, FileJson, Clock, Wifi, WifiOff, RefreshCw, ShieldCheck, Ghost, LockKeyhole, Mail, Recycle, RefreshCcw, ScanSearch, Server, FileText, ArrowUpDown, ChevronUp, ChevronDown, Check, EyeOff } from 'lucide-react';
import { CitizenshipCase, Language, CaseType, CaseStatus, AuditLogEntry } from '../types';
import { TRANSLATIONS, STATUS_TRANSLATIONS, COUNTRIES } from '../constants';
import { importCases, fetchCases, fetchDeletedCases, restoreCase, hardDeleteCase, addAuditLog, getAuditLogs, deleteCase, upsertCase, getAppConfig, setMaintenanceMode, getFullDatabaseDump, getLastFetchError, checkConnection, parseAndImportCSV } from '../services/storageService';
import { detectAnomalies } from '../services/geminiService';
import { calculateQuickStats, formatDuration, isGhostCase, formatISODateToLocale } from '../services/statsUtils';
import { isSupabaseEnabled } from '../services/authService';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  
  const [dbError, setDbError] = useState<string | null>(null);
  const [isVerifyingDb, setIsVerifyingDb] = useState(false);

  // Anomaly Detection State
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const OWNER_EMAIL = "jaalvarezgarcia@gmail.com";
  const SECRET_KEY = "Alemania2023.tracker!project"; 

  useEffect(() => {
    const initData = async () => {
        if (authState === 'AUTHENTICATED') {
            setAuditLogs(getAuditLogs());
            setAllCases(await fetchCases()); // Fetch Active
            setDeletedCases(await fetchDeletedCases()); // Fetch Deleted (Recycle Bin)
            setMaintenanceEnabled(getAppConfig().maintenanceMode);
            setLastBackup(localStorage.getItem('de_tracker_last_backup_ts'));
            setDbError(getLastFetchError());
        }
    };
    initData();
  }, [authState, activeTab]);

  const refreshAll = async () => {
       setAllCases(await fetchCases());
       setDeletedCases(await fetchDeletedCases());
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
      const jsonString = JSON.stringify(dump, null, 2);
      
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
      await restoreCase(id);
      addAuditLog("Restore", `Restored case ${id} from Recycle Bin`, email);
      await refreshAll();
  };

  const handleSoftDelete = async (id: string) => {
      if (confirm("Are you sure you want to move this case to the Recycle Bin?")) {
          await deleteCase(id);
          addAuditLog("Soft Delete", `Deleted case ${id}`, email);
          await refreshAll();
      }
  }

  const handlePermanentDelete = async (id: string) => {
      if (confirm("DANGER: This will permanently destroy this record. It cannot be recovered. Continue?")) {
          await hardDeleteCase(id);
          addAuditLog("Hard Delete", `Permanently deleted case ${id}`, email);
          await refreshAll();
      }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editForm) return;
      
      const caseToSave = { ...editForm };
      
      // ONLY update email if the admin typed something in the "New Email" box
      if (emailEditValue && emailEditValue.trim() !== '') {
          caseToSave.email = emailEditValue.trim().toLowerCase();
      }

      await upsertCase(caseToSave);
      addAuditLog("Edit", `Admin edited case ${editForm.id}`, email);
      
      setEditForm(null);
      setEmailEditValue('');
      await refreshAll();
  }

  const handleSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.toLowerCase() === OWNER_EMAIL) { setAuthState('OTP'); } else { alert("Access Denied"); }
  };
  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp === SECRET_KEY) { setAuthState('AUTHENTICATED'); } else { alert("Invalid Password"); }
  };
  const handleToggleMaintenance = () => {
    const newState = !maintenanceEnabled; setMaintenanceMode(newState); setMaintenanceEnabled(newState);
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

  // Summary Logic
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

  // Login Modal
  if (authState !== 'AUTHENTICATED') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
          <div className="bg-de-black p-4 flex justify-between items-center text-white font-bold">
             <h3>Admin Access</h3>
             <button onClick={onClose}><X size={20}/></button>
          </div>
          <div className="p-6">
            {authState === 'EMAIL' ? (
               <form onSubmit={handleSendCode} className="space-y-4">
                 <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-2 border rounded" placeholder="Email" required />
                 <button type="submit" className="w-full bg-de-red text-white py-2 rounded font-bold">Next</button>
               </form>
            ) : (
               <form onSubmit={handleVerifyOtp} className="space-y-4">
                 <input type="password" value={otp} onChange={e => setOtp(e.target.value)} className="w-full p-2 border rounded" placeholder="Password" required />
                 <button type="submit" className="w-full bg-de-gold font-bold py-2 rounded">Login</button>
               </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Admin Dashboard
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full overflow-hidden border-t-8 border-de-gold flex flex-col max-h-[90vh]">
        <div className="bg-gray-50 p-4 flex justify-between items-center border-b flex-shrink-0">
             <h3 className="text-de-black font-bold flex items-center gap-2 text-lg">
                <Unlock size={20} className="text-de-gold" /> {t.admin}
             </h3>
             <button onClick={onClose} className="text-gray-400 hover:text-de-red"><X size={20} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 flex-shrink-0 overflow-x-auto">
           {['SUMMARY', 'ACTIONS', 'MANAGE'].map(tab => (
               <button 
                key={tab}
                onClick={() => setActiveTab(tab as AdminTab)} 
                className={`flex-1 py-3 text-sm font-bold min-w-[100px] ${activeTab === tab ? 'text-de-black border-b-2 border-de-black' : 'text-gray-400 hover:bg-gray-50'}`}
              >
                {tab}
              </button>
           ))}
           <button 
                onClick={() => setActiveTab('RECYCLE')} 
                className={`flex-1 py-3 text-sm font-bold min-w-[120px] ${activeTab === 'RECYCLE' ? 'text-red-600 border-b-2 border-red-600 bg-red-50' : 'text-gray-400 hover:bg-red-50 hover:text-red-500'}`}
              >
                <div className="flex items-center justify-center gap-2"><Recycle size={16}/> Recycle Bin</div>
           </button>
           <button 
                onClick={() => setActiveTab('LOGS')} 
                className={`flex-1 py-3 text-sm font-bold min-w-[80px] ${activeTab === 'LOGS' ? 'text-de-black border-b-2 border-de-black' : 'text-gray-400 hover:bg-gray-50'}`}
              >
                Logs
           </button>
        </div>

        <div className="p-6 overflow-y-auto flex-grow bg-gray-50/50">
            {activeTab === 'SUMMARY' && (
                <div className="space-y-6">
                    {/* Monitor in Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className={`p-4 rounded-lg border text-sm flex items-center justify-between shadow-sm transition-colors ${isDbConnected ? 'bg-green-50 border-green-200 text-green-900' : 'bg-red-50 border-red-200 text-red-800'}`}>
                            <div className="flex items-center gap-3">
                                {isDbConnected ? <Wifi size={20} className="text-green-600" /> : <WifiOff size={20} className="text-red-600" />}
                                <div>
                                    <span className="font-bold block">Database Connection: {isDbConnected ? "Stable" : "Disconnected"}</span>
                                    <span className="text-xs opacity-80">{isDbConnected ? "Supabase instance active." : "Check configuration."}</span>
                                </div>
                            </div>
                            <button onClick={handleVerifyConnection} disabled={isVerifyingDb} className="text-xs font-bold bg-white border border-current px-3 py-1.5 rounded flex items-center gap-1 hover:bg-gray-50">
                                {isVerifyingDb ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Verify
                            </button>
                        </div>
                        <div className="p-4 rounded-lg border border-blue-200 bg-blue-50 text-blue-900 text-sm flex items-center gap-3 shadow-sm">
                            <ShieldCheck size={28} className="text-blue-600 flex-shrink-0" />
                            <div>
                                <span className="font-bold block text-base">Auto-Deletion: DISABLED (Safe Mode)</span>
                                <span className="text-xs text-blue-800 block mt-0.5">Records are soft-deleted to Recycle Bin.</span>
                            </div>
                        </div>
                    </div>

                    {/* Breakdown Math */}
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <h4 className="font-bold text-lg mb-4 text-de-black border-b pb-2">Record Breakdown Formula</h4>
                        
                        <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-center font-mono text-sm md:text-base">
                             <div className="bg-gray-100 p-3 rounded-lg w-full md:w-auto">
                                <span className="block text-2xl font-bold">{breakdown.total}</span>
                                <span className="text-xs uppercase text-gray-500 font-bold">Total Records</span>
                             </div>
                             <span className="font-bold text-gray-400 text-xl">=</span>
                             <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 w-full md:w-auto">
                                <span className="block text-2xl font-bold text-blue-600">{breakdown.inProgress.length}</span>
                                <span className="text-xs uppercase text-blue-400 font-bold">In Progress</span>
                             </div>
                             <span className="font-bold text-gray-400 text-xl">+</span>
                             <div className="bg-green-50 p-3 rounded-lg border border-green-100 w-full md:w-auto">
                                <span className="block text-2xl font-bold text-green-600">{breakdown.approved.length + breakdown.closed.length}</span>
                                <span className="text-xs uppercase text-green-500 font-bold">Finished</span>
                             </div>
                             <span className="font-bold text-gray-400 text-xl">+</span>
                              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 w-full md:w-auto">
                                <span className="block text-2xl font-bold text-gray-400">{breakdown.ghosts.length}</span>
                                <span className="text-xs uppercase text-gray-400 font-bold">Ghosts</span>
                             </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-6 text-xs text-center">
                             <div className="p-2 bg-gray-50 rounded">
                                 <span className="block font-bold">{breakdown.submitted.length}</span>
                                 <span className="text-gray-400">Submitted</span>
                             </div>
                             <div className="p-2 bg-blue-50 text-blue-800 rounded">
                                 <span className="block font-bold">{breakdown.protocol.length}</span>
                                 <span>Protocol</span>
                             </div>
                             <div className="p-2 bg-yellow-50 text-yellow-800 rounded">
                                 <span className="block font-bold">{breakdown.docs.length}</span>
                                 <span>Docs Req.</span>
                             </div>
                              <div className="p-2 bg-green-50 text-green-800 rounded">
                                 <span className="block font-bold">{breakdown.approved.length}</span>
                                 <span>Approved</span>
                             </div>
                              <div className="p-2 bg-red-50 text-red-800 rounded">
                                 <span className="block font-bold">{breakdown.closed.length}</span>
                                 <span>Closed</span>
                             </div>
                             <div className="p-2 bg-gray-50 text-gray-400 rounded border border-dashed border-gray-300">
                                 <span className="block font-bold">{breakdown.ghosts.length}</span>
                                 <span>Ghost</span>
                             </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Type Distribution Chart */}
                        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm h-80 flex flex-col">
                            <h4 className="font-bold text-sm mb-2 text-de-black flex items-center gap-2">
                                <PieChartIcon size={16} /> Case Type Distribution
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
                                        <Tooltip />
                                        <Legend verticalAlign="bottom" height={36} iconSize={10}/>
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Additional Stats */}
                        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center gap-4">
                            <div className="text-center p-4 bg-gray-50 rounded-lg">
                                <p className="text-gray-400 text-xs uppercase font-bold mb-1">Total Active (Non-Ghost)</p>
                                <p className="text-3xl font-extrabold text-de-black">{breakdown.nonGhosts.length}</p>
                            </div>
                            <div className="text-center p-4 bg-red-50 rounded-lg border border-red-100">
                                <p className="text-red-400 text-xs uppercase font-bold mb-1">Recycle Bin</p>
                                <p className="text-3xl font-extrabold text-red-600">{deletedCases.length}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'ACTIONS' && (
                <div className="space-y-6 max-w-2xl mx-auto">
                    
                    {/* Data Management Section */}
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <h4 className="font-bold text-sm text-gray-700 flex items-center gap-2 mb-4">
                            <Database size={16} /> Data Import / Export
                        </h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Import Button */}
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded hover:bg-gray-50 transition-colors"
                            >
                                <Upload className="text-blue-500 mb-2" size={24} />
                                <span className="font-bold text-sm">Bulk Import</span>
                                <span className="text-xs text-gray-400">Accepts .JSON or .CSV</span>
                            </button>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept=".json,.csv"
                                onChange={handleFileChange}
                            />
                            
                            {/* Export CSV */}
                            <button 
                                onClick={handleExportCSV}
                                className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded hover:bg-gray-50 transition-colors"
                            >
                                <FileSpreadsheet className="text-green-600 mb-2" size={24} />
                                <span className="font-bold text-sm">Export CSV</span>
                                <span className="text-xs text-gray-400">For Spreadsheet Analysis</span>
                            </button>

                             {/* Export JSON */}
                             <button 
                                onClick={handleDownloadJSON}
                                className="md:col-span-2 flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded hover:bg-gray-50 transition-colors"
                            >
                                <FileJson className="text-yellow-600 mb-2" size={24} />
                                <span className="font-bold text-sm">Export Full DB (JSON)</span>
                                <span className="text-xs text-gray-400">Complete Backup for Restore</span>
                            </button>
                        </div>

                        {importStatus && (
                            <div className={`mt-4 p-3 rounded text-sm font-bold ${importStatus.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {importStatus.msg}
                            </div>
                        )}
                        {isImporting && <p className="text-center text-xs text-gray-500 mt-2">Processing file... please wait.</p>}
                    </div>

                    {/* Email Backup Action */}
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
                        <div>
                            <h4 className="font-bold text-sm text-gray-700 flex items-center gap-2">
                                <Mail size={16} /> Email Backup
                            </h4>
                            <p className="text-xs text-gray-500 mt-1">Send .JSON dump to owner email.</p>
                        </div>
                        <button onClick={handleEmailBackup} className="px-4 py-2 bg-de-black text-white rounded font-bold text-sm hover:bg-gray-800">
                            Send Email
                        </button>
                    </div>

                    {/* AI Anomaly Scan */}
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h4 className="font-bold text-sm text-gray-700 flex items-center gap-2">
                                    <ScanSearch size={16} /> AI Anomaly Detection
                                </h4>
                                <p className="text-xs text-gray-500 mt-1">Scan database for duplicates or logical errors.</p>
                            </div>
                            <button 
                                onClick={handleScanAnomalies} 
                                disabled={isScanning}
                                className="px-4 py-2 bg-blue-600 text-white rounded font-bold text-sm hover:bg-blue-700 flex items-center gap-2"
                            >
                                {isScanning ? <Loader2 className="animate-spin" size={16}/> : <ScanSearch size={16} />} Scan
                            </button>
                        </div>

                        {anomalies.length > 0 && (
                            <div className="bg-gray-50 p-4 rounded border border-gray-200 max-h-60 overflow-y-auto">
                                <h5 className="font-bold text-xs uppercase text-gray-500 mb-2">Issues Found ({anomalies.length})</h5>
                                {anomalies.map((issue, idx) => (
                                    <div key={idx} className="text-xs p-2 border-b border-gray-100 last:border-0">
                                        <span className="font-bold text-red-600">{issue.issueType}: </span>
                                        <span className="font-bold text-gray-800">{issue.name}</span>
                                        <p className="text-gray-500">{issue.details}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    {/* Toggle Maintenance */}
                    <div className={`p-4 rounded-xl border transition-colors ${maintenanceEnabled ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200 shadow-sm'}`}>
                         <div className="flex justify-between items-center">
                             <div className="flex items-center gap-2 font-bold text-sm">
                                 <Power size={16} /> Maintenance Mode
                             </div>
                             <button onClick={handleToggleMaintenance} className={`px-4 py-2 rounded font-bold text-sm ${maintenanceEnabled ? 'bg-orange-500 text-white' : 'border'}`}>
                                 {maintenanceEnabled ? "Resume App" : "Pause App"}
                             </button>
                         </div>
                    </div>
                </div>
            )}

            {/* Manage Tab with Table */}
            {activeTab === 'MANAGE' && (
                <div className="space-y-4">
                     {/* Edit Modal (Expanded) */}
                     {editForm && (
                         <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
                             <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
                                 <div className="bg-de-black text-white p-4 font-bold flex justify-between items-center">
                                     <h3>Edit Case: {editForm.fantasyName}</h3>
                                     <button onClick={() => setEditForm(null)}><X size={20}/></button>
                                 </div>
                                 <div className="p-6 overflow-y-auto space-y-4">
                                    <form id="edit-case-form" onSubmit={handleSaveEdit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                             <label className="text-xs font-bold block mb-1">Fantasy Name</label>
                                             <input 
                                                value={editForm.fantasyName} 
                                                onChange={e => setEditForm({...editForm, fantasyName: e.target.value})}
                                                className="w-full border rounded p-2 text-sm"
                                             />
                                        </div>
                                        <div>
                                             <label className="text-xs font-bold block mb-1">Email</label>
                                             <div className="flex items-center gap-2 mb-2 p-2 bg-gray-50 border rounded">
                                                 <span className="font-mono text-sm text-gray-600">{maskEmail(editForm.email)}</span>
                                                 <span className="text-[10px] text-gray-400 italic ml-auto">(Hidden)</span>
                                             </div>
                                             <input 
                                                type="text"
                                                value={emailEditValue} 
                                                onChange={e => setEmailEditValue(e.target.value)}
                                                className="w-full border rounded p-2 text-sm"
                                                placeholder="Enter NEW email to replace (leave empty to keep)"
                                                autoComplete="off"
                                             />
                                        </div>
                                        <div>
                                             <label className="text-xs font-bold block mb-1">Case Type</label>
                                             <select 
                                                value={editForm.caseType} 
                                                onChange={e => setEditForm({...editForm, caseType: e.target.value as CaseType})}
                                                className="w-full border rounded p-2 text-sm"
                                             >
                                                 {Object.values(CaseType).map(t => <option key={t} value={t}>{t}</option>)}
                                             </select>
                                        </div>
                                        <div>
                                             <label className="text-xs font-bold block mb-1">Country</label>
                                             <select 
                                                value={editForm.countryOfApplication} 
                                                onChange={e => setEditForm({...editForm, countryOfApplication: e.target.value})}
                                                className="w-full border rounded p-2 text-sm"
                                             >
                                                 {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                                             </select>
                                        </div>
                                        <div>
                                             <label className="text-xs font-bold block mb-1">Status</label>
                                             <select 
                                                value={editForm.status} 
                                                onChange={e => setEditForm({...editForm, status: e.target.value as CaseStatus})}
                                                className="w-full border rounded p-2 text-sm"
                                             >
                                                 {Object.values(CaseStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                             </select>
                                        </div>
                                        
                                        <div className="md:col-span-2 border-t pt-4 mt-2">
                                            <h4 className="font-bold text-gray-500 text-xs uppercase mb-3">Timeline</h4>
                                        </div>

                                        <div>
                                             <label className="text-xs font-bold block mb-1">Submission Date</label>
                                             <input 
                                                type="date"
                                                value={editForm.submissionDate || ''} 
                                                onChange={e => setEditForm({...editForm, submissionDate: e.target.value})}
                                                className="w-full border rounded p-2 text-sm"
                                             />
                                        </div>
                                         <div>
                                             <label className="text-xs font-bold block mb-1">Protocol Date</label>
                                             <input 
                                                type="date"
                                                value={editForm.protocolDate || ''} 
                                                onChange={e => setEditForm({...editForm, protocolDate: e.target.value})}
                                                className="w-full border rounded p-2 text-sm"
                                             />
                                        </div>
                                        <div>
                                             <label className="text-xs font-bold block mb-1">Docs Request Date</label>
                                             <input 
                                                type="date"
                                                value={editForm.docsRequestDate || ''} 
                                                onChange={e => setEditForm({...editForm, docsRequestDate: e.target.value})}
                                                className="w-full border rounded p-2 text-sm bg-yellow-50"
                                             />
                                        </div>
                                         <div>
                                             <label className="text-xs font-bold block mb-1">Approval Date</label>
                                             <input 
                                                type="date"
                                                value={editForm.approvalDate || ''} 
                                                onChange={e => setEditForm({...editForm, approvalDate: e.target.value})}
                                                className="w-full border rounded p-2 text-sm bg-green-50"
                                             />
                                        </div>
                                        <div>
                                             <label className="text-xs font-bold block mb-1">Closed Date</label>
                                             <input 
                                                type="date"
                                                value={editForm.closedDate || ''} 
                                                onChange={e => setEditForm({...editForm, closedDate: e.target.value})}
                                                className="w-full border rounded p-2 text-sm bg-red-50"
                                             />
                                        </div>
                                        <div className="md:col-span-2">
                                             <label className="text-xs font-bold block mb-1">Notes</label>
                                             <textarea 
                                                value={editForm.notes || ''} 
                                                onChange={e => setEditForm({...editForm, notes: e.target.value})}
                                                className="w-full border rounded p-2 text-sm h-20"
                                                placeholder="Admin notes..."
                                             />
                                        </div>
                                    </form>
                                 </div>
                                 <div className="p-4 bg-gray-50 border-t flex justify-end gap-2">
                                     <button onClick={() => setEditForm(null)} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-200 rounded">Cancel</button>
                                     <button type="submit" form="edit-case-form" className="px-6 py-2 bg-blue-600 text-white rounded font-bold shadow-sm hover:bg-blue-700">Save Changes</button>
                                 </div>
                             </div>
                         </div>
                     )}

                     <div className="flex gap-4 mb-4">
                         <div className="relative flex-1">
                             <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                             <input 
                                type="text" 
                                placeholder="Search by Name, Country or Email..." 
                                value={manageSearchTerm}
                                onChange={e => setManageSearchTerm(e.target.value)}
                                className="w-full pl-10 p-2 border rounded-lg shadow-sm"
                             />
                         </div>
                         <div className="bg-gray-100 p-2 rounded text-xs font-bold flex items-center">
                             Visible: {filteredManageCases.length}
                         </div>
                     </div>

                     <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
                         <table className="table-fixed w-full text-sm">
                             <thead className="bg-gray-50 border-b">
                                 <tr>
                                     <th 
                                        className="w-1/4 p-3 text-left cursor-pointer hover:bg-gray-100" 
                                        onClick={() => handleSort('fantasyName')}
                                     >
                                         <div className="flex items-center gap-1">Name <ArrowUpDown size={12}/></div>
                                     </th>
                                     <th className="w-1/4 p-3 text-left">
                                         <div className="flex items-center gap-1">Email (Censored) <EyeOff size={12}/></div>
                                     </th>
                                     <th 
                                        className="w-32 p-3 text-left cursor-pointer hover:bg-gray-100"
                                        onClick={() => handleSort('countryOfApplication')}
                                     >
                                         <div className="flex items-center gap-1">Country <ArrowUpDown size={12}/></div>
                                     </th>
                                     <th 
                                        className="w-1/6 p-3 text-left cursor-pointer hover:bg-gray-100"
                                        onClick={() => handleSort('status')}
                                     >
                                        <div className="flex items-center gap-1">Status <ArrowUpDown size={12}/></div>
                                     </th>
                                     <th className="w-[100px] p-3 text-right">Actions</th>
                                 </tr>
                             </thead>
                             <tbody>
                                 {filteredManageCases.slice(0, 50).map(c => (
                                     <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                                         <td className="p-3 truncate">
                                             <div className="font-bold text-de-black">{c.fantasyName}</div>
                                             <div className="text-[10px] text-gray-400 font-mono">{c.id.substring(0,8)}...</div>
                                         </td>
                                         <td className="p-3 font-mono text-xs text-gray-500 truncate" title="Email content is hidden">
                                             {maskEmail(c.email)}
                                         </td>
                                         <td className="p-3 truncate">
                                             <div className="text-xs font-bold">{c.countryOfApplication}</div>
                                             <div className="text-[10px] text-gray-500">{c.caseType}</div>
                                         </td>
                                         <td className="p-3">
                                             <span className={`text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap ${
                                                c.status === CaseStatus.APPROVED ? 'bg-green-100 text-green-700' :
                                                c.status === CaseStatus.CLOSED ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                                             }`}>
                                                 {STATUS_TRANSLATIONS[lang][c.status] || c.status}
                                             </span>
                                         </td>
                                         <td className="p-3 text-right">
                                             <div className="flex justify-end gap-2">
                                                <button onClick={() => { setEditForm(c); setEmailEditValue(''); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Edit Case"><Edit size={16} /></button>
                                                <button onClick={() => handleSoftDelete(c.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Move to Recycle Bin"><Trash2 size={16} /></button>
                                             </div>
                                         </td>
                                     </tr>
                                 ))}
                                 {filteredManageCases.length > 50 && (
                                     <tr>
                                         <td colSpan={5} className="p-3 text-center text-gray-400 text-xs italic">
                                             Showing first 50 results. Use search to find specific cases.
                                         </td>
                                     </tr>
                                 )}
                             </tbody>
                         </table>
                     </div>
                </div>
            )}

            {activeTab === 'RECYCLE' && (
                <div className="space-y-4 max-w-4xl mx-auto animate-in slide-in-from-right-4">
                    <div className="bg-red-50 border border-red-100 p-4 rounded-lg flex items-center gap-3 text-red-800">
                        <Recycle size={24} />
                        <div>
                            <h4 className="font-bold text-sm">Recycle Bin</h4>
                            <p className="text-xs">These cases were soft-deleted. You can restore them or permanently destroy them.</p>
                        </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        {deletedCases.length === 0 ? (
                            <div className="p-8 text-center text-gray-400 text-sm">Recycle Bin is empty.</div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
                                    <tr>
                                        <th className="p-3 text-left">Name / ID</th>
                                        <th className="p-3 text-left">Deleted At</th>
                                        <th className="p-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {deletedCases.map(c => (
                                        <tr key={c.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                                            <td className="p-3 font-medium">
                                                <div className="text-de-black">{c.fantasyName}</div>
                                                <div className="text-xs text-gray-400 font-mono">{c.id.substring(0,8)}...</div>
                                            </td>
                                            <td className="p-3 text-gray-500 text-xs">
                                                {c.deletedAt ? new Date(c.deletedAt).toLocaleString() : 'Unknown'}
                                            </td>
                                            <td className="p-3 text-right flex justify-end gap-2">
                                                <button 
                                                    onClick={() => handleRestoreCase(c.id)}
                                                    className="p-1.5 bg-green-50 text-green-700 rounded hover:bg-green-100 border border-green-200 flex items-center gap-1 text-xs font-bold"
                                                >
                                                    <RefreshCcw size={14}/> Restore
                                                </button>
                                                <button 
                                                    onClick={() => handlePermanentDelete(c.id)}
                                                    className="p-1.5 bg-red-50 text-red-700 rounded hover:bg-red-100 border border-red-200 flex items-center gap-1 text-xs font-bold"
                                                >
                                                    <Trash2 size={14}/> Destroy
                                                </button>
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
                <div className="space-y-2 max-w-4xl mx-auto">
                     {auditLogs.map(log => (
                         <div key={log.id} className="bg-white p-3 rounded border border-gray-100 text-xs flex justify-between">
                             <div><span className="font-bold">{log.action}:</span> {log.details}</div>
                             <div className="text-gray-400">{new Date(log.timestamp).toLocaleString()}</div>
                         </div>
                     ))}
                </div>
            )}

        </div>

        {/* ADMIN FOOTER MONITOR */}
        <div className="bg-gray-900 text-gray-400 text-xs p-3 border-t border-gray-800 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                    <Server size={12} /> System Status: <span className="text-green-400 font-bold">Operational</span>
                </span>
                <span className="hidden sm:inline">|</span>
                <span className="flex items-center gap-1.5">
                    <Database size={12} /> Records: <span className="text-white font-mono">{allCases.length + deletedCases.length}</span>
                </span>
            </div>
            <div className="flex items-center gap-2">
                 <LockKeyhole size={12} /> Logged in as Owner
            </div>
        </div>
      </div>
    </div>
  );
};