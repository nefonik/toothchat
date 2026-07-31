import React, { useState } from 'react';
import { User, Key, Lock, Check, X } from 'lucide-react';
import { UserProfile } from '../types';

interface ProfileModalProps {
  isOpen: boolean;
  currentUser: UserProfile;
  onClose: () => void;
  onUpdateProfile: (displayName: string) => Promise<{ success: boolean; error?: string }>;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onUpdateProfile,
}) => {
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!displayName.trim() || displayName.trim().length < 2) {
      setMessage({ type: 'error', text: 'Nazwa wyświetlana musi mieć co najmniej 2 znaki' });
      return;
    }

    setLoading(true);

    try {
      const res = await onUpdateProfile(displayName.trim());
      if (res.success) {
        setMessage({ type: 'success', text: 'Zaktualizowano profil pomyślnie!' });
        setTimeout(() => onClose(), 1200);
      } else {
        setMessage({ type: 'error', text: res.error || 'Błąd aktualizacji profilu' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Nieoczekiwany błąd' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-6 shadow-2xl">
        
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-2 text-white font-bold text-base">
            <User className="w-5 h-5 text-violet-400" />
            <span>Zarządzanie Profilem Użytkownika</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {message && (
          <div
            className={`p-3 rounded-xl text-xs font-medium border ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Nazwa Wyświetlana (Display Name)
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Kod Tożsamości (Identyfikator)
            </label>
            <input
              type="text"
              disabled
              value={currentUser.userTag}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-sm text-slate-500 font-mono cursor-not-allowed"
            />
          </div>

          {/* Key Info Security Notice */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5">
            <div className="flex items-center space-x-1.5 text-emerald-400 font-semibold">
              <Key className="w-3.5 h-3.5" />
              <span>Publiczny Klucz ECDH P-256</span>
            </div>
            <p className="text-slate-400 text-[11px]">
              Zmiana nazwy wyświetlanej jest bezpieczna i zachowuje obecne pary kluczy kryptograficznych oraz zapisane znajomości.
            </p>
          </div>

          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center space-x-1"
            >
              <Check className="w-4 h-4" />
              <span>Zapisz Zmiany</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
