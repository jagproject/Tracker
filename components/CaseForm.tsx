
import React, { useState, useEffect, useMemo } from 'react';
import { CitizenshipCase, CaseType, CaseStatus, Language } from '../types';
import { COUNTRIES, TRANSLATIONS, CASE_SPECIFIC_DOCS, COMMON_DOCS, STATUS_TRANSLATIONS } from '../constants';
import { Save, Loader2, AlertTriangle, Edit2, Download, Twitter, ChevronDown, Mail, Power, Facebook, Instagram, Share2 } from 'lucide-react';
import { getDaysDiff, formatISODateToLocale, formatDateTimeToLocale, formatDuration } from '../services/statsUtils';

interface CaseFormProps {
  initialData?: CitizenshipCase;
  userEmail: string;
  fantasyName: string;
  existingNames: string[];
  lang: Language;
  avgWaitTime: number;
  onSave: (data: CitizenshipCase) => void;
  isMaintenanceMode?: boolean;
}

interface CustomDateInputProps {
  label: string;
  name: string;
  value?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  lang: Language;
  required?: boolean;
  disabled?: boolean;
}

const CustomDateInput: React.FC<CustomDateInputProps> = ({ label, name, value, onChange, lang, required, disabled }) => (
    <div>
        <label className="block text-xs font-bold text-de-gray uppercase mb-1">
            {label} {required && <span className="text-de-red">*</span>}
        </label>
        <input
            type="date"
            name={name}
            value={value || ''}
            onChange={onChange}
            required={required}
            disabled={disabled}
            className={`w-full rounded border border-gray-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-de-gold focus:border-de-gold outline-none transition-colors 
            ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'text-de-black hover:border-gray-400 cursor-pointer'}`}
        />
    </div>
);

// --- Timeline Stepper (Green Line Logic with Time Calculation) ---
const CaseTimelineStepper: React.FC<{ status: CaseStatus, dates: { sub?: string, proto?: string, dec?: string }, lang: Language }> = ({ status, dates, lang }) => {
  const t = TRANSLATIONS[lang];
  
  // Logic: Calculate progress based on DATES specifically
  let progress = 0;
  if (dates.dec) {
      progress = 100;
  } else if (dates.proto) {
      progress = 50;
  }

  // Time Calculation Logic
  const today = new Date().toISOString().split('T')[0];
  
  // 1. Submitted -> Protocol (or Today)
  let subToProtoLabel = "";
  if (dates.sub) {
      const endDate = dates.proto || today;
      const diff = getDaysDiff(dates.sub, endDate);
      if (diff !== null && diff >= 0) {
          subToProtoLabel = formatDuration(diff, lang);
      }
  }

  // 2. Protocol -> Decision (or Today)
  let protoToDecLabel = "";
  if (dates.proto) {
      const endDate = dates.dec || today;
      const diff = getDaysDiff(dates.proto, endDate);
      if (diff !== null && diff >= 0) {
          protoToDecLabel = formatDuration(diff, lang);
      }
  }

  const steps = [
    { label: "Submitted", date: dates.sub, active: true },
    { label: "Protocol (AZ)", date: dates.proto, active: !!dates.proto },
    { label: "Decision", date: dates.dec, active: !!dates.dec }
  ];

  return (
    <div className="relative w-full py-10 mb-6 mt-2 px-6">
        {/* Background Line (Gray) */}
        <div className="absolute top-12 left-10 right-10 h-1.5 bg-gray-200 rounded-full -z-20"></div>
        
        {/* Active Progress Line (Green) */}
        <div 
            className="absolute top-12 left-10 h-1.5 bg-green-500 rounded-full -z-10 transition-all duration-700 ease-out shadow-[0_0_8px_rgba(34,197,94,0.6)]" 
            style={{ width: `calc((100% - 5rem) * ${progress / 100})` }}
        ></div>

        {/* Time Labels (Floating above lines) */}
        <div className="absolute top-5 left-10 right-10 flex justify-between pointer-events-none">
            {/* First Segment Label (Sub -> Proto) */}
            <div className="flex-1 text-center pr-4">
                {subToProtoLabel && (
                     <span className="text-[11px] font-bold text-blue-500 bg-white/80 px-2 py-0.5 rounded backdrop-blur-sm shadow-sm border border-blue-100">
                        {subToProtoLabel}
                     </span>
                )}
            </div>
            {/* Second Segment Label (Proto -> Dec) */}
            <div className="flex-1 text-center pl-4">
                {protoToDecLabel && (
                    <span className="text-[11px] font-bold text-blue-500 bg-white/80 px-2 py-0.5 rounded backdrop-blur-sm shadow-sm border border-blue-100">
                        {protoToDecLabel}
                    </span>
                )}
            </div>
        </div>
        
        <div className="flex justify-between items-start w-full">
            {steps.map((step, idx) => {
                const isActive = step.active;
                
                // Align text
                const alignClass = idx === 0 ? 'items-start text-left' : idx === 2 ? 'items-end text-right' : 'items-center text-center';

                return (
                    <div key={idx} className={`flex flex-col ${alignClass} w-1/3 relative`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center border-4 mb-2 transition-all duration-500 z-10 bg-white shadow-sm ${
                            isActive 
                                ? 'border-green-500 scale-110' 
                                : 'border-gray-300'
                        } ${idx === 0 ? 'self-start' : idx === 2 ? 'self-end' : 'self-center'}`}>
                            {isActive && <div className="w-2.5 h-2.5 rounded-full bg-green-500" />}
                        </div>
                        <div className={`flex flex-col ${alignClass}`}>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? 'text-green-600' : 'text-gray-400'}`}>
                                {step.label}
                            </span>
                            <span className="text-[10px] text-gray-500 font-mono mt-0.5">
                                {step.date ? formatISODateToLocale(step.date, lang) : ''}
                            </span>
                        </div>
                    </div>
                )
            })}
        </div>
    </div>
  );
};

