
import React, { useState, useRef, useEffect } from 'react';
import { Download, Upload, FileSpreadsheet, Lock, Unlock, CheckCircle, AlertTriangle, X, Send, Shield, Activity, Trash2, Search, Database, Edit, Save, ArrowLeft, Power, CheckSquare, Square } from 'lucide-react';
import { CitizenshipCase, Language, CaseType, CaseStatus, AuditLogEntry } from '../types';
import { TRANSLATIONS, COUNTRIES, CASE_SPECIFIC_DOCS, COMMON_DOCS } from '../constants';
import { importCases, getCases, addAuditLog, getAuditLogs, clearAllData, deleteCase, upsertCase, getAppConfig, setMaintenanceMode } from '../services/storageService';
import { generateFantasyUsername } from '../services/geminiService';

interface AdminToolsProps {
  lang: Language;
  onClose: () => void;
  onDataChange: () => void;
}

type AuthState = 'EMAIL' | 'OTP' | 'AUTHENTICATED';
type AdminTab = 'ACTIONS' | 'MANAGE' | 'LOGS';

export const AdminTools: React.FC<AdminToolsProps> = ({ lang, onClose, onDataChange }) => {
  const t = TRANSLATIONS[lang];
  const [authState, setAuthState] = useState<AuthState>('EMAIL');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('ACTIONS');
  const [importStatus, setImportStatus] = useState<{success: boolean, msg: string} | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [allCases, setAllCases] = useState<CitizenshipCase[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editForm, setEditForm] = useState<CitizenshipCase | null>(null);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const OWNER_EMAIL = "jaalvarezgarcia@gmail.com";
  // Updated password as requested
  const SECRET_KEY = "Alemania2023.tracker!project"; 

  useEffect(() => {
    if (authState === 'AUTHENTICATED') {
      setAuditLogs(getAuditLogs());
      setAllCases(getCases());
      setMaintenanceEnabled(getAppConfig().maintenanceMode);
    }
  }, [authState, activeTab]);

  const handleSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.toLowerCase() === OWNER_EMAIL) {
      // Transition to Password step
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
    onDataChange(); // Refresh app to apply state immediately if applicable
  };

  // 1. CSV Export
  const handleExport = () => {
    const cases = getCases();
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

  // 2. Download Template
  const handleDownloadTemplate = () => {
    const headers = [
        "Email", "FantasyName", "Country", "Consulate", "CaseType", "SubmissionDate", "Status", 
        "ProtocolDate", "ApprovalDate", "Notes"
    ];
    const sampleRow = [
        "user@example.com", "Blue Eagle", "Argentina", "Buenos Aires", "5 StAG (Erklärung)", "2023-01-01", "Enviado",
        "", "", "Sample note"
    ];
    const csvContent = [headers.join(','), sampleRow.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "import_template.csv";
    a.click();
  };

  // 3. Bulk Import
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rawText = event.target?.result as string;
        // Remove BOM (Byte Order Mark) which Excel adds to UTF-8 CSVs
        const text = rawText.replace(/^\uFEFF/, '');
        
        const rows = text.split('\n').map(row => row.trim()).filter(row => row);
        
        if (rows.length < 2) throw new Error("Empty CSV");

        // Auto-detect delimiter: Check if semicolon is more frequent than comma in header (common in EU Excel)
        const headerRow = rows[0];
        const delimiter = (headerRow.indexOf(';') > -1 && headerRow.split(';').length > headerRow.split(',').length) ? ';' : ',';

        const headers = rows[0].split(delimiter).map(h => h.trim().replace(/"/g, ''));
        const newCases: CitizenshipCase[] = [];

        for (let i = 1; i < rows.length; i++) {
            const values = rows[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
            const rowData: any = {};
            headers.forEach((h, idx) => {
                rowData[h] = values[idx];
            });

            const caseId = crypto.randomUUID();
            let caseEmail = rowData['Email'];
            
            // Logic to handle missing email for bulk uploads
            if (!caseEmail || caseEmail.trim() === '') {
                // Generate a placeholder email. The 'unclaimed_' prefix is critical for the Claim Workflow.
                caseEmail = `unclaimed_${caseId}@tracker.local`;
            }
            
            // Submission Date is required
            if (!rowData['SubmissionDate']) continue;

            let fName = rowData['FantasyName'];
            if (!fName || fName === '') {
                fName = await generateFantasyUsername(caseId.substring(0, 8));
            }

            const newCase: CitizenshipCase = {
                id: caseId,
                email: caseEmail,
                fantasyName: fName,
                countryOfApplication: rowData['Country'] || 'Unknown',
                consulate: rowData['Consulate'] || undefined,
                caseType: (rowData['CaseType'] as CaseType) || CaseType.STAG_5,
                submissionDate: rowData['SubmissionDate'],
                status: (rowData['Status'] as CaseStatus) || CaseStatus.SUBMITTED,
                lastUpdated: new Date().toISOString(),
                protocolDate: rowData['ProtocolDate'] || undefined,
                approvalDate: rowData['ApprovalDate'] || undefined,
                docsRequestDate: rowData['DocsRequestDate'] || undefined,
                closedDate: rowData['ClosedDate'] || undefined,
                protocolNumber: rowData['ProtocolNumber'] || undefined,
                notes: rowData['Notes'] || undefined,
                notifySameDateSubmission: false,
                notifySameMonthUrkunde: false
            };
            newCases.push(newCase);
        }

        importCases(newCases);
        setImportStatus({ success: true, msg: `${newCases.length} ${t.successImport}` });
        addAuditLog("Import", `Imported ${newCases.length} cases via CSV`, email);
        onDataChange();
        setAllCases(getCases()); // Refresh local list

      } catch (err) {
        console.error(err);
        setImportStatus({ success: false, msg: t.errorImport });
        addAuditLog("Import Failed", "CSV parsing error", email);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 4. Clear Data
  const handleClearData = () => {
    if (window.confirm("WARNING: This will delete ALL cases from the database. This cannot be undone. Are you sure?")) {
      clearAllData();
      addAuditLog("Reset", "Administrator cleared all database records", email);
      onDataChange();
      setAllCases([]);
      alert("Database cleared.");
    }
  };

  // 5. Delete Single Case
  const handleDeleteCase = (id: string, fantasyName: string) => {
    if (window.confirm(`Are you sure you want to delete case for "${fantasyName}"?`)) {
      deleteCase(id);
      addAuditLog("Delete Case", `Deleted case: ${fantasyName}`, email);
      setAllCases(getCases());
      onDataChange();
    }
  };

  // 6. Edit Single Case
  const handleEditCase = (c: CitizenshipCase) => {
    setEditForm({...c}); // Clone to avoid direct mutation
  };

  const handleSaveEdit = () => {
    if (!editForm) return;
    upsertCase(editForm);
    addAuditLog("Edit Case", `Admin edited case: ${editForm.fantasyName}`, email);
    setAllCases(getCases());
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
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden border-t-8 border-de-gold flex flex-col max-h-[80vh]">
        <div className="bg-gray-50 p-4 flex justify-between items-center border-b flex-shrink-0">
             <h3 className="text-de-black font-bold flex items-center gap-2 text-lg">
                <Unlock size={20} className="text-de-gold" /> {t.admin}
             </h3>
             <button onClick={onClose} className="text-gray-400 hover:text-de-red"><X size={20} /></button>
        </div>

        <div className="flex border-b border-gray-200 flex-shrink-0">
          <button 
            onClick={() => setActiveTab('ACTIONS')} 
            className={`flex-1 py-3 text-sm font-bold ${activeTab === 'ACTIONS' ? 'text-de-black border-b-2 border-de-black' : 'text-gray-400'}`}
          >
            Actions
          </button>
          <button 
            onClick={() => setActiveTab('MANAGE')} 
            className={`flex-1 py-3 text-sm font-bold ${activeTab === 'MANAGE' ? 'text-de-black border-b-2 border-de-black' : 'text-gray-400'}`}
          >
            Manage Cases
          </button>
          <button 
            onClick={() => setActiveTab('LOGS')} 
            className={`flex-1 py-3 text-sm font-bold ${activeTab === 'LOGS' ? 'text-de-black border-b-2 border-de-black' : 'text-gray-400'}`}
          >
            {t.auditLog}
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-grow">
            
            {activeTab === 'ACTIONS' && (
              <div className="space-y-6">
                
                {/* Maintenance Toggle */}
                <div className={`p-4 rounded border transition-colors ${maintenanceEnabled ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200'}`}>
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
                <div className="bg-gray-50 p-4 rounded border border-gray-200">
                    <h4 className="font-bold text-sm text-gray-700 mb-3 flex items-center gap-2">
                        <Download size={16} /> Export
                    </h4>
                    <button 
                        onClick={handleExport}
                        className="w-full flex items-center justify-center gap-2 bg-de-black text-white py-2 px-4 rounded hover:bg-gray-800 transition-colors text-sm font-medium"
                    >
                        {t.exportCSV}
                    </button>
                </div>

                {/* Import Section */}
                <div className="bg-gray-50 p-4 rounded border border-gray-200">
                    <h4 className="font-bold text-sm text-gray-700 mb-3 flex items-center gap-2">
                        <Upload size={16} /> Import
                    </h4>

                    <div className="mb-4 text-xs text-gray-500 bg-white p-2 rounded border border-gray-100">
                        <strong>Bulk Upload Info:</strong>
                        <ul className="list-disc ml-4 mt-1 space-y-1">
                            <li>File must be <strong>CSV</strong>.</li>
                            <li>If <strong>Email</strong> is left empty, the case will be marked as "Unclaimed". Users can claim it by entering the exact Fantasy Name during signup.</li>
                            <li>Required columns: <code className="bg-gray-100 text-de-red">SubmissionDate</code></li>
                        </ul>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                        <button 
                            onClick={handleDownloadTemplate}
                            className="flex items-center justify-center gap-2 text-de-red border border-de-red hover:bg-red-50 py-2 px-4 rounded transition-colors text-xs font-bold uppercase tracking-wide"
                        >
                            <FileSpreadsheet size={14} /> {t.downloadTemplate}
                        </button>

                        <div className="relative">
                            <input 
                                type="file" 
                                accept=".csv" 
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                className="hidden" 
                                id="csv-upload"
                            />
                            <label 
                                htmlFor="csv-upload"
                                className="w-full flex items-center justify-center gap-2 bg-de-gold text-de-black py-2 px-4 rounded hover:bg-yellow-400 cursor-pointer transition-colors text-sm font-bold shadow-sm"
                            >
                                <Upload size={16} /> {t.importCSV}
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
                <div className="bg-red-50 p-4 rounded border border-red-200">
                    <h4 className="font-bold text-sm text-red-800 mb-3 flex items-center gap-2">
                        <AlertTriangle size={16} /> Danger Zone
                    </h4>
                    <button 
                        onClick={handleClearData}
                        className="w-full flex items-center justify-center gap-2 bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700 transition-colors text-sm font-bold shadow-sm"
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
                  <div className="h-full flex flex-col">
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
                      
                      <div className="space-y-2 overflow-y-auto flex-1 pr-1">
                          {filteredCases.length === 0 ? (
                              <div className="text-center py-8 text-gray-400">No cases found.</div>
                          ) : (
                              filteredCases.map(c => (
                                  <div key={c.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded hover:border-de-gold transition-colors">
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
              <div className="space-y-2">
                {auditLogs.length === 0 && (
                   <p className="text-sm text-gray-400 text-center py-4">No logs recorded yet.</p>
                )}
                {auditLogs.map((log) => (
                  <div key={log.id} className="text-xs p-2 border-b border-gray-100 flex justify-between items-start">
                    <div>
                      <span className="font-bold text-de-black block">{log.action}</span>
                      <span className="text-gray-500">{log.details}</span>
                      {log.user && <span className="text-gray-400 text-[10px] block mt-0.5">{log.user}</span>}
                    </div>
                    <span className="text-gray-400 font-mono whitespace-nowrap ml-2">{new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                ))}
              </div>
            )}

        </div>
      </div>
    </div>
  );
};
