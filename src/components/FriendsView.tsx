import React, { useState } from 'react';
import { Users, UserPlus, MessageSquare, Check, X, Key, Menu } from 'lucide-react';
import { FriendRelation, UserProfile } from '../types';

interface FriendsViewProps {
  friends: FriendRelation[];
  onSendFriendRequest: (tag: string) => Promise<{ success: boolean; error?: string }>;
  onAcceptFriendRequest: (userId: string) => Promise<void>;
  onDeclineFriendRequest: (userId: string) => Promise<void>;
  onSelectDmUser: (user: UserProfile) => void;
  onToggleMobileSidebar?: () => void;
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  friends,
  onSendFriendRequest,
  onAcceptFriendRequest,
  onDeclineFriendRequest,
  onSelectDmUser,
  onToggleMobileSidebar,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'add'>('all');
  const [friendTagInput, setFriendTagInput] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const acceptedFriends = friends.filter(f => f.status === 'accepted' && f.user);
  const pendingRequests = friends.filter(f => f.status === 'pending_received' && f.user);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!friendTagInput.trim()) return;

    setLoading(true);
    try {
      const res = await onSendFriendRequest(friendTagInput.trim());
      if (res.success) {
        setFeedback({ type: 'success', message: `Wysłano zaproszenie do ${friendTagInput}!` });
        setFriendTagInput('');
      } else {
        setFeedback({ type: 'error', message: res.error || 'Nie można wysłać zaproszenia' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Błąd wysyłania zaproszenia' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100">
      
      {/* HEADER */}
      <div className="h-14 px-4 sm:px-6 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-sm flex items-center justify-between">
        <div className="flex items-center space-x-3 truncate">
          {onToggleMobileSidebar && (
            <button
              onClick={onToggleMobileSidebar}
              className="md:hidden p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
              title="Otwórz menu"
            >
              <Menu className="w-5 h-5 text-violet-400" />
            </button>
          )}
          <Users className="w-5 h-5 text-violet-400 shrink-0" />
          <h3 className="font-bold text-sm text-white truncate hidden sm:inline">Znajomi i Relacje</h3>
        </div>

        {/* Tabs Switcher */}
        <div className="flex items-center space-x-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs font-medium">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'all' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Wszyscy ({acceptedFriends.length})
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 ${
              activeTab === 'pending' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Oczekujące</span>
            {pendingRequests.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-500 text-white font-bold">
                {pendingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1 ${
              activeTab === 'add' ? 'bg-emerald-600 text-white shadow' : 'text-emerald-400 hover:bg-emerald-500/10'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Dodaj Znajomego</span>
          </button>
        </div>
      </div>

      {/* BODY CONTENT */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        
        {/* ADD FRIEND TAB */}
        {activeTab === 'add' && (
          <div className="max-w-xl mx-auto space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div>
                <h4 className="text-base font-bold text-white flex items-center space-x-2">
                  <UserPlus className="w-5 h-5 text-emerald-400" />
                  <span>Dodaj Znajomego po Kodzie Tożsamości</span>
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Wprowadź nazwę użytkownika wraz z unikalnym kodem (np. <code>Szyfrant#1337</code>). Po zaakceptowaniu zaproszenia wymienicie się publicznymi kluczami ECDH do zaszyfrowanego czatu!
                </p>
              </div>

              {feedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium border ${
                    feedback.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-red-500/10 border-red-500/30 text-red-400'
                  }`}
                >
                  {feedback.message}
                </div>
              )}

              <form onSubmit={handleAddSubmit} className="flex space-x-3">
                <input
                  type="text"
                  required
                  value={friendTagInput}
                  onChange={(e) => setFriendTagInput(e.target.value)}
                  placeholder="np. Nazwa#1234"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-sm text-white placeholder-slate-500 font-mono"
                />
                <button
                  type="submit"
                  disabled={loading || !friendTagInput.trim()}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  {loading ? 'Wysyłanie...' : 'Wyślij Zaproszenie'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* PENDING REQUESTS TAB */}
        {activeTab === 'pending' && (
          <div className="max-w-2xl mx-auto space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Oczekujące Zaproszenia Do Znajomych ({pendingRequests.length})
            </h4>

            {pendingRequests.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 font-mono bg-slate-900/40 rounded-2xl border border-slate-800">
                Brak oczekujących zaproszeń.
              </div>
            ) : (
              pendingRequests.map(rel => {
                const friend = rel.user!;
                return (
                  <div
                    key={friend.id}
                    className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center font-bold text-violet-300">
                        {friend.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white">{friend.displayName}</div>
                        <div className="text-xs text-slate-500 font-mono">{friend.userTag}</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onAcceptFriendRequest(friend.id)}
                        className="p-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 transition-all text-xs font-semibold flex items-center space-x-1"
                      >
                        <Check className="w-4 h-4" />
                        <span>Akceptuj</span>
                      </button>
                      <button
                        onClick={() => onDeclineFriendRequest(friend.id)}
                        className="p-2 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 transition-all text-xs font-semibold flex items-center space-x-1"
                      >
                        <X className="w-4 h-4" />
                        <span>Odrzuć</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ALL FRIENDS TAB */}
        {activeTab === 'all' && (
          <div className="max-w-3xl mx-auto space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Lista Znajomych ({acceptedFriends.length})
            </h4>

            {acceptedFriends.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 font-mono bg-slate-900/40 rounded-2xl border border-slate-800">
                Brak znajomych.
              </div>
            ) : (
              acceptedFriends.map(rel => {
                const friend = rel.user!;
                const isOnline = friend.status === 'online';

                return (
                  <div
                    key={friend.id}
                    className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="relative w-11 h-11 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center font-bold text-violet-300">
                        {friend.displayName.charAt(0).toUpperCase()}
                        <span
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${
                            isOnline ? 'bg-emerald-500' : 'bg-slate-600'
                          }`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-bold text-white">{friend.displayName}</span>
                          <span className="text-[10px] text-emerald-400 font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center space-x-1">
                            <Key className="w-2.5 h-2.5" />
                            <span>ECDH P-256</span>
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 font-mono">{friend.userTag}</div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onSelectDmUser(friend)}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-violet-600 text-slate-300 hover:text-white transition-all text-xs font-semibold flex items-center space-x-1.5"
                        title="Otwórz Zaszyfrowany Czat DM"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>Napisz wiadomość</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

      </div>

    </div>
  );
};