export const CaseForm: React.FC<CaseFormProps> = ({ initialData, userEmail, fantasyName, existingNames, lang, avgWaitTime, onSave, isMaintenanceMode = false }) => {
  const t = TRANSLATIONS[lang];
  const statusT = STATUS_TRANSLATIONS[lang];

  const [formData, setFormData] = useState<Partial<CitizenshipCase>>({
    caseType: CaseType.STAG_5,
    countryOfApplication: 'Argentina',
    status: CaseStatus.SUBMITTED,
    submissionDate: new Date().toISOString().split('T')[0],
    notifySameDateSubmission: true, // Default True
    notifySameMonthUrkunde: true, // Default True
    notifySubmissionCohortUpdates: true, // Default True
    notifyProtocolCohortUpdates: true, // Default True
    documents: [] 
  });

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  
  // State for User Menu Dropdown
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Check if email is a placeholder for unclaimed cases
  const isPendingEmail = userEmail.startsWith('unclaimed_');

  // Compute last updated text
  const lastUpdateText = useMemo(() => {
    return formatDateTimeToLocale(initialData?.lastUpdated, lang);
  }, [initialData?.lastUpdated, lang]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        protocolDate: initialData.protocolDate || undefined,
        docsRequestDate: initialData.docsRequestDate || undefined,
        approvalDate: initialData.approvalDate || undefined,
        closedDate: initialData.closedDate || undefined,
        status: initialData.status || CaseStatus.SUBMITTED
      });
    } else {
       setFormData(prev => ({...prev, fantasyName}));
    }
  }, [initialData, fantasyName]);

  const cardSvgString = useMemo(() => {
    const statusColor = formData.status === CaseStatus.APPROVED ? "#10B981" : "#FFCC00";
    
    let timelineY = 255;
    let timelineContent = `<text x="50" y="${timelineY}" font-family="Arial, sans-serif" font-size="16" fill="#CCC">📅 ${t.timelineSubmitted}: <tspan fill="white" font-weight="bold">${formData.submissionDate || '--'}</tspan></text>`;
    
    if (formData.protocolDate) {
        timelineY += 30;
        timelineContent += `<text x="50" y="${timelineY}" font-family="Arial, sans-serif" font-size="16" fill="#CCC">📂 ${t.timelineProto}: <tspan fill="white" font-weight="bold">${formData.protocolDate}</tspan></text>`;
    }

    timelineY += 30;
    if (formData.status === CaseStatus.APPROVED && formData.approvalDate) {
         timelineContent += `<text x="50" y="${timelineY}" font-family="Arial, sans-serif" font-size="16" fill="#CCC">🏆 ${t.timelineUrkunde}: <tspan fill="#10B981" font-weight="bold">${formData.approvalDate}</tspan></text>`;
    } else if (formData.status === CaseStatus.CLOSED && formData.closedDate) {
         timelineContent += `<text x="50" y="${timelineY}" font-family="Arial, sans-serif" font-size="16" fill="#CCC">❌ ${t.timelineClosed}: <tspan fill="#EF4444" font-weight="bold">${formData.closedDate}</tspan></text>`;
    } else {
         timelineContent += `<text x="50" y="${timelineY}" font-family="Arial, sans-serif" font-size="16" fill="#CCC">⏳ ${t.timelineStatus}: <tspan fill="${statusColor}" font-weight="bold">${statusT[formData.status || CaseStatus.SUBMITTED]}</tspan></text>`;
    }

    const boxHeight = timelineY - 210 + 25; 

    const rawType = formData.caseType || '';
    let displayType = rawType;
    
    if (rawType.startsWith('StAG')) {
        const parts = rawType.split(' ');
        if (parts.length >= 2) {
             const numberPart = parts[1].replace('§', ''); 
             displayType = `${parts[0]} ${numberPart}`;
        }
    }

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#111111;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#222222;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="600" height="400" rx="15" fill="url(#grad1)" />
        <rect x="0" y="0" width="600" height="8" fill="#DD0000" />
        <rect x="0" y="8" width="600" height="8" fill="#FFCC00" />
        
        <text x="30" y="60" font-family="Arial, sans-serif" font-size="24" fill="white" font-weight="bold">German Citizenship Tracker</text>
        
        <rect x="30" y="100" width="540" height="2" fill="#333" />
        
        <text x="30" y="140" font-family="Arial, sans-serif" font-size="14" fill="#888">${t.cardApplicant}</text>
        <text x="30" y="170" font-family="Arial, sans-serif" font-size="24" fill="#FFCC00" font-weight="bold">${formData.fantasyName || 'Anonymous'}</text>
        <text x="30" y="200" font-family="Arial, sans-serif" font-size="16" fill="#CCC">${formData.countryOfApplication || 'Unknown'} ${formData.consulate ? `(${formData.consulate})` : ''}</text>
        
        <text x="400" y="140" font-family="Arial, sans-serif" font-size="14" fill="#888">${t.cardType}</text>
        <text x="400" y="170" font-family="Arial, sans-serif" font-size="20" fill="white">${displayType}</text>
        
        <rect x="30" y="220" width="540" height="${boxHeight}" rx="10" fill="#1a1a1a" stroke="#333" />
        
        ${timelineContent}
        
        <text x="570" y="380" font-family="Arial, sans-serif" font-size="12" fill="#444" text-anchor="end">${t.cardGenerated}</text>
      </svg>
    `;
  }, [formData, statusT, t]);

  const validate = (): string | null => {
    if (nameError) return t.usernameTaken;
    if (!formData.submissionDate) return t.validationError;
    
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    const subDate = new Date(formData.submissionDate);
    
    if (subDate > today) return "Submission Date cannot be in the future.";

    if (formData.protocolDate) {
        const protoDate = new Date(formData.protocolDate);
        if (protoDate > today) return "Protocol Date cannot be in the future.";
        if (protoDate < subDate) return "Protocol Date (Aktenzeichen) cannot be earlier than Submission Date.";
    }

    if (formData.docsRequestDate) {
        const docsDate = new Date(formData.docsRequestDate);
        if (docsDate > today) return "Documents Request Date cannot be in the future.";
        if (docsDate < subDate) return "Documents Request Date cannot be earlier than Submission Date.";
    }
    
    if (formData.status === CaseStatus.APPROVED) {
        if (!formData.approvalDate) return "Approval Date (Urkunde) is required.";
        const appDate = new Date(formData.approvalDate);
        
        if (appDate > today) return "Approval Date cannot be in the future.";
        if (appDate < subDate) return "Approval Date (Urkunde) cannot be earlier than Submission Date.";
        if (formData.protocolDate && appDate < new Date(formData.protocolDate)) return "Approval Date cannot be earlier than Protocol Date.";
    }
    
    if (formData.status === CaseStatus.CLOSED) {
        if (!formData.closedDate) return "Closing Date is required.";
        const closedDate = new Date(formData.closedDate);

        if (closedDate > today) return "Closing Date cannot be in the future.";
        if (closedDate < subDate) return "Closing Date cannot be earlier than Submission Date.";
        if (formData.protocolDate && closedDate < new Date(formData.protocolDate)) return "Closing Date cannot be earlier than Protocol Date.";
    }

    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isMaintenanceMode) return;

    const validationMsg = validate();
    if (validationMsg) {
      setError(validationMsg);
      setTimeout(() => setError(null), 5000);
      return;
    }
    setError(null);
    setIsSaving(true);
    setTimeout(() => {
      const updatedCase: CitizenshipCase = {
        ...formData as CitizenshipCase,
        id: initialData?.id || crypto.randomUUID(),
        email: userEmail,
        fantasyName: formData.fantasyName || fantasyName,
        lastUpdated: new Date().toISOString()
      };
      onSave(updatedCase);
      setIsSaving(false);
    }, 800);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let newData = { ...formData, [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value };
    if (name === 'status') {
        if (value === CaseStatus.APPROVED) newData.closedDate = undefined;
        if (value === CaseStatus.CLOSED) newData.approvalDate = undefined;
    }
    setFormData(newData);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newName = e.target.value;
      setFormData(prev => ({...prev, fantasyName: newName}));
      
      const currentStoredName = initialData?.fantasyName || fantasyName;
      const isDuplicate = existingNames.some(n => 
          n.toLowerCase() === newName.toLowerCase() && 
          n.toLowerCase() !== currentStoredName.toLowerCase()
      );
      if (isDuplicate) setNameError(t.usernameTaken);
      else if (newName.length < 3) setNameError(t.usernameShort);
      else setNameError(null);
  };

  const handleDownloadCard = () => {
    setIsDownloading(true);
    
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    const svgBlob = new Blob([cardSvgString], {type: 'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(svgBlob);
    
    img.onload = () => {
        ctx?.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        
        const pngUrl = canvas.toDataURL('image/png');
        
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = `TrackerDE_${formData.fantasyName}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setIsDownloading(false);
    };
    
    img.src = url;
  };

  const handleShare = (platform: 'twitter' | 'reddit' | 'whatsapp' | 'facebook' | 'instagram') => {
    const text = `Check out my German Citizenship application progress! I'm applying via ${formData.caseType} from ${formData.countryOfApplication}. #GermanCitizenship #StAG`;
    const currentUrl = window.location.href;
    let url = '';
    
    switch(platform) {
        case 'twitter':
            url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
            break;
        case 'reddit':
            url = `https://www.reddit.com/submit?title=${encodeURIComponent("My Citizenship Timeline")}&text=${encodeURIComponent(text)}`;
            break;
        case 'whatsapp':
            url = `https://wa.me/?text=${encodeURIComponent(text)}`;
            break;
        case 'facebook':
            url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}&quote=${encodeURIComponent(text)}`;
            break;
        case 'instagram':
             handleDownloadCard();
             alert("Image downloading! You can post this image to Instagram Stories or Feed.");
             return;
    }
    if (url) window.open(url, '_blank');
  };

  const showProtocol = formData.status !== CaseStatus.SUBMITTED || !!formData.protocolDate;
  const showDocs = formData.status === CaseStatus.ADDITIONAL_DOCS || !!formData.docsRequestDate || formData.status === CaseStatus.APPROVED || formData.status === CaseStatus.CLOSED;
  const safeShowApproved = (formData.status === CaseStatus.APPROVED || !!formData.approvalDate) && formData.status !== CaseStatus.CLOSED;
  const safeShowClosed = (formData.status === CaseStatus.CLOSED || !!formData.closedDate) && formData.status !== CaseStatus.APPROVED;

  const inputClass = "w-full rounded border border-gray-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-de-gold focus:border-de-gold transition-colors";
  const labelClass = "block text-xs font-bold text-de-gray uppercase mb-1";

  return (
    <div className="bg-white p-6 rounded-xl shadow-md border border-de-gray/20 relative">
      <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-4 relative">
        <h2 className="text-xl font-bold text-de-black">{t.myCase}</h2>
        
        <div className="flex flex-col items-end relative">
            <button 
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-1 mb-1 group outline-none"
            >
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider cursor-pointer group-hover:text-de-gold transition-colors">
                    Username
                </span>
                <ChevronDown size={12} className={`text-gray-400 group-hover:text-de-gold transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
            </button>
            
            <div className="flex items-center gap-2 relative">
                 <input 
                    type="text"
                    name="fantasyName"
                    value={formData.fantasyName || ''} 
                    onChange={handleNameChange}
                    className={`text-sm font-bold text-de-black bg-gray-50 border rounded px-2 py-1 w-40 text-right focus:ring-2 focus:ring-de-gold outline-none ${nameError ? 'border-red-500 focus:ring-red-200' : 'border-gray-200'}`}
                 />
                 <Edit2 size={14} className="text-gray-400 absolute right-3 pointer-events-none opacity-50" />
            </div>
            {nameError && <span className="text-[10px] text-red-500 font-bold mt-1">{nameError}</span>}
            
            <span className="text-[10px] text-gray-400 mt-1">
                {t.lastUpdatedLabel} {lastUpdateText}
            </span>

            {showUserMenu && (
                <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 z-50 animate-in fade-in zoom-in-95">
                    <div className="p-3 border-b border-gray-100 bg-gray-50 rounded-t-lg">
                         <p className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
                            <Mail size={10} /> {t.registeredEmail}
                         </p>
                         {isPendingEmail ? (
                            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                                <AlertTriangle size={16} className="flex-shrink-0" />
                                <div>
                                    <span className="font-bold text-xs block">{t.emailPending}</span>
                                    <span className="text-[10px] text-amber-700/80 leading-tight block">{t.emailPendingDesc}</span>
                                </div>
                            </div>
                         ) : (
                            <div className="flex items-start gap-2 text-gray-800 p-1">
                                <span className="text-sm font-medium break-all">{userEmail}</span>
                            </div>
                         )}
                    </div>
                </div>
            )}
            
            {showUserMenu && (
                <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowUserMenu(false)}
                ></div>
            )}
        </div>
      </div>

      <CaseTimelineStepper 
        status={formData.status || CaseStatus.SUBMITTED} 
        dates={{
            sub: formData.submissionDate,
            proto: formData.protocolDate,
            dec: formData.approvalDate || formData.closedDate
        }}
        lang={lang}
      />

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-de-red flex items-center gap-2 rounded text-sm font-medium border border-red-100 animate-pulse">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {isMaintenanceMode && (
         <div className="mb-4 p-3 bg-orange-50 text-orange-800 flex items-center gap-2 rounded text-sm font-medium border border-orange-100">
            <Power size={16} />
            {t.maintenanceMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>{t.caseType} <span className="text-de-red">*</span></label>
            <select
              name="caseType"
              value={formData.caseType}
              onChange={handleChange}
              className={inputClass}
              disabled={isMaintenanceMode}
            >
              {Object.values(CaseType).sort().map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
             <div>
                <label className={labelClass}>{t.country} <span className="text-de-red">*</span></label>
                <select
                name="countryOfApplication"
                value={formData.countryOfApplication}
                onChange={handleChange}
                className={inputClass}
                disabled={isMaintenanceMode}
                >
                {COUNTRIES.map(country => (
                    <option key={country} value={country}>{country}</option>
                ))}
                </select>
            </div>
             <div>
                <label className={labelClass}>{t.consulate}</label>
                <input
                    type="text"
                    name="consulate"
                    value={formData.consulate || ''}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="e.g. New York, Sao Paulo"
                    disabled={isMaintenanceMode}
                />
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CustomDateInput
                label={t.submissionDate}
                name="submissionDate"
                value={formData.submissionDate}
                onChange={handleChange}
                lang={lang}
                required
                disabled={isMaintenanceMode}
            />
            <div>
                <label className={labelClass}>{t.status} <span className="text-de-red">*</span></label>
                <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className={inputClass}
                disabled={isMaintenanceMode}
                >
                {Object.values(CaseStatus).map(status => (
                    <option key={status} value={status}>
                        {statusT[status] || status}
                    </option>
                ))}
                </select>
            </div>
        </div>

        <div className="p-4 bg-gray-50 rounded border border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
            {showProtocol && (
                <>
                    <CustomDateInput
                        label={t.protocolDate}
                        name="protocolDate"
                        value={formData.protocolDate}
                        onChange={handleChange}
                        lang={lang}
                        disabled={isMaintenanceMode}
                    />
                </>
            )}

            {showDocs && (
                <div className="md:col-span-2">
                     <CustomDateInput
                        label={t.docsDate}
                        name="docsRequestDate"
                        value={formData.docsRequestDate}
                        onChange={handleChange}
                        lang={lang}
                        disabled={isMaintenanceMode}
                    />
                </div>
            )}

            {safeShowApproved && (
                 <div className="md:col-span-2 bg-green-50 p-3 rounded border border-green-100">
                     <CustomDateInput
                        label={t.approvalDate}
                        name="approvalDate"
                        value={formData.approvalDate}
                        onChange={handleChange}
                        lang={lang}
                        required
                        disabled={isMaintenanceMode}
                    />
                 </div>
            )}

            {safeShowClosed && (
                 <div className="md:col-span-2 bg-red-50 p-3 rounded border border-red-100">
                     <CustomDateInput
                        label={t.closedDate}
                        name="closedDate"
                        value={formData.closedDate}
                        onChange={handleChange}
                        lang={lang}
                        required
                        disabled={isMaintenanceMode}
                    />
                 </div>
            )}
        </div>

        <div>
           <label className={labelClass}>{t.comments}</label>
           <textarea 
              name="notes"
              value={formData.notes || ''}
              onChange={handleChange}
              className={inputClass + " h-20"}
              placeholder="Public notes for community feed (anonymous)"
              disabled={isMaintenanceMode}
           />
        </div>

        <div className="bg-gray-50 border border-de-gold/30 p-4 rounded shadow-sm">
          <h4 className="font-bold text-de-black text-sm mb-2 flex items-center gap-2">
             {t.notifications}
          </h4>
          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded transition-colors">
              <input 
                type="checkbox" 
                name="notifySameDateSubmission"
                checked={formData.notifySameDateSubmission || false}
                onChange={handleChange}
                className="mt-1 rounded text-de-black focus:ring-de-gold"
                disabled={isMaintenanceMode}
              />
              <span className="text-sm text-gray-700">{t.notifySameDate}</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded transition-colors">
              <input 
                type="checkbox" 
                name="notifySameMonthUrkunde"
                checked={formData.notifySameMonthUrkunde || false}
                onChange={handleChange}
                className="mt-1 rounded text-de-black focus:ring-de-gold"
                disabled={isMaintenanceMode}
              />
              <span className="text-sm text-gray-700">{t.notifySameMonth}</span>
            </label>
             <label className="flex items-start gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded transition-colors">
              <input 
                type="checkbox" 
                name="notifySubmissionCohortUpdates"
                checked={formData.notifySubmissionCohortUpdates || false}
                onChange={handleChange}
                className="mt-1 rounded text-de-black focus:ring-de-gold"
                disabled={isMaintenanceMode}
              />
              <span className="text-sm text-gray-700">{t.notifySubmissionCohort}</span>
            </label>
             <label className="flex items-start gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded transition-colors">
              <input 
                type="checkbox" 
                name="notifyProtocolCohortUpdates"
                checked={formData.notifyProtocolCohortUpdates || false}
                onChange={handleChange}
                className="mt-1 rounded text-de-black focus:ring-de-gold"
                disabled={isMaintenanceMode}
              />
              <span className="text-sm text-gray-700">{t.notifyProtocolCohort}</span>
            </label>
          </div>
        </div>

        <div className="pt-4">
           <button
            type="submit"
            disabled={isSaving || !!nameError || isMaintenanceMode}
            className="w-full flex items-center justify-center gap-2 bg-de-black hover:bg-gray-800 text-white font-bold py-3 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg mb-4"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {isSaving ? t.saving : t.save}
          </button>
          
          <div className="border-t pt-4">
            <p className="text-xs font-bold text-gray-400 uppercase mb-3 text-center">{t.shareTitle}</p>
            
            <div className="mb-4 flex justify-center bg-gray-100 p-4 rounded border border-gray-200">
                <img 
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(cardSvgString)}`} 
                  alt="Case Preview" 
                  className="w-full max-w-[400px] h-auto rounded shadow-sm"
                />
            </div>

            <div className="flex flex-wrap gap-2 justify-center">
                <button
                    type="button"
                    onClick={handleDownloadCard}
                    disabled={isDownloading}
                    className="flex-1 min-w-[140px] flex items-center justify-center gap-2 bg-white border-2 border-de-gold text-de-black font-bold py-2 px-4 rounded hover:bg-yellow-50 transition-colors"
                >
                    {isDownloading ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
                    Download .PNG
                </button>
                
                <button type="button" onClick={() => handleShare('twitter')} className="p-2 bg-gray-100 hover:bg-blue-50 hover:text-blue-400 rounded transition-colors"><Twitter size={20} /></button>
                <button type="button" onClick={() => handleShare('whatsapp')} className="p-2 bg-gray-100 hover:bg-green-50 hover:text-green-500 rounded transition-colors"><Share2 size={20} /></button>
                <button type="button" onClick={() => handleShare('facebook')} className="p-2 bg-gray-100 hover:bg-blue-50 hover:text-blue-600 rounded transition-colors"><Facebook size={20} /></button>
                <button type="button" onClick={() => handleShare('instagram')} className="p-2 bg-gray-100 hover:bg-pink-50 hover:text-pink-600 rounded transition-colors"><Instagram size={20} /></button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
