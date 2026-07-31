import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { ToothIcon } from './ToothIcon';

interface ServerCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateServer: (name: string, icon: string) => Promise<{ success: boolean; error?: string }>;
}

export const ServerCreateModal: React.FC<ServerCreateModalProps> = ({
  isOpen,
  onClose,
  onCreateServer,
}) => {
  const [serverName, setServerName] = useState('');
  const [serverIcon, setServerIcon] = useState('🦷');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const emojiOptions = ['🦷', '🛡️', '💬', '🔐', '🐉', '🚀', '🔮', '🎮', '🌐'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!serverName.trim()) {
      setError('Wprowadź nazwę serwera');
      return;
    }

    setLoading(true);

    try {
      const res = await onCreateServer(serverName.trim(), serverIcon);
      if (res.success) {
        setServerName('');
        onClose();
      } else {
        setError(res.error || 'Błąd tworzenia grupy');
      }
    } catch (err: any) {
      setError(err?.message || 'Nieoczekiwany błąd');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-6 shadow-2xl">
        
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-2 text-white font-bold text-base">
            <ToothIcon className="w-5 h-5 text-violet-400" />
            <span>Utwórz Nową Grupę</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Ikona Grupy
            </label>
            <div className="flex space-x-2 overflow-x-auto pb-1">
              {emojiOptions.map(emoji => (
                <button
                  type="button"
                  key={emoji}
                  onClick={() => setServerIcon(emoji)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all ${
                    serverIcon === emoji
                      ? 'bg-violet-600 text-white border-2 border-violet-400'
                      : 'bg-slate-950 border border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Nazwa Serwera
            </label>
            <input
              type="text"
              required
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="np. Koledzy"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none text-sm text-white placeholder-slate-500"
            />
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Stwórz własną przestrzeń do rozmów ze znajomymi.
          </p>

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
              disabled={loading || !serverName.trim()}
              className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all disabled:opacity-50"
            >
              {loading ? 'Tworzenie...' : 'Utwórz Serwer'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
