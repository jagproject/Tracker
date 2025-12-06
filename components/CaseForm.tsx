import React, { useState, useEffect, useMemo } from 'react';
import { useForm, UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CitizenshipCase, CaseType, CaseStatus, Language } from '../types';
import { COUNTRIES, TRANSLATIONS, STATUS_TRANSLATIONS } from '../constants';
import { Save, Loader2, AlertTriangle, Edit2, ChevronDown, Mail, Power, Clock, CheckCircle2, FileText, Send, UserCircle, CalendarCheck, Check, Lock, Ghost, Zap, ArrowRight, ArrowLeft } from 'lucide-react';
import { getDaysDiff, formatDateTimeToLocale, formatDuration, formatISODateToLocale, isGhostCase } from '../services/statsUtils';
import { Confetti } from './Confetti';
import { InfoTip } from './ui/InfoTip';

interface CaseFormProps {
  initialData?: CitizenshipCase;
  userEmail: string;
  fantasyName: string;
  existingNames: string[];
  lang: Language;
  avgWaitTime: number;
  onSave: (data: CitizenshipCase) => void;
  isMaintenanceMode?: boolean;
  isGuest?: boolean;
}

// Helper to check for future dates
const notInFuture = (dateStr: string | undefined | null) => {
  if (!dateStr) return true;
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return d <= today;
};

// Zod Schema Definition
const createCaseSchema = (t: any) => z.object({
  fantasyName: z.string().min(3, t.usernameShort || "Username too short").optional(),
  caseType: z.nativeEnum(CaseType),
  countryOfApplication: z.string().min(1),
  status: z.nativeEnum(CaseStatus),
  submissionDate: z.string().min(1, t.validationError).refine(notInFuture, t.validationError + " (Future date)"),
  protocolDate: z.string().optional().or(z.literal('')).refine(notInFuture, t.validationError + " (Future date)"),
  docsRequestDate: z.string().optional().or(z.literal('')).refine(notInFuture, t.validationError + " (Future date)"),
  approvalDate: z.string().optional().or(z.literal('')).refine(notInFuture, t.validationError + " (Future date)"),
  closedDate: z.string().optional().or(z.literal('')).refine(notInFuture, t.validationError + " (Future date)"),
  notes: z.string().optional(),
  notifySameDateSubmission: z.boolean().optional(),
  notifySameMonthUrkunde: z.boolean().optional(),
  notifySubmissionCohortUpdates: z.boolean().optional(),
  notifyProtocolCohortUpdates: z.boolean().optional(),
  documents: z.array(z.string()).optional()
});

type CaseFormValues = z.infer<ReturnType<typeof createCaseSchema>>;

interface CustomDateInputProps {
  label: string;
  error?: string;
  registration: UseFormRegisterReturn;
  required?: boolean;
  disabled?: boolean;
  tooltip?: string;
}

const CustomDateInput: React.FC<CustomDateInputProps> = ({ label, error, registration, required, disabled, tooltip }) => (
    <div>
        <label className="flex items-center text-xs font-bold text-de-gray uppercase mb-1">
            {label} {required && <span className="text-de-red">*</span>}
            {tooltip && <InfoTip content={tooltip} />}
        </label>
        <input
            type="date"
            disabled={disabled}
            className={`w-full rounded border ${error ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'} p-2.5 text-sm focus:ring-2 focus:ring-de-gold focus:border-de-gold outline-none transition-colors 
            ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'text-de-black hover:border-gray-400 cursor-pointer'}`}
            {...registration}
        />
        {error && <p className="text-xs text-red-500 mt-1 font-bold">{error}</p>}
    </div>
);

