import React, { useState, useEffect } from 'react';
import { Hash, X, Plus } from 'lucide-react';

interface ChannelCreateModalProps {
  isOpen: boolean;
  serverId: string | null;
  initialType?: 'text';
  onClose: () => void;
  onCreateChannel: (serverId: string, name: string, type?: 'text') => Promise<{ success: boolean; error?: string }>;
}

export const ChannelCreateModal: React.FC<ChannelCreateModalProps> = ({
  isOpen,
  serverId,
  onClose,
  onCreateChannel,
}) => {
  const [channelName, setChannelName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setChannelName('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !serverId) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!channelName.trim()) {
      setError('Wprowadź nazwę kanału');
      return;
    }

    setLoading(true);

    try {
      const res = await onCreateChannel(serverId, channelName.trim(), 'text');
      if (res.success) {
        setChannelName('');
        onClose();
      } else {
        setError(res.error || 'Błąd tworzenia kanału');
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
            <Plus className="w-5 h-5 text-violet-400" />
            <span>Stwórz Nowy Kanał Tekstowy</span>
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
              Nazwa Kanału
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-slate-500 text-sm font-bold">#</span>
              <input
                type="text"
                required
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="np. pogaduchy"
                className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none text-sm text-white placeholder-slate-500"
              />
            </div>
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
              disabled={loading || !channelName.trim()}
              className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all disabled:opacity-50"
            >
              {loading ? 'Tworzenie...' : 'Utwórz Kanał'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

