import React, { useState, useEffect, useRef } from 'react';
import { Send, Eye, EyeOff, Hash, Users, Code, Menu, MessageSquare, UserPlus, X, Search } from 'lucide-react';
import { EncryptedMessage, UserProfile } from '../types';

interface DecryptedDisplayMessage extends EncryptedMessage {
  plaintext?: string;
  decryptionFailed?: boolean;
}

interface ChatAreaProps {
  channelName?: string;
  dmRecipient?: UserProfile;
  messages: DecryptedDisplayMessage[];
  allMembers?: UserProfile[];
  currentUserId?: string;
  onSendMessage: (text: string) => Promise<void>;
  onSelectDmUser?: (user: UserProfile) => void;
  onAddFriend?: (tag: string) => void;
  onOpenDocsModal: () => void;
  onToggleMobileSidebar?: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  channelName,
  dmRecipient,
  messages,
  allMembers = [],
  currentUserId,
  onSendMessage,
  onSelectDmUser,
  onAddFriend,
  onOpenDocsModal,
  onToggleMobileSidebar,
}) => {
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [inspectMessageId, setInspectMessageId] = useState<string | null>(null);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || sending) return;

    const textToSend = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      await onSendMessage(textToSend);
    } catch (err) {
      console.error('Failed to send encrypted message:', err);
    } finally {
      setSending(false);
    }
  };

  const titleText = channelName ? `# ${channelName}` : dmRecipient ? `@ ${dmRecipient.displayName}` : 'Czat';

  const onlineMembers = allMembers.filter(m => m.status === 'online');
  const offlineMembers = allMembers.filter(m => m.status !== 'online');

  const filteredMembers = allMembers.filter(m => {
    if (!memberSearch.trim()) return true;
    const q = memberSearch.toLowerCase();
    return (
      (m.displayName && m.displayName.toLowerCase().includes(q)) ||
      (m.userTag && m.userTag.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex-1 flex h-full bg-slate-950 text-slate-100 overflow-hidden">
      
      {/* MAIN CHAT COLUMN */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        
        {/* CHAT HEADER */}
        <div className="h-14 px-4 sm:px-6 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-sm flex items-center justify-between">
          <div className="flex items-center space-x-3 truncate">
            {onToggleMobileSidebar && (
              <button
                onClick={onToggleMobileSidebar}
                className="md:hidden p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
                title="Otwórz menu kanałów i serwerów"
              >
                <Menu className="w-5 h-5 text-violet-400" />
              </button>
            )}
            {channelName ? (
              <Hash className="w-5 h-5 text-violet-400 shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center font-bold text-violet-300 text-xs shrink-0">
                {dmRecipient?.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="truncate">
              <h3 className="font-bold text-sm text-white flex items-center space-x-2 truncate">
                <span className="truncate">{titleText}</span>
              </h3>
              <p className="text-[11px] text-slate-400 truncate">
                {channelName ? 'Główny kanał społeczności (E2EE + MongoDB Atlas)' : 'Prywatna konwersacja bezpośrednia'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => setShowMembersPanel(prev => !prev)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                showMembersPanel
                  ? 'bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-600/20'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
              }`}
              title="Pokaż/Ukryj listę użytkowników"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Uczestnicy</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] font-mono">
                {allMembers.length}
              </span>
            </button>
          </div>
        </div>

        {/* MESSAGES LIST */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 no-scrollbar">
          {messages.length === 0 ? (
            <div className="text-center py-16 space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto text-violet-300 font-bold text-xl">
                🦷
              </div>
              <p className="text-sm font-semibold text-slate-300">Witaj na czacie!</p>
              <p className="text-xs text-slate-500">
                Napisz pierwszą wiadomość poniżej. Wszystkie wiadomości są trwale zapisywane w bazie MongoDB Atlas i synchronizowane na żywo!
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isInspected = inspectMessageId === msg.id;

              return (
                <div
                  key={msg.id}
                  className="group relative flex space-x-3 p-2 rounded-xl hover:bg-slate-900/40 transition-all"
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center font-bold text-violet-300 text-xs flex-shrink-0">
                    {(msg.senderName || 'Użytkownik').charAt(0).toUpperCase()}
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-slate-200">{msg.senderName || 'Użytkownik'}</span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-[10px] text-emerald-400/80 font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20">
                        Atlas E2EE
                      </span>
                    </div>

                    {/* Decrypted Plaintext message or decryption error */}
                    <div className="mt-1 text-sm text-slate-100 leading-relaxed break-words">
                      {msg.decryptionFailed ? (
                        <span className="text-red-400 italic text-xs">
                          ⚠️ [Nie można odszyfrować wiadomości – brak klucza wspólnego]
                        </span>
                      ) : (
                        msg.plaintext || msg.text || msg.ciphertext || <span className="text-slate-500 italic">Brak treści</span>
                      )}
                    </div>

                    {/* RAW CIPHERTEXT INSPECTION DRAWER */}
                    {isInspected && (
                      <div className="mt-3 p-3 rounded-xl bg-slate-950 border border-violet-500/30 font-mono text-[11px] text-slate-300 space-y-1.5 shadow-xl">
                        <div className="flex items-center justify-between text-violet-400 font-semibold border-b border-slate-800/80 pb-1">
                          <span className="flex items-center space-x-1">
                            <Code className="w-3.5 h-3.5" />
                            <span>Ładunek w MongoDB Atlas</span>
                          </span>
                          <span className="text-[10px] text-slate-500">Algorytm: {msg.keyAlgorithm}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Tekst / Szyfrogram:</span>
                          <div className="p-1.5 rounded bg-slate-900 text-emerald-400 break-all select-all font-mono text-[10px]">
                            {msg.ciphertext || msg.text}
                          </div>
                        </div>
                        {msg.iv && (
                          <div>
                            <span className="text-slate-500">Wektor IV (Base64):</span>
                            <div className="p-1 rounded bg-slate-900 text-cyan-400 break-all select-all font-mono text-[10px]">
                              {msg.iv}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Inspect Button */}
                  <button
                    onClick={() => setInspectMessageId(isInspected ? null : msg.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all text-[10px] flex items-center space-x-1 h-fit"
                    title="Sprawdź stan zapisu w bazie danych"
                  >
                    {isInspected ? <EyeOff className="w-3.5 h-3.5 text-violet-400" /> : <Eye className="w-3.5 h-3.5" />}
                    <span className="hidden md:inline">{isInspected ? 'Ukryj dane' : 'Pokaż dane'}</span>
                  </button>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* CHAT INPUT FORM */}
        <form onSubmit={handleSend} className="p-4 border-t border-slate-800/80 bg-slate-900/40">
          <div className="relative flex items-center">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Napisz wiadomość do ${titleText}...`}
              className="w-full pl-4 pr-12 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none text-sm text-slate-100 placeholder-slate-500"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || sending}
              className="absolute right-2 p-2 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white transition-all disabled:opacity-40 disabled:hover:bg-violet-600 shadow-md shadow-violet-600/30"
              title="Wyślij wiadomość do Atlas i uczestników"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>

      </div>

      {/* MEMBERS RIGHT DRAWER / SIDEBAR */}
      {showMembersPanel && (
        <div className="w-64 border-l border-slate-800/80 bg-slate-900/90 flex flex-col h-full shrink-0">
          <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2 font-bold text-xs text-white">
              <Users className="w-4 h-4 text-violet-400" />
              <span>Uczestnicy ({allMembers.length})</span>
            </div>
            <button
              onClick={() => setShowMembersPanel(false)}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-2 border-b border-slate-800/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Szukaj uczestnika..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="w-full pl-8 pr-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div className="flex-1 p-2 overflow-y-auto space-y-3">
            {/* ONLINE MEMBERS */}
            <div>
              <div className="px-2 mb-1 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                Dostępni — {filteredMembers.filter(m => m.status === 'online').length}
              </div>
              <div className="space-y-1">
                {filteredMembers.filter(m => m.status === 'online').map(member => (
                  <div
                    key={member.id}
                    className="p-2 rounded-xl bg-slate-950/40 hover:bg-slate-800/80 border border-transparent hover:border-slate-700 transition-all flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <div className="relative w-7 h-7 rounded-full bg-violet-600/30 border border-violet-500/40 flex items-center justify-center font-bold text-violet-300 text-xs shrink-0">
                        {member.displayName.charAt(0).toUpperCase()}
                        <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 border border-slate-950" />
                      </div>
                      <div className="truncate min-w-0">
                        <div className="text-xs font-semibold text-slate-200 truncate">
                          {member.displayName}
                          {member.id === currentUserId && <span className="text-[10px] text-violet-400 ml-1">(Ty)</span>}
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono truncate">{member.userTag}</div>
                      </div>
                    </div>

                    {member.id !== currentUserId && onSelectDmUser && (
                      <button
                        onClick={() => onSelectDmUser(member)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-all"
                        title="Napisz prywatną wiadomość (DM)"
                      >
                        <MessageSquare className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* OFFLINE MEMBERS */}
            <div>
              <div className="px-2 mb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Niedostępni — {filteredMembers.filter(m => m.status !== 'online').length}
              </div>
              <div className="space-y-1">
                {filteredMembers.filter(m => m.status !== 'online').map(member => (
                  <div
                    key={member.id}
                    className="p-2 rounded-xl hover:bg-slate-800/50 transition-all flex items-center justify-between group opacity-75 hover:opacity-100"
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <div className="relative w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-400 text-xs shrink-0">
                        {member.displayName.charAt(0).toUpperCase()}
                        <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-slate-600 border border-slate-950" />
                      </div>
                      <div className="truncate min-w-0">
                        <div className="text-xs font-semibold text-slate-300 truncate">
                          {member.displayName}
                          {member.id === currentUserId && <span className="text-[10px] text-violet-400 ml-1">(Ty)</span>}
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono truncate">{member.userTag}</div>
                      </div>
                    </div>

                    {member.id !== currentUserId && onSelectDmUser && (
                      <button
                        onClick={() => onSelectDmUser(member)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-slate-800 hover:bg-violet-600 text-slate-300 hover:text-white transition-all"
                        title="Napisz wiadomość"
                      >
                        <MessageSquare className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
