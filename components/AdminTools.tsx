

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Download, Upload, FileSpreadsheet, Lock, Unlock, CheckCircle, AlertTriangle, X, Send, Shield, Activity, Trash2, Search, Database, Edit, Save, ArrowLeft, Power, CheckSquare, Square, Loader2, BarChart3, PieChart as PieChartIcon, Filter, LayoutGrid, FileJson, Clock } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { CitizenshipCase, Language, CaseType, CaseStatus, AuditLogEntry } from '../types';
import { TRANSLATIONS, COUNTRIES, CASE_SPECIFIC_DOCS, COMMON_DOCS, STATUS_TRANSLATIONS } from '../constants';
import { importCases, fetchCases, addAuditLog, getAuditLogs, clearAllData, deleteCase, upsertCase, getAppConfig, setMaintenanceMode, getFullDatabaseDump, restoreFullDatabaseDump } from '../services/storageService';
import { generateFantasyUsername } from '../services/geminiService';
import { calculateQuickStats, formatDuration } from '../services/statsUtils';

interface AdminToolsProps {
  lang: Language;
  onClose: () => void;
  onDataChange: () => void;
}

type AuthState = 'EMAIL' | 'OTP' | 'AUTHENTICATED';
type AdminTab = 'SUMMARY' | 'ACTIONS' | 'MANAGE' | 'LOGS';

// Colors for Charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#DD0000', '#333'];
const STATUS_COLORS = {
  [CaseStatus.SUBMITTED]: '#A9A9A9',
  [CaseStatus.PROTOCOL_RECEIVED]: '#3B82F6',
  [CaseStatus.ADDITIONAL_DOCS]: '#F59E0B',
  [CaseStatus.APPROVED]: '#10B981',
  [CaseStatus.CLOSED]: '#EF4444'
};

// --- HELPERS ---

// Helper to parse Spanish/English short dates (e.g., "23-jul-25" -> "2025-07-23")
const parseFlexibleDate = (dateStr: string): string | undefined => {
    if (!dateStr || dateStr.trim() === '' || dateStr.toUpperCase() === 'NULL') return undefined;
    const clean = dateStr.trim().toLowerCase();
    
    // Map month abbreviations (Spanish & English mixed cover)
    const monthMap: Record<string, string> = {
        'ene': '01', 'jan': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'apr': '04',
        'may': '05', 'mai': '05', 'jun': '06', 'jul': '07', 'ago': '08', 'aug': '08',
        'sep': '09', 'oct': '10', 'okt': '10', 'nov': '11', 'dic': '12', 'dec': '12', 'dez': '12'
    };

    // Regex for DD-MMM-YY or DD-MMM-YYYY
    const parts = clean.split(/[-/ ]/);
    
    if (parts.length === 3) {
        let d = parts[0];
        let m = parts[1];
        let y = parts[2];

        // Fix numeric month if passed as number
        if (!isNaN(parseInt(m))) {
            m = parseInt(m).toString().padStart(2, '0');
        } else {
            // Try to map text month (first 3 chars)
            const mKey = m.substring(0, 3);
            m = monthMap[mKey] || '01';
        }

        // Fix Year (25 -> 2025)
        if (y.length === 2) {
            const yNum = parseInt(y);
            y = (yNum < 50 ? '20' : '19') + y;
        }

        d = d.padStart(2, '0');

        // Construct ISO
        const iso = `${y}-${m}-${d}`;
        const dateObj = new Date(iso);
        if (!isNaN(dateObj.getTime())) return iso;
    }

    // Try standard parsing
    const standardDate = new Date(dateStr);
    if (!isNaN(standardDate.getTime())) {
        return standardDate.toISOString().split('T')[0];
    }

    return undefined;
};

// Helper to map CSV status strings to internal Enum
const normalizeStatus = (rawStatus: string): CaseStatus => {
    if (!rawStatus) return CaseStatus.SUBMITTED;
    const s = rawStatus.toLowerCase().trim();

    if (s.includes('aprob') || s.includes('approv') || s.includes('urkunde')) return CaseStatus.APPROVED;
    if (s.includes('cerrad') || s.includes('closed') || s.includes('rechaz') || s.includes('reject')) return CaseStatus.CLOSED;
    if (s.includes('akten') || s.includes('proto') || s.includes('az') || s.includes('recibido') || s.includes('received')) return CaseStatus.PROTOCOL_RECEIVED;
    if (s.includes('doc') || s.includes('add') || s.includes('adicional') || s.includes('unterlagen')) return CaseStatus.ADDITIONAL_DOCS;
    
    // Default fallback
    return CaseStatus.SUBMITTED;
};