const VisualGapTimeline: React.FC<{ status: CaseStatus, dates: { sub?: string, proto?: string, dec?: string }, lang: Language }> = ({ status, dates, lang }) => {
  const t = TRANSLATIONS[lang];
  const today = new Date().toISOString().split('T')[0];
  
  // Calculate raw days
  const subToProtoDays = getDaysDiff(dates.sub, dates.proto || today) || 0;
  const protoToDecDays = dates.proto ? (getDaysDiff(dates.proto, dates.dec || today) || 0) : 0;

  const w1 = Math.min(10, Math.max(1, subToProtoDays / 30)); 
  const w2 = Math.min(10, Math.max(1, protoToDecDays / 30));

  const calcDurationLabel = (start?: string, end?: string) => {
      if (!start) return null;
      const target = end || today;
      const days = getDaysDiff(start, target);
      if (days === null || days < 0) return null;
      return formatDuration(days, lang);
  };

  const subToProtoLabel = calcDurationLabel(dates.sub, dates.proto);
  const protoToDecLabel = calcDurationLabel(dates.proto, dates.dec);

  const getStepColor = (isActive: boolean, isCompleted: boolean) => {
      if (isCompleted) return "bg-green-500 border-green-500 text-white";
      if (isActive) return "bg-white border-blue-500 text-blue-500 animate-pulse";
      return "bg-white border-gray-300 text-gray-300";
  };

  return (
    <div className="w-full py-8 mb-6 px-2 overflow-x-auto">
        <div className="flex items-center w-full min-w-[300px]">
            {/* Steps Rendering Code */}
            <div className="flex flex-col items-center relative z-10 group cursor-help">
                <div className={`w-10 h-10 rounded-full border-4 flex items-center justify-center transition-colors shadow-sm ${getStepColor(true, !!dates.sub)}`}>
                    <Send size={16} className={dates.sub ? "ml-0.5" : ""} />
                </div>
                <div className="absolute top-12 left-1/2 -translate-x-1/2 w-32 text-center">
                    <span className="text-[10px] font-bold uppercase text-gray-500 block">{t.stepSubmitted}</span>
                    <span className="text-xs font-bold text-de-black">{dates.sub ? formatISODateToLocale(dates.sub, lang) : '--'}</span>
                </div>
            </div>

            <div className="flex-grow h-1 mx-2 relative flex items-center justify-center transition-all duration-1000 group cursor-pointer" style={{ flexGrow: w1 }}>
                 <div className={`absolute inset-0 h-1 mt-auto mb-auto ${dates.proto ? 'bg-green-500' : 'bg-gray-200 dashed-line'}`}></div>
                 {dates.sub && (
                    <div className="z-10 bg-white px-2 py-0.5 rounded-full border border-gray-200 shadow-sm text-[10px] font-mono text-gray-500 whitespace-nowrap mb-4 group-hover:scale-110 transition-transform group-hover:bg-blue-50 group-hover:text-blue-700 group-hover:border-blue-200">
                        {subToProtoLabel || "Waiting..."}
                    </div>
                 )}
                 {/* Interactive Popup on Hover */}
                 <div className="absolute top-[-40px] opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white text-[10px] p-2 rounded pointer-events-none whitespace-nowrap z-20">
                    Average wait: ~4 months
                 </div>
            </div>

            <div className="flex flex-col items-center relative z-10 group cursor-help">
                 <div className={`w-10 h-10 rounded-full border-4 flex items-center justify-center transition-colors shadow-sm ${getStepColor(!dates.proto && !!dates.sub, !!dates.proto)}`}>
                    <FileText size={16} />
                </div>
                <div className="absolute top-12 left-1/2 -translate-x-1/2 w-32 text-center">
                    <span className="text-[10px] font-bold uppercase text-gray-500 block">{t.stepProtocol}</span>
                     {dates.proto ? (
                        <span className="text-xs font-bold text-de-black">{formatISODateToLocale(dates.proto, lang)}</span>
                     ) : (
                        <span className="text-[10px] text-gray-400 italic">Pending...</span>
                     )}
                </div>
            </div>

            <div className="flex-grow h-1 mx-2 relative flex items-center justify-center transition-all duration-1000 group cursor-pointer" style={{ flexGrow: w2 }}>
                 <div className={`absolute inset-0 h-1 mt-auto mb-auto ${dates.dec ? 'bg-green-500' : 'bg-gray-200 dashed-line'}`}></div>
                 {dates.proto && (
                    <div className="z-10 bg-white px-2 py-0.5 rounded-full border border-gray-200 shadow-sm text-[10px] font-mono text-gray-500 whitespace-nowrap mb-4 group-hover:scale-110 transition-transform group-hover:bg-blue-50 group-hover:text-blue-700 group-hover:border-blue-200">
                        {protoToDecLabel || "Processing..."}
                    </div>
                 )}
                 <div className="absolute top-[-40px] opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white text-[10px] p-2 rounded pointer-events-none whitespace-nowrap z-20">
                    Average wait: ~18 months
                 </div>
            </div>

            <div className="flex flex-col items-center relative z-10 group">
                 <div className={`w-10 h-10 rounded-full border-4 flex items-center justify-center transition-colors shadow-sm ${getStepColor(!dates.dec && !!dates.proto, !!dates.dec)}`}>
                    {status === CaseStatus.CLOSED ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                </div>
                <div className="absolute top-12 left-1/2 -translate-x-1/2 w-32 text-center">
                    <span className="text-[10px] font-bold uppercase text-gray-500 block">{t.stepDecision}</span>
                     {dates.dec ? (
                        <span className={`text-xs font-bold ${status === CaseStatus.APPROVED ? 'text-green-600' : 'text-red-500'}`}>
                            {formatISODateToLocale(dates.dec, lang)}
                        </span>
                     ) : (
                        <span className="text-[10px] text-gray-400 italic">Waiting...</span>
                     )}
                </div>
            </div>
        </div>
        <div className="h-10"></div>
         <style>{`
            .dashed-line {
                background-image: linear-gradient(to right, #ccc 50%, rgba(255,255,255,0) 0%);
                background-position: bottom;
                background-size: 10px 4px;
                background-repeat: repeat-x;
                background-color: transparent !important;
                height: 4px;
            }
        `}</style>
    </div>
  );
};

export const CaseForm: React.FC<CaseFormProps> = ({ initialData, userEmail, fantasyName, existingNames, lang, avgWaitTime, onSave, isMaintenanceMode = false, isGuest = false }) => {
  const t = TRANSLATIONS[lang];
  const statusT = STATUS_TRANSLATIONS[lang];

  const [isSaving, setIsSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [checkInSuccess, setCheckInSuccess] = useState(false);
  
  // Wizard State
  const [currentStep, setCurrentStep] = useState(1);
  const TOTAL_STEPS = 2; // Reduced from 3 to 2

  // Zod & Hook Form Setup
  const formSchema = useMemo(() => createCaseSchema(t), [t]);
  
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    trigger,
    formState: { errors }
  } = useForm<CaseFormValues>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
    defaultValues: {
        caseType: CaseType.STAG_5,
        countryOfApplication: 'Argentina',
        status: CaseStatus.SUBMITTED,
        submissionDate: new Date().toISOString().split('T')[0],
        fantasyName: fantasyName,
        notifySameDateSubmission: true,
        notifySameMonthUrkunde: true,
        notifySubmissionCohortUpdates: true,
        notifyProtocolCohortUpdates: true,
        documents: []
    }
  });

  const watchedStatus = watch('status');
  const watchedSubmissionDate = watch('submissionDate');
  const watchedProtocolDate = watch('protocolDate');
  const watchedApprovalDate = watch('approvalDate');
  const watchedClosedDate = watch('closedDate');
  const watchedFantasyName = watch('fantasyName');

  useEffect(() => {
    if (initialData) {
      reset({
        ...initialData,
        fantasyName: initialData.fantasyName || fantasyName,
        protocolDate: initialData.protocolDate || '',
        docsRequestDate: initialData.docsRequestDate || '',
        approvalDate: initialData.approvalDate || '',
        closedDate: initialData.closedDate || '',
        status: initialData.status || CaseStatus.SUBMITTED,
        documents: initialData.documents || [],
        notes: initialData.notes || '',
        caseType: initialData.caseType || CaseType.STAG_5,
        countryOfApplication: initialData.countryOfApplication || 'Argentina',
        submissionDate: initialData.submissionDate || new Date().toISOString().split('T')[0],
      });
    } else {
        setValue('fantasyName', fantasyName);
    }
  }, [initialData, fantasyName, reset, setValue]);

  const isGhost = useMemo(() => initialData ? isGhostCase(initialData) : false, [initialData]);
  const isLocked = useMemo(() => {
    if (!initialData) return false;
    if (initialData.status === CaseStatus.APPROVED && initialData.approvalDate) {
        const diff = getDaysDiff(initialData.approvalDate, new Date().toISOString());
        return diff !== null && diff >= 2;
    }
    if (initialData.status === CaseStatus.CLOSED && initialData.closedDate) {
        const diff = getDaysDiff(initialData.closedDate, new Date().toISOString());
        return diff !== null && diff >= 2;
    }
    return false;
  }, [initialData]);

  const daysElapsed = useMemo(() => {
    if (!watchedSubmissionDate) return 0;
    const end = watchedApprovalDate || watchedClosedDate || new Date().toISOString().split('T')[0];
    const diff = getDaysDiff(watchedSubmissionDate, end);
    return (diff !== null && diff > 0) ? diff : 0;
  }, [watchedSubmissionDate, watchedApprovalDate, watchedClosedDate]);

  const lastUpdateText = useMemo(() => {
    return formatDateTimeToLocale(initialData?.lastUpdated, lang);
  }, [initialData?.lastUpdated, lang]);

  const onSubmit = (data: CaseFormValues) => {
    if (isMaintenanceMode || isGuest || isLocked) return;
    
    const cleanedData = {
        ...data,
        protocolDate: data.protocolDate || undefined,
        docsRequestDate: data.docsRequestDate || undefined,
        approvalDate: data.approvalDate || undefined,
        closedDate: data.closedDate || undefined,
    };

    setIsSaving(true);
    
    if (cleanedData.status === CaseStatus.APPROVED && initialData?.status !== CaseStatus.APPROVED) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 8000); 
    }

    setTimeout(() => {
      const updatedCase: CitizenshipCase = {
        ...cleanedData as CitizenshipCase,
        id: initialData?.id || crypto.randomUUID(),
        email: userEmail,
        fantasyName: cleanedData.fantasyName || fantasyName,
        lastUpdated: new Date().toISOString()
      };
      onSave(updatedCase);
      setIsSaving(false);
    }, 800);
  };

  useEffect(() => {
      if (!watchedFantasyName) return;
      const currentStoredName = initialData?.fantasyName || fantasyName;
      const isDuplicate = existingNames.some(n => 
          n.toLowerCase() === watchedFantasyName.toLowerCase() && 
          n.toLowerCase() !== currentStoredName.toLowerCase()
      );
      if (isDuplicate) setNameError(t.usernameTaken);
      else setNameError(null);
  }, [watchedFantasyName, existingNames, initialData, fantasyName, t.usernameTaken]);

  const handleNextStep = async () => {
      let fieldsToValidate: any[] = [];
      if (currentStep === 1) fieldsToValidate = ['caseType', 'countryOfApplication', 'status'];
      // Step 2 is final step, so standard form submission handles validation
      
      const isValidStep = await trigger(fieldsToValidate);
      if (isValidStep) setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS));
  };

  const handlePrevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  const watchedDocsDate = watch('docsRequestDate');
  const showProtocol = watchedStatus !== CaseStatus.SUBMITTED || !!watchedProtocolDate;
  const showDocs = watchedStatus === CaseStatus.ADDITIONAL_DOCS || !!watchedDocsDate || watchedStatus === CaseStatus.APPROVED || watchedStatus === CaseStatus.CLOSED;
  const safeShowApproved = (watchedStatus === CaseStatus.APPROVED || !!watchedApprovalDate) && watchedStatus !== CaseStatus.CLOSED;
  const safeShowClosed = (watchedStatus === CaseStatus.CLOSED || !!watchedClosedDate) && watchedStatus !== CaseStatus.APPROVED;
  
  const inputClass = "w-full rounded border border-gray-300 bg-white p-2.5 text-sm focus:ring-2 focus:ring-de-gold focus:border-de-gold transition-colors";
  const labelClass = "flex items-center text-xs font-bold text-de-gray uppercase mb-1";

  if (isGuest) {
      return (
          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-md border border-de-gray/20 text-center flex flex-col items-center justify-center min-h-[400px]">
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-full mb-4">
                 <UserCircle size={48} className="text-gray-400" />
              </div>
              <h2 className="text-xl font-bold text-de-black dark:text-white mb-2">{t.guestRestricted}</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm">{t.guestRestrictedDesc}</p>
              
              <button 
                onClick={() => window.location.reload()} 
                className="bg-de-gold text-de-black font-bold py-3 px-6 rounded-lg hover:bg-yellow-400 transition-colors shadow-md"
              >
                  {t.guestLoginPrompt}
              </button>
          </div>
      );
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-3 sm:p-6 rounded-none sm:rounded-xl shadow-md border-y sm:border border-de-gray/20 relative mx-0 sm:mx-0 transition-colors">
      {showConfetti && <Confetti />}

      <div className="flex items-center justify-between mb-6 border-b border-gray-100 dark:border-gray-700 pb-4 relative">
        <h2 className="text-xl font-bold text-de-black dark:text-white">{t.myCase}</h2>
        
        <div className="flex flex-col items-end relative">
            <button 
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-1 mb-1 group outline-none"
            >
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider cursor-pointer group-hover:text-de-gold transition-colors">
                    {t.username}
                </span>
                <ChevronDown size={12} className={`text-gray-400 group-hover:text-de-gold transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
            </button>
            <div className="flex items-center gap-2 relative">
                 <input 
                    type="text"
                    {...register('fantasyName')}
                    className={`text-sm font-bold text-de-black bg-gray-50 border rounded px-2 py-1 w-40 text-right focus:ring-2 focus:ring-de-gold outline-none ${nameError || errors.fantasyName ? 'border-red-500 focus:ring-red-200' : 'border-gray-200'}`}
                    disabled={isLocked}
                 />
                 {!isLocked && <Edit2 size={14} className="text-gray-400 absolute right-3 pointer-events-none opacity-50" />}
            </div>
            {(nameError || errors.fantasyName) && <span className="text-[10px] text-red-500 font-bold mt-1">{nameError || errors.fantasyName?.message}</span>}
            <span className="text-[10px] text-gray-400 mt-1">
                {t.lastUpdatedLabel} {lastUpdateText}
            </span>
            {showUserMenu && (
                 <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 z-50 animate-in fade-in zoom-in-95">
                    <div className="p-3 border-b border-gray-100 bg-gray-50 rounded-t-lg">
                         <p className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
                            <Mail size={10} /> {t.registeredEmail}
                         </p>
                         <div className="flex items-start gap-2 text-gray-800 p-1">
                             <span className="text-sm font-medium break-all">{userEmail}</span>
                         </div>
                    </div>
                </div>
            )}
             {showUserMenu && <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)}></div>}
        </div>
      </div>

      <VisualGapTimeline 
        status={watchedStatus || CaseStatus.SUBMITTED} 
        dates={{
            sub: watchedSubmissionDate,
            proto: watchedProtocolDate,
            dec: watchedApprovalDate || watchedClosedDate
        }}
        lang={lang}
      />

      {/* Progress Bar for Wizard */}
      <div className="mb-6">
          <div className="flex justify-between text-xs font-bold text-gray-400 uppercase mb-2 px-1">
              <span className={currentStep >= 1 ? 'text-de-black dark:text-de-gold' : ''}>1. Basics</span>
              <span className={currentStep >= 2 ? 'text-de-black dark:text-de-gold' : ''}>2. Timeline & Comments</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-de-gold transition-all duration-300 ease-out" 
                style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
              ></div>
          </div>
      </div>

      {Object.keys(errors).length > 0 && (
        <div className="mb-4 p-3 bg-red-50 text-de-red flex items-center gap-2 rounded text-sm font-medium border border-red-100 animate-pulse">
          <AlertTriangle size={16} />
          {t.validationError}
        </div>
      )}
      
      {showConfetti && (
         <div className="mb-4 p-3 bg-green-50 text-green-700 flex items-center gap-2 rounded text-sm font-bold border border-green-100 animate-in slide-in-from-top">
            <CheckCircle2 size={16} />
            {t.celebration}
        </div>
      )}

      {isLocked && (
          <div className="mb-6 p-4 bg-gray-100 text-gray-600 rounded-lg border border-gray-300 flex items-start gap-3">
              <Lock size={20} className="flex-shrink-0 mt-0.5" />
              <div>
                  <h4 className="font-bold text-sm">Case Data Locked</h4>
                  <p className="text-xs mt-1">
                      This case was marked as Finished (Approved/Closed) over 48 hours ago. Editing is disabled.
                  </p>
              </div>
          </div>
      )}

      {isGhost && !isLocked && (
           <div className="mb-6 p-5 bg-gradient-to-r from-gray-800 to-gray-700 text-white rounded-xl shadow-lg border border-gray-600 animate-in slide-in-from-top-4">
              <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                      <div className="p-3 bg-white/10 rounded-full">
                          <Ghost size={24} className="text-gray-300" />
                      </div>
                      <div>
                          <h4 className="font-bold text-lg text-white">Ghost Mode Active</h4>
                          <p className="text-xs text-gray-300">Your case has been hidden from stats due to inactivity.</p>
                      </div>
                  </div>
              </div>
           </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className={`space-y-5 ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
        
        {/* STEP 1: BASICS */}
        {currentStep === 1 && (
            <div className="animate-in fade-in slide-in-from-right-4 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>{t.caseType} <span className="text-de-red">*</span> <InfoTip content={t.glossaryStag} /></label>
                        <select
                        {...register('caseType')}
                        className={inputClass}
                        disabled={isMaintenanceMode || isLocked}
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
                            {...register('countryOfApplication')}
                            className={inputClass}
                            disabled={isMaintenanceMode || isLocked}
                            >
                            {COUNTRIES.map(country => (
                                <option key={country} value={country}>{country}</option>
                            ))}
                            </select>
                        </div>
                    </div>
                </div>
                <div>
                    <label className={labelClass}>{t.status} <span className="text-de-red">*</span></label>
                    <select
                    {...register('status')}
                    className={inputClass}
                    disabled={isMaintenanceMode || isLocked}
                    >
                    {Object.values(CaseStatus).map(status => (
                        <option key={status} value={status}>
                            {statusT[status] || status}
                        </option>
                    ))}
                    </select>
                </div>
            </div>
        )}

        {/* STEP 2: TIMELINE & DETAILS */}
        {currentStep === 2 && (
            <div className="animate-in fade-in slide-in-from-right-4 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <CustomDateInput
                        label={t.submissionDate}
                        registration={register('submissionDate')}
                        error={errors.submissionDate?.message}
                        required
                        disabled={isMaintenanceMode || isLocked}
                    />
                    {showProtocol && (
                        <CustomDateInput
                            label={t.protocolDate}
                            registration={register('protocolDate')}
                            error={errors.protocolDate?.message}
                            disabled={isMaintenanceMode || isLocked}
                            tooltip={t.glossaryAkz}
                        />
                    )}
                </div>

                <div className="p-4 bg-gray-50 rounded border border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {showDocs && (
                        <div className="md:col-span-2">
                            <CustomDateInput
                                label={t.docsDate}
                                registration={register('docsRequestDate')}
                                error={errors.docsRequestDate?.message}
                                disabled={isMaintenanceMode || isLocked}
                            />
                        </div>
                    )}

                    {safeShowApproved && (
                        <div className="md:col-span-2 bg-green-50 p-3 rounded border border-green-100">
                            <CustomDateInput
                                label={t.approvalDate}
                                registration={register('approvalDate')}
                                error={errors.approvalDate?.message}
                                required
                                disabled={isMaintenanceMode || isLocked}
                                tooltip="The date printed on your Urkunde."
                            />
                        </div>
                    )}

                    {safeShowClosed && (
                        <div className="md:col-span-2 bg-red-50 p-3 rounded border border-red-100">
                            <CustomDateInput
                                label={t.closedDate}
                                registration={register('closedDate')}
                                error={errors.closedDate?.message}
                                required
                                disabled={isMaintenanceMode || isLocked}
                            />
                        </div>
                    )}
                </div>

                <div>
                    <label className={labelClass}>{t.comments}</label>
                    <textarea 
                        {...register('notes')}
                        className={inputClass + " h-24"}
                        placeholder="Public notes for community feed (anonymous)"
                        disabled={isMaintenanceMode || isLocked}
                    />
                </div>
            </div>
        )}
        
        {/* Navigation Buttons */}
        {!isLocked && (
            <div className="pt-4 flex gap-3">
                {currentStep > 1 && (
                    <button
                        type="button"
                        onClick={handlePrevStep}
                        className="flex-1 bg-white border border-gray-300 text-gray-700 font-bold py-3 px-4 rounded hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                    >
                        <ArrowLeft size={16} /> Back
                    </button>
                )}
                
                {currentStep < TOTAL_STEPS ? (
                    <button
                        type="button"
                        onClick={handleNextStep}
                        className="flex-1 bg-de-black hover:bg-gray-800 text-white font-bold py-3 px-4 rounded transition-colors shadow-lg flex items-center justify-center gap-2"
                    >
                        Next <ArrowRight size={16} />
                    </button>
                ) : (
                    <button
                        type="submit"
                        disabled={isSaving || !!nameError || isMaintenanceMode || Object.keys(errors).length > 0}
                        className="flex-1 bg-de-black hover:bg-gray-800 text-white font-bold py-3 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg flex items-center justify-center gap-2"
                    >
                        {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        {isSaving ? t.saving : t.save}
                    </button>
                )}
            </div>
        )}
      </form>
    </div>
  );
};