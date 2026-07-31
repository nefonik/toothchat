import React, { useState } from 'react';
import { 
  Shield, Code, Key, Database, Radio, Cpu, X, Copy, Check, Lock, Users, Video, Terminal
} from 'lucide-react';
import { ToothIcon } from './ToothIcon';

interface ArchitectureDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ArchitectureDocsModal: React.FC<ArchitectureDocsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'baza' | 'api' | 'crypto' | 'webrtc'>('crypto');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (code: string, label: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(label);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const dbCode = `// Mongoose MongoDB Schemas
import mongoose, { Schema } from 'mongoose';

export const UserSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  displayName: { type: String, required: true },
  userTag: { type: String, required: true, unique: true, index: true },
  ecdhPublicKey: { type: String, required: true },
  status: { type: String, enum: ['online', 'offline', 'busy'], default: 'online' },
  friends: [{
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending_sent', 'pending_received', 'accepted', 'blocked'] },
    updatedAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

// 2. Server/Group Schema
export const ServerGroupSchema = new Schema({
  name: { type: String, required: true },
  icon: { type: String },
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
    encryptedGroupKey: { type: String } // AES-GCM Channel Key encrypted per member
  }],
  channels: [{ type: Schema.Types.ObjectId, ref: 'Channel' }]
});

// 3. Channel Schema
export const ChannelSchema = new Schema({
  server: { type: Schema.Types.ObjectId, ref: 'ServerGroup', default: null },
  name: { type: String, required: true },
  type: { type: String, enum: ['text', 'voice'], required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
});

// 4. Message Schema (Zero-Knowledge Ciphertext Storage)
export const MessageSchema = new Schema({
  server: { type: Schema.Types.ObjectId, ref: 'ServerGroup' },
  channel: { type: Schema.Types.ObjectId, ref: 'Channel' },
  recipient: { type: Schema.Types.ObjectId, ref: 'User' },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: { type: String, required: true },
  ciphertext: { type: String, required: true }, // Base64 - SERWER NIE ZNA KLUCZA!
  iv: { type: String, required: true }, // Base64 Initialization Vector (12 bytes)
  keyAlgorithm: { type: String, default: 'AES-GCM-256' },
  timestamp: { type: Date, default: Date.now }
});`;

  const krok3Code = `// KROK 3: Web Crypto API E2EE Snippet (Zero-Knowledge Encryption)
// Generowanie Pary Kluczy ECDH P-256
export async function generateIdentityKeyPair(): Promise<CryptoKeyPair> {
  return await window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
}

// Wyznaczenie Wspólnego Klucza Symetrycznego AES-GCM (Diffie-Hellman Exchange)
export async function deriveSharedKey(
  myPrivateKey: CryptoKey,
  theirPublicKey: CryptoKey
): Promise<CryptoKey> {
  return await window.crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Szyfrowanie Wiadomości przed Wysyłką na WebSocket
export async function encryptText(plainText: string, key: CryptoKey) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plainText);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  return {
    ciphertext: bufferToBase64(encryptedBuffer),
    iv: bufferToBase64(iv),
  };
}`;

  const krok4Code = `// KROK 4: WebRTC Signaling & Insertable Streams E2EE
// 1. Sygnalizacja 1-on-1 (P2P Call Ringing, Offer/Answer, ICE Candidate)
socket.on('call:initiate', (data) => {
  io.to(targetSocketId).emit('call:incoming', { callerName, callType: 'video' });
});

// 2. Kanały Głosowe Grupy (Mesh Topology):
// Klient dołącza do kanału głosowego i wymienia oferty z istniejącymi uczestnikami
socket.on('voice:join', ({ channelId }) => {
  const peers = db.voiceChannels.get(channelId);
  socket.emit('voice:peers_list', peers);
  socket.to(\`voice_room_\${channelId}\`).emit('voice:peer_joined', { userId: socket.userId });
});

// 3. WebRTC Insertable Streams (Frame Crypto E2EE for Voice/Video)
// Wykorzystuje RTCRtpSender.transform do szyfrowania surowych klatek audio/wideo:
const transformStream = new TransformStream({
  async transform(frame, controller) {
    // Szyfruj surowy ładunek klatki audio/wideo kluczem AES-GCM kanału
    const encryptedData = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, channelKey, frame.data);
    frame.data = encryptedData;
    controller.enqueue(frame);
  }
});
sender.transform = transformStream;`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl h-[85vh] rounded-3xl bg-slate-900 border border-slate-800 flex flex-col shadow-2xl overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="h-16 px-6 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30">
              <ToothIcon className="w-6 h-6 text-violet-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Toothchat - Architektura i Dokumentacja</h2>
              <p className="text-xs text-slate-400">Autoryzacja Tokenowa • Szyfrowanie E2EE • WebRTC Mesh</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/60 px-6 space-x-2 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab('baza')}
            className={`py-3 px-4 border-b-2 transition-all flex items-center space-x-2 ${
              activeTab === 'baza'
                ? 'border-violet-500 text-violet-400 bg-violet-600/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Schematy MongoDB</span>
          </button>

          <button
            onClick={() => setActiveTab('api')}
            className={`py-3 px-4 border-b-2 transition-all flex items-center space-x-2 ${
              activeTab === 'api'
                ? 'border-violet-500 text-violet-400 bg-violet-600/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>API & Logika</span>
          </button>

          <button
            onClick={() => setActiveTab('crypto')}
            className={`py-3 px-4 border-b-2 transition-all flex items-center space-x-2 ${
              activeTab === 'crypto'
                ? 'border-violet-500 text-violet-400 bg-violet-600/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Kryptografia E2EE</span>
          </button>

          <button
            onClick={() => setActiveTab('webrtc')}
            className={`py-3 px-4 border-b-2 transition-all flex items-center space-x-2 ${
              activeTab === 'webrtc'
                ? 'border-violet-500 text-violet-400 bg-violet-600/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Video className="w-4 h-4" />
            <span>WebRTC Voice/Video</span>
          </button>
        </div>

        {/* Body Content Area */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          
          {activeTab === 'baza' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Database className="w-4 h-4 text-violet-400" />
                  <span>Zoptymalizowane Schematy MongoDB (Mongoose ODM)</span>
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  System bazodanowy przechowuje relacje społecznościowe, statusy znajomości oraz zaszyfrowane ładunki wiadomości (ciphertext). Serwer <strong>nigdy</strong> nie ma dostępu do kluczy deszyfrujących.
                </p>
              </div>

              <div className="relative rounded-2xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs text-slate-300">
                <button
                  onClick={() => copyToClipboard(dbCode, 'baza')}
                  className="absolute top-3 right-3 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Skopiuj Kod"
                >
                  {copiedCode === 'baza' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
                <pre className="overflow-x-auto text-emerald-400">{dbCode}</pre>
              </div>
            </div>
          )}

          {activeTab === 'api' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Users className="w-4 h-4 text-violet-400" />
                  <span>Autoryzacja Bezstanowa & Relacje Społecznościowe</span>
                </h3>
                <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-5">
                  <li><strong>Token autoryzacyjny:</strong> Klient generuje token <code>tch_sec_...</code>. Serwer przechowuje wyłącznie jego skrót SHA-256.</li>
                  <li><strong>Profil:</strong> Nazwa wyświetlana może być zmieniana w dowolnym momencie.</li>
                  <li><strong>Zaproszenia:</strong> Przesyłanie zaproszeń ze statusami oczekiwania i akceptacji.</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'crypto' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>Architektura Kryptograficzna E2EE</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <span className="font-bold text-violet-400">Komunikacja 1-on-1 (Diffie-Hellman)</span>
                    <p className="text-slate-400">
                      Użytkownicy generują parę kluczy ECDH (P-256). Po zaakceptowaniu znajomości, z klucza prywatnego nadawcy i klucza publicznego odbiorcy wyprowadzany jest wspólny klucz AES-GCM-256.
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <span className="font-bold text-cyan-400">Komunikacja Grupowa / Kanały Serwera</span>
                    <p className="text-slate-400">
                      Założyciel kanału generuje klucz symetryczny AES-GCM-256. Klucz ten jest szyfrowany kluczem publicznym każdego członka grupy.
                    </p>
                  </div>
                </div>
              </div>

              <div className="relative rounded-2xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs text-slate-300">
                <button
                  onClick={() => copyToClipboard(krok3Code, 'crypto')}
                  className="absolute top-3 right-3 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  {copiedCode === 'crypto' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
                <pre className="overflow-x-auto text-cyan-400">{krok3Code}</pre>
              </div>
            </div>
          )}

          {activeTab === 'webrtc' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Video className="w-4 h-4 text-violet-400" />
                  <span>Sygnalizacja WebRTC & Strumienie Audio/Video</span>
                </h3>
                <div className="text-xs text-slate-400 space-y-2 leading-relaxed">
                  <p>
                    <strong>A) Połączenia P2P 1-on-1:</strong> Klient wysyła sygnał <code>call:initiate</code> przez WebSocket. Następuje wymiana ofert SDP oraz ICE Candidates.
                  </p>
                  <p>
                    <strong>B) Kanały Głosowe w Grupach:</strong> Używamy topologii Mesh P2P. Każdy uczestnik utrzymuje połączenie z pozostałymi członkami pokoju, zabezpieczone przez DTLS-SRTP.
                  </p>
                </div>
              </div>

              <div className="relative rounded-2xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs text-slate-300">
                <button
                  onClick={() => copyToClipboard(krok4Code, 'webrtc')}
                  className="absolute top-3 right-3 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  {copiedCode === 'webrtc' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
                <pre className="overflow-x-auto text-violet-400">{krok4Code}</pre>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="h-14 px-6 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center space-x-1.5">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Bezpieczeństwo Potwierdzone – Zero-Knowledge Protocol</span>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold transition-all"
          >
            Zamknij Podgląd Architektury
          </button>
        </div>

      </div>
    </div>
  );
};
