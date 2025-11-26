
import React from 'react';
import { X, ShieldCheck, Lock, Server, Trash2 } from 'lucide-react';
import { TRANSLATIONS } from '../constants';
import { Language } from '../types';

interface PrivacyPolicyModalProps {
  lang: Language;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ lang, onClose }) => {
  const t = TRANSLATIONS[lang];

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        
        <div className="bg-de-black p-4 flex justify-between items-center text-white">
          <h3 className="font-bold flex items-center gap-2">
            <ShieldCheck size={20} className="text-de-gold" /> {t.privacyTitle}
          </h3>
          <button onClick={onClose} className="hover:text-de-gold transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6 text-sm text-gray-700 overflow-y-auto max-h-[70vh]">
          
          <div className="bg-green-50 p-4 rounded-lg border border-green-100 text-green-900 font-medium">
            <p>{t.privacyContent}</p>
          </div>

          <div className="space-y-4">
            <div className="flex gap-3">
                <Lock className="flex-shrink-0 text-de-black mt-1" size={20} />
                <div>
                    <h4 className="font-bold text-de-black mb-1">Data Minimization</h4>
                    <p className="text-xs text-gray-600">We only ask for what is strictly necessary. We do not store passwords (we use Magic Links/OTP) and we do not ask for real names, addresses, or upload physical documents.</p>
                </div>
            </div>

            <div className="flex gap-3">
                <Server className="flex-shrink-0 text-de-black mt-1" size={20} />
                <div>
                    <h4 className="font-bold text-de-black mb-1">Secure Infrastructure</h4>
                    <p className="text-xs text-gray-600">All data is stored in Supabase, an enterprise-grade database provider with encryption at rest and in transit. We do not run our own insecure servers.</p>
                </div>
            </div>

            <div className="flex gap-3">
                <Trash2 className="flex-shrink-0 text-de-black mt-1" size={20} />
                <div>
                    <h4 className="font-bold text-de-black mb-1">Right to Erasure</h4>
                    <p className="text-xs text-gray-600">You retain full ownership of your data. If you wish to delete your account and all associated data, you can request this at any time.</p>
                </div>
            </div>
          </div>

          <div className="border-t pt-4 text-xs text-gray-500">
            <p><strong>Data Controller:</strong> Private Individual (Community Project)</p>
            <p><strong>Contact:</strong> See "Contact Creator" in the dashboard.</p>
          </div>

        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 text-right">
            <button 
                onClick={onClose}
                className="bg-de-black text-white px-4 py-2 rounded font-bold hover:bg-gray-800 transition-colors"
            >
                {t.close}
            </button>
        </div>

      </div>
    </div>
  );
};