export const AdminTools: React.FC<AdminToolsProps> = ({ lang, onClose, onDataChange }) => {
  const t = TRANSLATIONS[lang];
  const [authState, setAuthState] = useState<AuthState>('EMAIL');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('SUMMARY');
  const [importStatus, setImportStatus] = useState<{success: boolean, msg: string} | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [allCases, setAllCases] = useState<CitizenshipCase[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editForm, setEditForm] = useState<CitizenshipCase | null>(null);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [statusDistFilter, setStatusDistFilter] = useState<string>('All');
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const OWNER_EMAIL = "jaalvarezgarcia@gmail.com";
  const SECRET_KEY = "Alemania2023.tracker!project"; 

  useEffect(() => {
    const initData = async () => {
        if (authState === 'AUTHENTICATED') {
            setAuditLogs(getAuditLogs());
            const cases = await fetchCases();
            setAllCases(cases);
            setMaintenanceEnabled(getAppConfig().maintenanceMode);
            // Read last backup timestamp
            setLastBackup(localStorage.getItem('de_tracker_last_backup_ts'));
        }
    };
    initData();
  }, [authState, activeTab]);

  const handleSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.toLowerCase() === OWNER_EMAIL) {
      setAuthState('OTP');
    } else {
      alert("Access Denied: Not an authorized owner email.");
    }
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp === SECRET_KEY) {
      setAuthState('AUTHENTICATED');
      addAuditLog("Login", "Owner authenticated via Password", email);
    } else {
      alert("Invalid Password");
    }
  };

  const handleToggleMaintenance = () => {
    const newState = !maintenanceEnabled;
    setMaintenanceMode(newState);
    setMaintenanceEnabled(newState);
    addAuditLog("Maintenance", `Maintenance Mode set to ${newState}`, email);
    onDataChange(); 
  };

  // Check Backup Status
  const isBackupOverdue = useMemo(() => {
     if (!lastBackup) return true; // Never backed up
     const last = new Date(lastBackup).getTime();
     const now = new Date().getTime();
     const diffHours = (now - last) / (1000 * 60 * 60);
     return diffHours > 24;
  }, [lastBackup]);

  // --- STATS CALCULATION FOR SUMMARY TAB ---
  const summaryStats = useMemo(() => {
    if (allCases.length === 0) return null;

    const total = allCases.length;
    const unclaimed = allCases.filter(c => c.email.startsWith('unclaimed_')).length;
    const submitted = allCases.filter(c => c.status === CaseStatus.SUBMITTED).length;
    const protocol = allCases.filter(c => c.status === CaseStatus.PROTOCOL_RECEIVED).length;
    const approved = allCases.filter(c => c.status === CaseStatus.APPROVED).length;
    
    // 1. DYNAMIC TYPE STATS (Fix for discrepancy)
    const typeMap = new Map<string, CitizenshipCase[]>();
    
    allCases.forEach(c => {
        const typeKey = c.caseType || "Unknown";
        if (!typeMap.has(typeKey)) {
            typeMap.set(typeKey, []);
        }
        typeMap.get(typeKey)?.push(c);
    });

    const typeStats = Array.from(typeMap.entries()).map(([type, cases]) => {
         const stats = calculateQuickStats(cases);
         return {
            type,
            count: cases.length,
            avgWait: stats.avgDaysTotal
         };
    }).sort((a,b) => b.count - a.count);

    // Chart Data for Types
    const typeChartData = typeStats.map(s => ({
        name: s.type.split(' ')[0] + ' ' + (s.type.split(' ')[1] || ''), // Shorten name
        fullType: s.type,
        value: s.count
    }));

    // 2. FILTERED STATUS DISTRIBUTION
    const statusCounts: Record<string, number> = {
        [CaseStatus.SUBMITTED]: 0,
        [CaseStatus.PROTOCOL_RECEIVED]: 0,
        [CaseStatus.ADDITIONAL_DOCS]: 0,
        [CaseStatus.APPROVED]: 0,
        [CaseStatus.CLOSED]: 0,
    };
    
    const casesForStatus = statusDistFilter === 'All' 
        ? allCases 
        : allCases.filter(c => c.caseType === statusDistFilter);

    casesForStatus.forEach(c => {
        if (statusCounts[c.status] !== undefined) {
            statusCounts[c.status]++;
        }
    });

    const statusChartData = Object.entries(statusCounts).map(([key, value]) => ({
        name: key,
        value: value
    })).filter(d => d.value > 0);

    return { total, unclaimed, submitted, protocol, approved, statusCounts, typeStats, typeChartData, statusChartData };
  }, [allCases, statusDistFilter]);


  // 1. CSV Export
  const handleExport = async () => {
    const cases = await fetchCases();
    if (cases.length === 0) return;

    const headers = [
      "Email", "FantasyName", "Country", "Consulate", "CaseType", 
      "SubmissionDate", "ProtocolDate", "DocsRequestDate", "ApprovalDate", "ClosedDate", 
      "Status", "ProtocolNumber", "Notes", "LastUpdated"
    ];

    const csvRows = [
      headers.join(','),
      ...cases.map(c => {
        return [
          c.email,
          `"${c.fantasyName}"`,
          `"${c.countryOfApplication}"`,
          `"${c.consulate || ''}"`,
          `"${c.caseType}"`,
          c.submissionDate || '',
          c.protocolDate || '',
          c.docsRequestDate || '',
          c.approvalDate || '',
          c.closedDate || '',
          `"${c.status}"`,
          c.protocolNumber || '',
          `"${(c.notes || '').replace(/"/g, '""')}"`,
          c.lastUpdated || ''
        ].join(',');
      })
    ];

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `de_citizenship_cases_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    addAuditLog("Export", "Full case database exported to CSV", email);
  };

  // 1.5 JSON Backup
  const handleBackup = async () => {
    const dump = await getFullDatabaseDump();
    const jsonString = JSON.stringify(dump, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TRACKER_BACKUP_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    // Update Tracking
    const now = new Date().toISOString();
    localStorage.setItem('de_tracker_last_backup_ts', now);
    setLastBackup(now);

    addAuditLog("Backup", "Full Database JSON Backup downloaded", email);
  };

  // 2. Download Template
  const handleDownloadTemplate = () => {
    const headers = [
        "Email", "FantasyName", "Country", "Consulate", "CaseType", "SubmissionDate", "Status", 
        "ProtocolDate", "ApprovalDate", "Notes"
    ];
    const sampleRow = [
        "user@example.com", "Blue Eagle", "Argentina", "Buenos Aires", "StAG §5", "23-jul-25", "Aktenzeichen (Protocol)",
        "01-ago-25", "", "Sample note"
    ];
    const csvContent = [headers.join(','), sampleRow.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "import_template.csv";
    a.click();
  };

  // 3. Bulk Import (Smart Merge + Batching)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus(null);
    setIsImporting(true);
    setImportProgress(0);

    const reader = new FileReader();

    // Check if JSON (Full Restore)
    if (file.name.endsWith('.json') || file.type === 'application/json') {
         reader.onload = async (event) => {
             try {
                 const rawText = event.target?.result as string;
                 const json = JSON.parse(rawText);
                 await restoreFullDatabaseDump(json);
                 
                 setImportStatus({ success: true, msg: "Database successfully restored from JSON backup." });
                 addAuditLog("Restore", "Full Database restored from JSON", email);
                 onDataChange();
                 setAllCases(await fetchCases());
             } catch (err: any) {
                 console.error(err);
                 setImportStatus({ success: false, msg: `Restore Failed: ${err.message}` });
             } finally {
                 setIsImporting(false);
             }
         };
         reader.readAsText(file);
         if (fileInputRef.current) fileInputRef.current.value = '';
         return;
    }

    // Default: CSV Processing
    reader.onload = async (event) => {
      try {
        const rawText = event.target?.result as string;
        const text = rawText.replace(/^\uFEFF/, ''); // Remove BOM
        
        const rows = text.split('\n').map(row => row.trim()).filter(row => row);
        if (rows.length < 2) throw new Error("Empty CSV");

        // Determine delimiter
        const headerRow = rows[0];
        const delimiter = (headerRow.indexOf(';') > -1 && headerRow.split(';').length > headerRow.split(',').length) ? ';' : ',';

        // Headers normalized
        const headers = rows[0].split(delimiter).map(h => h.trim().replace(/"/g, '').toLowerCase());
        
        // Fetch existing cases to check for duplicates/updates
        const existingCases = await fetchCases();
        const nameMap = new Map<string, CitizenshipCase>();
        existingCases.forEach(c => nameMap.set(c.fantasyName.toLowerCase(), c));

        const processedCases: CitizenshipCase[] = [];
        let updatedCount = 0;
        let createdCount = 0;

        for (let i = 1; i < rows.length; i++) {
            const values = rows[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
            
            // Skip malformed rows
            if (values.length < headers.length / 2) continue;

            const rowData: any = {};
            headers.forEach((h, idx) => rowData[h] = values[idx]);

            let fName = rowData['fantasyname'] || rowData['fantasy_name'];
            // Generate name if missing
            if (!fName || fName === '' || fName.toUpperCase() === 'NULL') {
                fName = await generateFantasyUsername(`User${i}`);
            }

            // CHECK FOR EXISTING USER (Merge Strategy)
            const existing = nameMap.get(fName.toLowerCase());
            
            // Resolve ID and Email
            const caseId = existing ? existing.id : crypto.randomUUID();
            
            let caseEmail = rowData['email'];
            // If CSV email is invalid/null, preserve existing email or generate new unclaimed
            if (!caseEmail || caseEmail.trim() === '' || caseEmail.toUpperCase() === 'NULL') {
                caseEmail = existing ? existing.email : `unclaimed_${caseId}@tracker.local`;
            }

            // Dates
            const subDate = parseFlexibleDate(rowData['submissiondate'] || rowData['submission_date']);
            if (!subDate) continue; // Skip rows without submission date

            const lastUpdatedCSV = parseFlexibleDate(rowData['lastupdated'] || rowData['last_updated']);

            const newCase: CitizenshipCase = {
                id: caseId,
                email: caseEmail,
                fantasyName: fName,
                countryOfApplication: rowData['countryofapplication'] || rowData['country'] || (existing?.countryOfApplication || 'Unknown'),
                consulate: rowData['consulate'] || (existing?.consulate),
                caseType: (rowData['casetype'] as CaseType) || (existing?.caseType || CaseType.STAG_5),
                submissionDate: subDate,
                status: normalizeStatus(rowData['status'] || existing?.status),
                lastUpdated: lastUpdatedCSV || new Date().toISOString(),
                protocolDate: parseFlexibleDate(rowData['protocoldate'] || rowData['protocol_date']) || (existing?.protocolDate),
                approvalDate: parseFlexibleDate(rowData['approvaldate'] || rowData['approval_date']) || (existing?.approvalDate),
                docsRequestDate: parseFlexibleDate(rowData['docsrequestdate'] || rowData['docs_date']) || (existing?.docsRequestDate),
                closedDate: parseFlexibleDate(rowData['closeddate'] || rowData['closed_date']) || (existing?.closedDate),
                protocolNumber: rowData['protocolnumber'] || (existing?.protocolNumber),
                notes: rowData['notes'] || (existing?.notes),
                
                // Preserve notification settings if existing
                notifySameDateSubmission: existing?.notifySameDateSubmission ?? true,
                notifySameMonthUrkunde: existing?.notifySameMonthUrkunde ?? true,
                notifySubmissionCohortUpdates: existing?.notifySubmissionCohortUpdates ?? true,
                notifyProtocolCohortUpdates: existing?.notifyProtocolCohortUpdates ?? true,
                documents: existing?.documents || []
            };

            processedCases.push(newCase);
            if (existing) updatedCount++; else createdCount++;
        }

        if (processedCases.length === 0) throw new Error("No valid rows parsed.");

        // BATCH UPLOAD LOGIC
        // Supabase has payload limits, so we split into chunks of 50
        const BATCH_SIZE = 50;
        const totalBatches = Math.ceil(processedCases.length / BATCH_SIZE);

        for (let i = 0; i < totalBatches; i++) {
            const batch = processedCases.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
            await importCases(batch);
            setImportProgress(Math.round(((i + 1) / totalBatches) * 100));
            // Small delay to be nice to the API
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        setImportStatus({ success: true, msg: `Success: ${createdCount} Created, ${updatedCount} Updated.` });
        addAuditLog("Import", `Imported ${processedCases.length} rows (${updatedCount} merges)`, email);
        onDataChange();
        setAllCases(await fetchCases());

      } catch (err: any) {
        console.error(err);
        setImportStatus({ success: false, msg: `${t.errorImport} (${err.message})` });
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 4. Clear Data
  const handleClearData = async () => {
    if (window.confirm("WARNING: This will delete ALL cases from the database. This cannot be undone. Are you sure?")) {
      await clearAllData();
      addAuditLog("Reset", "Administrator cleared all database records", email);
      onDataChange();
      setAllCases([]);
      alert("Database cleared.");
    }
  };

  // 5. Delete Single Case
  const handleDeleteCase = async (id: string, fantasyName: string) => {
    if (window.confirm(`Are you sure you want to delete case for "${fantasyName}"?`)) {
      await deleteCase(id);
      addAuditLog("Delete Case", `Deleted case: ${fantasyName}`, email);
      setAllCases(await fetchCases());
      onDataChange();
    }
  };

  // 6. Edit Single Case
  const handleEditCase = (c: CitizenshipCase) => {
    setEditForm({...c}); 
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;
    await upsertCase(editForm);
    addAuditLog("Edit Case", `Admin edited case: ${editForm.fantasyName}`, email);
    setAllCases(await fetchCases());
    onDataChange();
    setEditForm(null);
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const { name, value, type } = e.target;
      if (editForm) {
          setEditForm({ 
            ...editForm, 
            [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value 
          });
      }
  };

  const handleDocToggle = (doc: string) => {
      if (!editForm) return;
      const currentDocs = editForm.documents || [];
      const newDocs = currentDocs.includes(doc) 
        ? currentDocs.filter(d => d !== doc)
        : [...currentDocs, doc];
      setEditForm({ ...editForm, documents: newDocs });
  };

  const filteredCases = allCases.filter(c => 
    c.fantasyName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.countryOfApplication.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const inputClass = "w-full rounded border border-gray-300 bg-white p-2 text-sm focus:ring-2 focus:ring-de-gold focus:border-de-gold outline-none";
  const labelClass = "block text-xs font-bold text-gray-500 uppercase mb-1";

  if (authState !== 'AUTHENTICATED') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
          <div className="bg-de-black p-4 flex justify-between items-center">
             <h3 className="text-white font-bold flex items-center gap-2"><Shield size={16} /> {t.adminLogin}</h3>
             <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
          </div>
          
          <div className="p-6">
            {authState === 'EMAIL' ? (
               <form onSubmit={handleSendCode} className="space-y-4">
                 <div>
                   <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Owner Email</label>
                   <input 
                     type="email" 
                     value={email}
                     onChange={e => setEmail(e.target.value)}
                     className="w-full p-3 border rounded border-gray-300 focus:ring-2 focus:ring-de-red outline-none"
                     placeholder="owner@example.com"
                     autoFocus
                     required
                   />
                 </div>
                 <button type="submit" className="w-full bg-de-red text-white font-bold py-2 rounded hover:bg-red-700 flex items-center justify-center gap-2">
                     Next <Send size={14} />
                 </button>
               </form>
            ) : (
               <form onSubmit={handleVerifyOtp} className="space-y-4">
                 <div className="text-center mb-4">
                   <p className="text-sm text-gray-600">Verifying</p>
                   <p className="font-bold text-de-black">{email}</p>
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Admin Password</label>
                   <input 
                     type="password" 
                     value={otp}
                     onChange={e => setOtp(e.target.value)}
                     className="w-full text-center text-lg tracking-widest p-2 border rounded border-de-gold focus:ring-2 focus:ring-de-red outline-none"
                     placeholder="••••••••"
                     autoFocus
                   />
                 </div>
                 <button type="submit" className="w-full bg-de-gold text-de-black font-bold py-2 rounded hover:bg-yellow-400">
                     Login
                 </button>
                 <button 
                   type="button" 
                   onClick={() => setAuthState('EMAIL')} 
                   className="w-full text-xs text-gray-400 hover:text-gray-600"
                 >
                   Change Email
                 </button>
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
        <div className="bg-gray-50 p-4 flex justify-between items-center border-b flex-shrink-0">
             <h3 className="text-de-black font-bold flex items-center gap-2 text-lg">
                <Unlock size={20} className="text-de-gold" /> {t.admin}
             </h3>
             <button onClick={onClose} className="text-gray-400 hover:text-de-red"><X size={20} /></button>
        </div>

        <div className="flex border-b border-gray-200 flex-shrink-0">
           <button 
            onClick={() => setActiveTab('SUMMARY')} 
            className={`flex-1 py-3 text-sm font-bold ${activeTab === 'SUMMARY' ? 'text-de-black border-b-2 border-de-black' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            <div className="flex items-center justify-center gap-2"><LayoutGrid size={16}/> Dashboard</div>
          </button>
          <button 
            onClick={() => setActiveTab('ACTIONS')} 
            className={`flex-1 py-3 text-sm font-bold ${activeTab === 'ACTIONS' ? 'text-de-black border-b-2 border-de-black' : 'text-gray-400 hover:bg-gray-50'}`}
          >
             <div className="flex items-center justify-center gap-2"><Power size={16}/> Actions</div>
          </button>
          <button 
            onClick={() => setActiveTab('MANAGE')} 
            className={`flex-1 py-3 text-sm font-bold ${activeTab === 'MANAGE' ? 'text-de-black border-b-2 border-de-black' : 'text-gray-400 hover:bg-gray-50'}`}
          >
             <div className="flex items-center justify-center gap-2"><Database size={16}/> Manage</div>
          </button>
          <button 
            onClick={() => setActiveTab('LOGS')} 
            className={`flex-1 py-3 text-sm font-bold ${activeTab === 'LOGS' ? 'text-de-black border-b-2 border-de-black' : 'text-gray-400 hover:bg-gray-50'}`}
          >
             <div className="flex items-center justify-center gap-2"><Activity size={16}/> Logs</div>
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-grow bg-gray-50/50">
            
            {activeTab === 'SUMMARY' && summaryStats && (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                    {/* Top KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                            <p className="text-gray-400 text-xs uppercase font-bold mb-1">Total Cases</p>
                            <p className="text-3xl font-extrabold text-gray-900">{summaryStats.total}</p>
                        </div>
                         <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                            <p className="text-gray-400 text-xs uppercase font-bold mb-1">Approved</p>
                            <p className="text-3xl font-extrabold text-green-600">{summaryStats.approved}</p>
                        </div>
                         <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                            <p className="text-gray-400 text-xs uppercase font-bold mb-1">In Process</p>
                            <p className="text-3xl font-extrabold text-blue-600">{summaryStats.submitted + summaryStats.protocol}</p>
                        </div>
                        <div className="bg-yellow-50 text-yellow-800 p-4 rounded-xl shadow-sm border border-yellow-200">
                            <p className="text-yellow-600 text-xs uppercase font-bold mb-1">Unclaimed</p>
                            <p className="text-3xl font-extrabold flex items-center gap-2">
                                {summaryStats.unclaimed}
                                <AlertTriangle size={20} className="text-yellow-500" />
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        
                        {/* CHART: Status Distribution */}
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col h-80">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                                    <PieChartIcon size={16} /> Status Distribution
                                </h4>
                                <div className="flex items-center gap-2">
                                    <Filter size={14} className="text-gray-400" />
                                    <select 
                                        value={statusDistFilter}
                                        onChange={(e) => setStatusDistFilter(e.target.value)}
                                        className="text-xs border-gray-300 rounded p-1 bg-gray-50 focus:ring-1 focus:ring-de-gold outline-none"
                                    >
                                        <option value="All">All Types</option>
                                        {summaryStats.typeStats.map(s => (
                                            <option key={s.type} value={s.type}>{s.type}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="flex-1 w-full min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={summaryStats.statusChartData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={50}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {summaryStats.statusChartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name as CaseStatus] || COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                        <Legend verticalAlign="bottom" height={36} iconSize={10}/>
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                         {/* CHART: Types Distribution */}
                         <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col h-80">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                                    <BarChart3 size={16} /> Cases by Type
                                </h4>
                            </div>
                            <div className="flex-1 w-full min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={summaryStats.typeChartData} margin={{top: 5, right: 30, left: 20, bottom: 5}}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" tick={{fontSize: 10}} interval={0} />
                                        <YAxis tick={{fontSize: 10}} />
                                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                        <Bar dataKey="value" fill="#DD0000" radius={[4, 4, 0, 0]} name="Cases" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                    </div>

                    {/* Breakdown by Type Table (Detailed) */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                        <div className="bg-gray-50 p-3 border-b border-gray-200">
                             <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                                <Activity size={16} /> Detailed Breakdown
                             </h4>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-bold sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="p-3 text-left">Type</th>
                                        <th className="p-3 text-right">Count</th>
                                        <th className="p-3 text-right">AI Predictor (Avg)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {summaryStats.typeStats.map((s, idx) => (
                                        <tr key={s.type} className="hover:bg-gray-50">
                                            <td className="p-3 font-bold text-gray-900 flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full" style={{backgroundColor: COLORS[idx % COLORS.length]}}></div>
                                                {s.type}
                                            </td>
                                            <td className="p-3 text-right font-bold text-gray-900">{s.count}</td>
                                            <td className="p-3 text-right font-mono text-xs text-yellow-600 bg-yellow-50/30">
                                                {formatDuration(s.avgWait, lang)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'ACTIONS' && (
              <div className="space-y-6 animate-in slide-in-from-right-4 max-w-2xl mx-auto">
                
                {/* Backup Status Indicator */}
                <div className={`p-4 rounded-xl border flex justify-between items-center ${isBackupOverdue ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                    <div className="flex items-center gap-3">
                         <div className={`p-2 rounded-full ${isBackupOverdue ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                             {isBackupOverdue ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
                         </div>
                         <div>
                             <h4 className={`font-bold text-sm ${isBackupOverdue ? 'text-red-800' : 'text-green-800'}`}>
                                 {isBackupOverdue ? t.backupOverdue : t.backupSafe}
                             </h4>
                             <p className="text-xs text-gray-600 flex items-center gap-1 mt-1">
                                 <Clock size={10} /> {t.lastBackup} {lastBackup ? new Date(lastBackup).toLocaleString() : 'Never'}
                             </p>
                         </div>
                    </div>
                    {isBackupOverdue && (
                        <button 
                            onClick={handleBackup}
                            className="px-3 py-1 bg-red-600 text-white text-xs font-bold rounded shadow hover:bg-red-700 transition-colors animate-pulse"
                        >
                            Back up Now
                        </button>
                    )}
                </div>

                {/* Maintenance Toggle */}
                <div className={`p-4 rounded-xl border transition-colors ${maintenanceEnabled ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200 shadow-sm'}`}>
                    <div className="flex justify-between items-center">
                        <div>
                            <h4 className="font-bold text-sm text-gray-800 flex items-center gap-2">
                                <Power size={16} className={maintenanceEnabled ? 'text-orange-600' : 'text-gray-400'} />
                                {t.maintenance}
                            </h4>
                            <p className="text-xs text-gray-500 mt-1">
                                {maintenanceEnabled ? "App is paused for users." : "App is active."}
                            </p>
                        </div>
                        <button 
                            onClick={handleToggleMaintenance}
                            className={`px-4 py-2 rounded text-sm font-bold shadow-sm transition-all ${
                                maintenanceEnabled 
                                ? 'bg-orange-500 text-white hover:bg-orange-600' 
                                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            {maintenanceEnabled ? "Resume App" : "Pause App"}
                        </button>
                    </div>
                </div>

                {/* Export Section */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <h4 className="font-bold text-sm text-gray-700 mb-3 flex items-center gap-2">
                        <Download size={16} /> Export Data
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <button 
                            onClick={handleExport}
                            className="w-full flex items-center justify-center gap-2 bg-de-black text-white py-3 px-4 rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium shadow"
                        >
                            <FileSpreadsheet size={16} /> Export CSV
                        </button>
                        <button 
                            onClick={handleBackup}
                            className="w-full flex items-center justify-center gap-2 bg-white border border-de-black text-de-black py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium shadow"
                        >
                            <FileJson size={16} /> Backup JSON
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 text-center">
                        Use <strong>CSV</strong> for Excel analysis, and <strong>JSON</strong> for full database restoration.
                    </p>
                </div>

                {/* Import Section */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <h4 className="font-bold text-sm text-gray-700 mb-3 flex items-center gap-2">
                        <Upload size={16} /> Bulk Import / Restore
                    </h4>

                    <div className="mb-4 text-xs text-gray-500 bg-blue-50 p-3 rounded border border-blue-100">
                        <strong>Supports CSV & JSON:</strong>
                        <ul className="list-disc ml-4 mt-1 space-y-1">
                            <li><strong>CSV:</strong> Bulk update or add new cases.</li>
                            <li><strong>JSON:</strong> Full database restore from a previous backup.</li>
                        </ul>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                        <button 
                            onClick={handleDownloadTemplate}
                            className="flex items-center justify-center gap-2 text-de-red border border-de-red hover:bg-red-50 py-2 px-4 rounded-lg transition-colors text-xs font-bold uppercase tracking-wide"
                        >
                            <FileSpreadsheet size={14} /> {t.downloadTemplate}
                        </button>

                        <div className="relative">
                            <input 
                                type="file" 
                                accept=".csv,.json" 
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                disabled={isImporting}
                                className="hidden" 
                                id="csv-upload"
                            />
                            <label 
                                htmlFor="csv-upload"
                                className={`w-full flex items-center justify-center gap-2 bg-de-gold text-de-black py-3 px-4 rounded-lg hover:bg-yellow-400 cursor-pointer transition-colors text-sm font-bold shadow-sm ${isImporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {isImporting ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />} 
                                {isImporting ? `Processing... ${importProgress}%` : t.importCSV}
                            </label>
                        </div>
                    </div>

                    {importStatus && (
                        <div className={`mt-4 p-3 rounded flex items-center gap-2 text-sm ${importStatus.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {importStatus.success ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                            {importStatus.msg}
                        </div>
                    )}
                </div>

                {/* Danger Zone */}
                <div className="bg-red-50 p-5 rounded-xl border border-red-200">
                    <h4 className="font-bold text-sm text-red-800 mb-3 flex items-center gap-2">
                        <AlertTriangle size={16} /> Danger Zone
                    </h4>
                    <button 
                        onClick={handleClearData}
                        className="w-full flex items-center justify-center gap-2 bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 transition-colors text-sm font-bold shadow-sm"
                    >
                        <Trash2 size={16} /> Reset / Clear Database
                    </button>
                </div>
              </div>
            )}

            {activeTab === 'MANAGE' && (
              editForm ? (
                  <div className="h-full flex flex-col animate-in slide-in-from-right">
                      <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                        <button onClick={() => setEditForm(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                           <ArrowLeft size={20} />
                        </button>
                        <h3 className="font-bold text-de-black text-lg">Edit Case: {editForm.fantasyName}</h3>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                          {/* Section 1: Core Info */}
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className={labelClass}>Fantasy Name</label>
                                  <input type="text" name="fantasyName" value={editForm.fantasyName} onChange={handleEditChange} className={inputClass} />
                              </div>
                              <div>
                                  <label className={labelClass}>Email</label>
                                  <input type="email" name="email" value={editForm.email} onChange={handleEditChange} className={inputClass} />
                              </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className={labelClass}>Country</label>
                                  <select name="countryOfApplication" value={editForm.countryOfApplication} onChange={handleEditChange} className={inputClass}>
                                      {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                              </div>
                              <div>
                                  <label className={labelClass}>Consulate</label>
                                  <input type="text" name="consulate" value={editForm.consulate || ''} onChange={handleEditChange} className={inputClass} />
                              </div>
                          </div>

                           <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className={labelClass}>Case Type</label>
                                  <select name="caseType" value={editForm.caseType} onChange={handleEditChange} className={inputClass}>
                                      {Object.values(CaseType).map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                              </div>
                              <div>
                                  <label className={labelClass}>Status</label>
                                  <select name="status" value={editForm.status} onChange={handleEditChange} className={inputClass}>
                                      {Object.values(CaseStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                              </div>
                          </div>

                          <div className="grid grid-cols-3 gap-4 bg-gray-50 p-3 rounded">
                              <div>
                                  <label className={labelClass}>Submission Date</label>
                                  <input type="date" name="submissionDate" value={editForm.submissionDate} onChange={handleEditChange} className={inputClass} />
                              </div>
                              <div>
                                  <label className={labelClass}>Protocol Date</label>
                                  <input type="date" name="protocolDate" value={editForm.protocolDate || ''} onChange={handleEditChange} className={inputClass} />
                              </div>
                               <div>
                                  <label className={labelClass}>Docs Request</label>
                                  <input type="date" name="docsRequestDate" value={editForm.docsRequestDate || ''} onChange={handleEditChange} className={inputClass} />
                              </div>
                              <div>
                                  <label className={labelClass}>Approval Date</label>
                                  <input type="date" name="approvalDate" value={editForm.approvalDate || ''} onChange={handleEditChange} className={inputClass} />
                              </div>
                              <div>
                                  <label className={labelClass}>Closed Date</label>
                                  <input type="date" name="closedDate" value={editForm.closedDate || ''} onChange={handleEditChange} className={inputClass} />
                              </div>
                              <div>
                                  <label className={labelClass}>Protocol Number</label>
                                  <input type="text" name="protocolNumber" value={editForm.protocolNumber || ''} onChange={handleEditChange} className={inputClass} placeholder="AZ..." />
                              </div>
                          </div>
                          
                          <div>
                               <label className={labelClass}>Notes</label>
                               <textarea name="notes" value={editForm.notes || ''} onChange={handleEditChange} className={inputClass} rows={3} />
                          </div>

                          {/* Section 2: Notifications */}
                          <div className="border-t pt-4">
                            <h4 className="font-bold text-xs text-gray-500 uppercase mb-2">Notification Preferences</h4>
                            <div className="grid grid-cols-1 gap-2">
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" name="notifySameDateSubmission" checked={editForm.notifySameDateSubmission || false} onChange={handleEditChange} className="rounded text-de-gold focus:ring-de-gold" />
                                    <span className="text-sm">Notify Same Date Submission</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" name="notifySameMonthUrkunde" checked={editForm.notifySameMonthUrkunde || false} onChange={handleEditChange} className="rounded text-de-gold focus:ring-de-gold" />
                                    <span className="text-sm">Notify Same Month Urkunde</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" name="notifySubmissionCohortUpdates" checked={editForm.notifySubmissionCohortUpdates || false} onChange={handleEditChange} className="rounded text-de-gold focus:ring-de-gold" />
                                    <span className="text-sm">Notify Submission Cohort Updates</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" name="notifyProtocolCohortUpdates" checked={editForm.notifyProtocolCohortUpdates || false} onChange={handleEditChange} className="rounded text-de-gold focus:ring-de-gold" />
                                    <span className="text-sm">Notify Protocol Cohort Updates</span>
                                </label>
                            </div>
                          </div>

                          {/* Section 3: Documents */}
                          <div className="border-t pt-4">
                            <h4 className="font-bold text-xs text-gray-500 uppercase mb-2">Documents</h4>
                            <div className="grid grid-cols-2 gap-2">
                                {(CASE_SPECIFIC_DOCS[editForm.caseType] || COMMON_DOCS).map(doc => (
                                    <div 
                                        key={doc} 
                                        onClick={() => handleDocToggle(doc)}
                                        className={`flex items-center gap-2 p-2 rounded cursor-pointer border transition-colors ${
                                            (editForm.documents || []).includes(doc) 
                                            ? 'bg-green-50 border-green-200 text-green-900' 
                                            : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-600'
                                        }`}
                                    >
                                        {(editForm.documents || []).includes(doc) 
                                            ? <CheckSquare size={16} className="text-green-600" /> 
                                            : <Square size={16} className="text-gray-300" />}
                                        <span className="text-xs font-medium truncate">{doc}</span>
                                    </div>
                                ))}
                            </div>
                          </div>
                      </div>

                      <div className="pt-4 border-t border-gray-100 mt-4 flex justify-end gap-3">
                         <button onClick={() => setEditForm(null)} className="px-4 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded">Cancel</button>
                         <button onClick={handleSaveEdit} className="px-4 py-2 bg-de-gold text-de-black font-bold rounded hover:bg-yellow-400 flex items-center gap-2 shadow-sm">
                             <Save size={16} /> Save Changes
                         </button>
                      </div>
                  </div>
              ) : (
                  <div className="h-full flex flex-col animate-in slide-in-from-right-4">
                      <div className="mb-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                            <input 
                              type="text" 
                              placeholder="Search fantasy name, email, country..."
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-de-gold outline-none text-sm"
                            />
                        </div>
                      </div>
                      
                      <div className="space-y-2 overflow-y-auto flex-1 pr-1 bg-white border border-gray-100 rounded-lg p-2">
                          {filteredCases.length === 0 ? (
                              <div className="text-center py-8 text-gray-400">No cases found.</div>
                          ) : (
                              filteredCases.map(c => (
                                  <div key={c.id} className="flex items-center justify-between p-3 bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors last:border-0">
                                      <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                              <span className="font-bold text-sm text-de-black truncate">{c.fantasyName}</span>
                                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.status === CaseStatus.APPROVED ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                                                  {c.status}
                                              </span>
                                              {c.email.startsWith('unclaimed_') && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 font-bold uppercase flex items-center gap-1">
                                                  <AlertTriangle size={10} /> Unclaimed
                                                </span>
                                              )}
                                          </div>
                                          <div className="text-xs text-gray-500 truncate">
                                              {c.email} • {c.countryOfApplication}
                                          </div>
                                      </div>
                                      <div className="flex items-center gap-1">
                                          <button 
                                              onClick={() => handleEditCase(c)}
                                              className="p-2 text-gray-400 hover:text-de-gold hover:bg-yellow-50 rounded transition-colors"
                                              title="Edit Case"
                                          >
                                              <Edit size={16} />
                                          </button>
                                          <button 
                                              onClick={() => handleDeleteCase(c.id, c.fantasyName)}
                                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                              title="Delete Case"
                                          >
                                              <Trash2 size={16} />
                                          </button>
                                      </div>
                                  </div>
                              ))
                          )}
                      </div>
                  </div>
              )
            )}

            {activeTab === 'LOGS' && (
              <div className="space-y-2 animate-in slide-in-from-right-4 max-w-4xl mx-auto">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                    <h4 className="font-bold text-gray-900 mb-4 text-sm uppercase">Recent Activity</h4>
                    {auditLogs.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No logs recorded yet.</p>
                    )}
                    {auditLogs.map((log) => (
                    <div key={log.id} className="text-xs p-3 border-b border-gray-100 flex justify-between items-start hover:bg-gray-50 transition-colors last:border-0">
                        <div>
                        <span className="font-bold text-de-black block mb-1">{log.action}</span>
                        <span className="text-gray-600">{log.details}</span>
                        {log.user && <span className="text-gray-400 text-[10px] block mt-1 flex items-center gap-1"><Shield size={10} /> {log.user}</span>}
                        </div>
                        <span className="text-gray-400 font-mono whitespace-nowrap ml-4 bg-gray-50 px-2 py-1 rounded">{new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    ))}
                </div>
              </div>
            )}

        </div>
      </div>
    </div>
  );
};