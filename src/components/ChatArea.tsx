import React, { useState, useEffect, useRef } from 'react';
import { Send, Lock, ShieldCheck, Eye, EyeOff, Hash, User, Code, Info, Menu } from 'lucide-react';
import { EncryptedMessage, UserProfile } from '../types';

interface DecryptedDisplayMessage extends EncryptedMessage {
  plaintext?: string;
  decryptionFailed?: boolean;
}

interface ChatAreaProps {
  channelName?: string;
  dmRecipient?: UserProfile;
  messages: DecryptedDisplayMessage[];
  onSendMessage: (text: string) => Promise<void>;
  onOpenDocsModal: () => void;
  onToggleMobileSidebar?: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  channelName,
  dmRecipient,
  messages,
  onSendMessage,
  onOpenDocsModal,
  onToggleMobileSidebar,
}) => {
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [inspectMessageId, setInspectMessageId] = useState<string | null>(null);
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

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100">
      
      {/* CHAT HEADER */}
      <div className="h-14 px-4 sm:px-6 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-sm flex items-center justify-between">
        <div className="flex items-center space-x-3">
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
              {channelName ? 'Kanał dyskusyjny' : 'Prywatna konwersacja'}
            </p>
          </div>
        </div>
      </div>

      {/* MESSAGES LIST */}
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 no-scrollbar">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-500">
            Napisz pierwszą wiadomość...
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
                      E2EE
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
                          <span>Ładunek Serwera (Server Storage State)</span>
                        </span>
                        <span className="text-[10px] text-slate-500">Algorytm: {msg.keyAlgorithm}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Ciphertext (Base64):</span>
                        <div className="p-1.5 rounded bg-slate-900 text-emerald-400 break-all select-all font-mono text-[10px]">
                          {msg.ciphertext}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">IV Vector (Base64):</span>
                        <div className="p-1 rounded bg-slate-900 text-cyan-400 break-all select-all font-mono text-[10px]">
                          {msg.iv}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Inspect Button */}
                <button
                  onClick={() => setInspectMessageId(isInspected ? null : msg.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all text-[10px] flex items-center space-x-1 h-fit"
                  title="Sprawdź nieczytelny szyfrogram na serwerze"
                >
                  {isInspected ? <EyeOff className="w-3.5 h-3.5 text-violet-400" /> : <Eye className="w-3.5 h-3.5" />}
                  <span className="hidden md:inline">{isInspected ? 'Ukryj Szyfrogram' : 'Pokaż Szyfrogram'}</span>
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
            placeholder={`Napisz zaszyfrowaną wiadomość do ${titleText}...`}
            className="w-full pl-4 pr-12 py-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none text-sm text-slate-100 placeholder-slate-500"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || sending}
            className="absolute right-2 p-2 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white transition-all disabled:opacity-40 disabled:hover:bg-violet-600"
            title="Szyfruj i Wyślij"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>

    </div>
  );
};
