import React, { useState } from 'react';
import { Key, Copy, Check, Lock, UserCheck, ArrowRight, Sparkles } from 'lucide-react';
import { ToothIcon } from './ToothIcon';
import { generateStatelessToken, hashToken } from '../lib/crypto';

interface AuthModalProps {
  onRegister: (token: string, displayName: string) => Promise<{ success: boolean; error?: string }>;
  onLogin: (token: string) => Promise<{ success: boolean; error?: string }>;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onRegister, onLogin }) => {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [displayName, setDisplayName] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerateNewToken = () => {
    const newToken = generateStatelessToken();
    setGeneratedToken(newToken);
  };

  const handleCopyToken = () => {
    if (generatedToken) {
      navigator.clipboard.writeText(generatedToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSubmitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!displayName.trim()) {
      setError('Wprowadź swoją nazwę wyświetlaną');
      return;
    }

    const tokenToUse = generatedToken || generateStatelessToken();
    setLoading(true);

    try {
      const res = await onRegister(tokenToUse, displayName.trim());
      if (!res.success) {
        setError(res.error || 'Błąd rejestracji');
      }
    } catch (err: any) {
      setError(err?.message || 'Nieoczekiwany błąd rejestracji');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!tokenInput.trim()) {
      setError('Wprowadź swój token autoryzacyjny');
      return;
    }

    setLoading(true);

    try {
      const res = await onLogin(tokenInput.trim());
      if (!res.success) {
        setError(res.error || 'Nieprawidłowy token autoryzacyjny');
      }
    } catch (err: any) {
      setError(err?.message || 'Błąd logowania');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-8 text-slate-100">
        
        {/* Header Title */}
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30">
            <ToothIcon className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">Toothchat</h2>
            <p className="text-xs text-slate-400">Bezpieczny komunikator E2EE z autoryzacją tokenową</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl border border-slate-800/80 mb-6 text-sm font-medium">
          <button
            onClick={() => { setMode('register'); setError(null); if (!generatedToken) handleGenerateNewToken(); }}
            className={`py-2 rounded-lg transition-all ${
              mode === 'register'
                ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Nowe Konto
          </button>
          <button
            onClick={() => { setMode('login'); setError(null); }}
            className={`py-2 rounded-lg transition-all ${
              mode === 'login'
                ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Zaloguj Tokenem
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
            {error}
          </div>
        )}

        {/* REGISTER FORM */}
        {mode === 'register' && (
          <form onSubmit={handleSubmitRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Nazwa Wyświetlana (Display Name)
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="np. Szyfrant, Alice, Bob..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none text-sm text-white placeholder-slate-500"
              />
            </div>

            {/* Generated Token Box */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Twój Unikalny Token Kryptograficzny
                </label>
                <button
                  type="button"
                  onClick={handleGenerateNewToken}
                  className="text-[11px] text-violet-400 hover:underline flex items-center space-x-1"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Wygeneruj Nowy</span>
                </button>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between space-x-2">
                <code className="text-xs text-emerald-400 font-mono truncate select-all">
                  {generatedToken || 'Generowanie...'}
                </code>
                <button
                  type="button"
                  onClick={handleCopyToken}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Skopiuj Token"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400 leading-relaxed">
                <Lock className="w-3 h-3 inline mr-1 text-violet-400" />
                <strong>Ważne:</strong> Serwer przechowuje wyłącznie <u>SHA-256 Hash</u> tego tokenu. Zapamiętaj lub skopiuj ten token – to twój jedyny klucz dostępu!
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-medium text-sm flex items-center justify-center space-x-2 shadow-lg shadow-violet-600/25 transition-all disabled:opacity-50"
            >
              {loading ? (
                <span>Inicjalizacja Kluczy E2EE...</span>
              ) : (
                <>
                  <span>Utwórz Konto i Wygeneruj Klucze</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* LOGIN FORM */}
        {mode === 'login' && (
          <form onSubmit={handleSubmitLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Token lub Nazwa Użytkownika
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="np. nefon lub twój token ath_sec_..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none text-sm text-emerald-400 font-mono placeholder-slate-600"
                />
                <Key className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              </div>
            </div>

            <p className="text-xs text-slate-400">
              Wpisz swoją nazwę użytkownika (np. <strong>nefon</strong>) lub skopiowany token. System bezpiecznie połączy Cię z Twoim kontem w MongoDB Atlas.
            </p>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm flex items-center justify-center space-x-2 shadow-lg shadow-violet-600/25 transition-all disabled:opacity-50"
            >
              {loading ? (
                <span>Weryfikacja Tokena...</span>
              ) : (
                <>
                  <UserCheck className="w-4 h-4" />
                  <span>Zaloguj do Komunikatora</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Multi-Tab Simulation Notice */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 text-center">
          <p className="text-[11px] text-slate-400">
            💡 <strong>Porada do testów:</strong> Otwórz drugą kartę przeglądarki w trybie incognito lub wygeneruj drugi token, aby przetestować rozmowę P2P i połączenie głosowe/wideo w czasie rzeczywistym!
          </p>
        </div>

      </div>
    </div>
  );
};
