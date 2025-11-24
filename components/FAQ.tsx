
import React, { useState } from 'react';
import { Language, CaseType } from '../types';
import { TRANSLATIONS, BVA_LINK } from '../constants';
import { ExternalLink, Mail, BookOpen, HelpCircle, Copy, Check, X, Info } from 'lucide-react';

interface FAQProps {
  lang: Language;
  userEmail: string;
}

export const FAQ: React.FC<FAQProps> = ({ lang, userEmail }) => {
  const t = TRANSLATIONS[lang];
  
  // Email Generator State
  const [genName, setGenName] = useState('');
  const [genDob, setGenDob] = useState('');
  const [genSubDate, setGenSubDate] = useState('');
  const [genConsulate, setGenConsulate] = useState('');
  const [genResidence, setGenResidence] = useState('');
  const [genCaseType, setGenCaseType] = useState<string>(CaseType.STAG_5);

  const [generatedEmail, setGeneratedEmail] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerateEmail = () => {
      if (!genName || !genDob || !genSubDate) return;
      
      const text = `Sehr geehrte Damen und Herren,

mein Name ist ${genName}, und am ${genSubDate} habe ich alle erforderlichen Unterlagen für die Beantragung der deutschen Staatsbürgerschaft bei der ${genConsulate || 'Botschaft/Konsulat'}, eingereicht. Bisher haben wir weder eine Bestätigung als Antragsnummer noch eine Bestätigung der Anwendung erhalten. Könnten Sie mir bitte Informationen darüber geben, wie ich die Aktenzeichen erhalten und den Status meiner Bewerbung überprüfen kann?

Vollständiger Name: ${genName}
Geburtsdatum: ${genDob}
Wohnort: ${genResidence}

Es handelt sich um den Prozess der Erwerb durch Erklärung gem. ${genCaseType}

Ich danke Ihnen im Voraus für Ihre Antwort.

Mit freundlichen Grüßen,
${genName}`;
      setGeneratedEmail(text);
      setShowModal(true);
  };

  const copyToClipboard = () => {
      navigator.clipboard.writeText(generatedEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  const getDateFormatPlaceholder = () => {
    switch(lang) {
        case 'de': return 'TT.MM.JJJJ';
        case 'es': return 'DD/MM/AAAA';
        case 'it': return 'GG/MM/AAAA';
        case 'pt': return 'DD/MM/AAAA';
        default: return 'DD/MM/YYYY';
    }
  };

  const getDateFormatExample = () => {
    switch(lang) {
        case 'de': return '01.05.1990';
        case 'es': return '01/05/1990';
        case 'it': return '01/05/1990';
        case 'pt': return '01/05/1990';
        default: return '01/05/1990';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4">
      
      {/* Glossary Section */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-xl font-bold text-de-black mb-6 flex items-center gap-2">
             <BookOpen className="text-de-red" /> {t.glossary}
          </h2>
          
          <div className="space-y-6">
             <GlossaryItem 
              term="📘 StAG"
              def={t.glossaryStag}
            />
            <GlossaryItem 
                term="StAG 5 (Erklärung)"
                def={t.glossaryStag5} 
            />
            <GlossaryItem 
                term="StAG 15 (Restitution)" 
                def={t.glossaryStag15} 
            />
            <GlossaryItem 
                term="StAG 14 (Discretionary)" 
                def={t.glossaryStag14} 
            />
            <GlossaryItem 
                term="StAG 10 (Naturalization)" 
                def={t.glossaryStag10} 
            />
             <GlossaryItem 
              term="🇩🇪 BVA (Bundesverwaltungsamt)"
              def={t.glossaryBva}
            />
            <GlossaryItem 
              term="🆔 AKZ (Aktenzeichen)"
              def={t.glossaryAkz}
            >
              <div className="mt-3 p-4 bg-gray-50 rounded text-sm border-l-4 border-de-gold">
                <p className="font-bold text-de-black mb-3 text-xs uppercase tracking-wide flex items-center gap-2">
                    <Info size={14} /> Breakdown Example: ST1-2022 0501 0020-EER
                </p>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 p-2 bg-white rounded border border-gray-100 shadow-sm">
                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-de-red font-bold min-w-[60px] text-center">ST1</span>
                        <span className="text-gray-700 font-medium">Department / Team Code</span>
                    </div>
                    <div className="flex items-center gap-3 p-2 bg-white rounded border border-gray-100 shadow-sm">
                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-de-black font-bold min-w-[60px] text-center">2022</span>
                        <span className="text-gray-700 font-medium">Year of Application</span>
                    </div>
                    <div className="flex items-center gap-3 p-2 bg-white rounded border border-gray-100 shadow-sm">
                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-de-black font-bold min-w-[60px] text-center">0501</span>
                        <span className="text-gray-700 font-medium">Date Code (MMDD)</span>
                    </div>
                     <div className="flex items-center gap-3 p-2 bg-white rounded border border-gray-100 shadow-sm">
                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-de-black font-bold min-w-[60px] text-center">0020</span>
                        <span className="text-gray-700 font-medium">Sequential Number</span>
                    </div>
                     <div className="flex items-center gap-3 p-2 bg-white rounded border border-gray-100 shadow-sm">
                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-de-gold font-bold min-w-[60px] text-center">EER</span>
                        <span className="text-gray-700 font-medium">Declaration Type (e.g. Erklärungserwerb)</span>
                    </div>
                </div>
              </div>
            </GlossaryItem>
            <GlossaryItem 
              term="📜 Urkunde"
              def={t.glossaryUrkunde}
            />
            <GlossaryItem 
              term="Feststellung"
              def={t.glossaryFeststellung}
            />
            <GlossaryItem 
              term="Artikel 116 GG"
              def={t.glossaryArt116}
            />
          </div>
        </div>

        {/* AKZ Generator */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><HelpCircle size={20} /> {t.howToAskAZ}</h3>
            <p className="text-sm text-gray-700 mb-4">
                Use this tool to generate the German email text for requesting your Aktenzeichen.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500">Full Name</label>
                    <input 
                        type="text" placeholder="e.g. Juan Perez" 
                        value={genName} onChange={e => setGenName(e.target.value)}
                        className="w-full p-2 border rounded text-sm bg-white focus:ring-1 focus:ring-de-gold outline-none"
                    />
                </div>
                <div className="space-y-1">
                     <label className="text-xs font-bold text-gray-500">DOB ({getDateFormatPlaceholder()})</label>
                    <input 
                        type="text" placeholder={`e.g. ${getDateFormatExample()}`}
                        value={genDob} onChange={e => setGenDob(e.target.value)}
                        className="w-full p-2 border rounded text-sm bg-white focus:ring-1 focus:ring-de-gold outline-none"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500">Submission Date</label>
                    <input 
                        type="date" 
                        value={genSubDate} onChange={e => setGenSubDate(e.target.value)}
                        className="w-full p-2 border rounded text-sm bg-white focus:ring-1 focus:ring-de-gold outline-none"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500">Embassy/Consulate</label>
                    <input 
                        type="text" placeholder="e.g. Deutsche Botschaft Buenos Aires" 
                        value={genConsulate} onChange={e => setGenConsulate(e.target.value)}
                        className="w-full p-2 border rounded text-sm bg-white focus:ring-1 focus:ring-de-gold outline-none"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500">Residence (City, Country)</label>
                    <input 
                        type="text" placeholder="e.g. Buenos Aires, Argentina" 
                        value={genResidence} onChange={e => setGenResidence(e.target.value)}
                        className="w-full p-2 border rounded text-sm bg-white focus:ring-1 focus:ring-de-gold outline-none"
                    />
                </div>
                 <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500">Case Type</label>
                    <select
                        value={genCaseType} onChange={e => setGenCaseType(e.target.value)}
                        className="w-full p-2 border rounded text-sm bg-white focus:ring-1 focus:ring-de-gold outline-none"
                    >
                      {Object.values(CaseType).map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                </div>
            </div>
            <button 
                onClick={handleGenerateEmail}
                className="bg-de-black text-white text-sm font-bold py-2 px-4 rounded hover:bg-gray-800 transition-colors mb-4 flex items-center gap-2"
            >
                {t.generateEmail}
            </button>

            <div className="mt-4">
                 <a 
                  href="mailto:staatsangehoerigkeit@bva.bund.de" 
                  className="inline-flex items-center gap-2 text-de-red hover:underline text-sm font-bold"
                >
                    <Mail size={14} /> Email BVA (staatsangehoerigkeit@bva.bund.de)
                </a>
            </div>
        </div>
      </div>

      {/* Sidebar: External Links & Contact */}
      <div className="space-y-6">
         
         {/* Official Link */}
         <div className="bg-de-black text-white p-6 rounded-xl shadow-lg">
            <h3 className="font-bold text-de-gold mb-2 flex items-center gap-2">
                <ExternalLink size={18} /> {t.officialWebsite}
            </h3>
            <p className="text-gray-300 text-sm mb-4">
                Access official forms, leaflets, and legal information directly from the Federal Office.
            </p>
            <a 
                href={BVA_LINK} 
                target="_blank" 
                rel="noreferrer"
                className="block w-full text-center bg-white text-de-black font-bold py-2 rounded hover:bg-gray-100 transition-colors"
            >
                {t.visitBva}
            </a>
         </div>

         {/* Contact Creator (Replaced) */}
         <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-bold text-de-black mb-4 flex items-center gap-2">
                <Mail size={18} /> {t.contactOwner}
            </h3>
            <div className="mb-4 p-3 bg-blue-50 text-blue-800 text-xs rounded border border-blue-100 leading-tight flex items-start gap-2">
                <Info size={14} className="flex-shrink-0 mt-0.5" />
                Contact me for bug reports or feature requests.
            </div>
            
            <p className="text-sm text-gray-700 mb-4">
                You can reach the creator of this tracker on Reddit:
            </p>

            <a 
                href="https://www.reddit.com/user/Brilliant-Prize-7301/" 
                target="_blank" 
                rel="noreferrer"
                className="w-full bg-[#FF4500] hover:bg-[#FF5700] text-white font-bold py-3 rounded transition-colors flex items-center justify-center gap-2 text-sm shadow-sm"
            >
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>
                u/Brilliant-Prize-7301
            </a>
         </div>
      </div>

      {/* Modal for Generated Email (Unchanged logic, ensures popup) */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-in fade-in">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden">
                <div className="bg-de-black p-4 flex justify-between items-center">
                    <h3 className="text-white font-bold">Generated Email (German)</h3>
                    <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                </div>
                <div className="p-6 relative">
                    <div className="bg-gray-50 p-4 rounded border border-gray-200 font-mono text-sm text-gray-800 whitespace-pre-wrap h-64 overflow-y-auto">
                        {generatedEmail}
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                        <button 
                            onClick={() => setShowModal(false)}
                            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
                        >
                            {t.close}
                        </button>
                        <button 
                            onClick={copyToClipboard}
                            className="px-4 py-2 text-sm bg-de-gold text-de-black font-bold rounded hover:bg-yellow-400 flex items-center gap-2"
                        >
                            {copied ? <Check size={16} /> : <Copy size={16} />}
                            {copied ? t.copied : t.copyText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

const GlossaryItem: React.FC<{term: string, def: string, children?: React.ReactNode}> = ({term, def, children}) => (
    <div className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
        <h4 className="font-bold text-de-black text-md mb-1">{term}</h4>
        <p className="text-sm text-gray-700 leading-relaxed">{def}</p>
        {children}
    </div>
);
