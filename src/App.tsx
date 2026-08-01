import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  UserProfile, ServerGroup, Channel, FriendRelation, EncryptedMessage, VoiceParticipant 
} from './types';
import { 
  generateIdentityKeyPair, exportPublicKeyJwk, importPublicKeyJwk, exportPrivateKeyJwk, 
  importPrivateKeyJwk, deriveSharedKey, generateGroupChannelKey, encryptText, decryptText, hashToken 
} from './lib/crypto';
import { AuthModal } from './components/AuthModal';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { VoiceChannelArea } from './components/VoiceChannelArea';
import { DirectCallOverlay } from './components/DirectCallOverlay';
import { FriendsView } from './components/FriendsView';
import { ServerCreateModal } from './components/ServerCreateModal';
import { ChannelCreateModal } from './components/ChannelCreateModal';
import { ProfileModal } from './components/ProfileModal';
import { ArchitectureDocsModal } from './components/ArchitectureDocsModal';

// Helper for synthetic media stream fallback in restricted iframe/browser environments
async function getMediaStream(audio: boolean, video: boolean): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio, video });
  } catch (err) {
    console.warn('Using synthetic canvas stream fallback for WebRTC:', err);
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d')!;

    let angle = 0;
    const draw = () => {
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, 640, 480);

      // Animated wave pattern
      ctx.fillStyle = 'rgba(139, 92, 246, 0.15)';
      ctx.beginPath();
      ctx.arc(320 + Math.cos(angle) * 30, 240 + Math.sin(angle) * 20, 120, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#a78bfa';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🦷 Toothchat Stream', 320, 230);

      ctx.fillStyle = '#34d399';
      ctx.font = '14px monospace';
      ctx.fillText('Połączenie Wideo Aktywne', 320, 270);

      angle += 0.05;
      requestAnimationFrame(draw);
    };
    draw();

    const stream = canvas.captureStream(30);

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.001;
      const dst = audioCtx.createMediaStreamDestination();
      osc.connect(gain);
      gain.connect(dst);
      osc.start();
      const audioTrack = dst.stream.getAudioTracks()[0];
      if (audioTrack) {
        stream.addTrack(audioTrack);
      }
    } catch (e) {
      console.warn('Audio synth failed:', e);
    }

    return stream;
  }
}

export default function App() {
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem('toothchat_token') || localStorage.getItem('aether_token'));
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [identityKeyPair, setIdentityKeyPair] = useState<CryptoKeyPair | null>(null);

  const [servers, setServers] = useState<ServerGroup[]>([]);
  const [friends, setFriends] = useState<FriendRelation[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>('srv_general_01');
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [activeDmUser, setActiveDmUser] = useState<UserProfile | null>(null);
  const [isFriendsTabOpen, setIsFriendsTabOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const [isCreateServerModalOpen, setIsCreateServerModalOpen] = useState(false);
  const [isCreateChannelModalOpen, setIsCreateChannelModalOpen] = useState(false);
  const [createChannelServerId, setCreateChannelServerId] = useState<string | null>(null);
  const [createChannelInitialType, setCreateChannelInitialType] = useState<'text' | 'voice'>('text');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);

  const handleOpenCreateChannelModal = (serverId: string, type: 'text' | 'voice') => {
    setCreateChannelServerId(serverId);
    setCreateChannelInitialType(type);
    setIsCreateChannelModalOpen(true);
  };

  const [messages, setMessages] = useState<(EncryptedMessage & { plaintext?: string; decryptionFailed?: boolean })[]>([]);
  const derivedKeysRef = useRef<Map<string, CryptoKey>>(new Map());

  const socketRef = useRef<Socket | null>(null);

  const [incomingCall, setIncomingCall] = useState<{ callerId: string; callerName: string; callerTag: string; callType: 'audio' | 'video' } | null>(null);
  const [activeCallPeerName, setActiveCallPeerName] = useState<string | null>(null);
  const [callPeerId, setCallPeerId] = useState<string | null>(null);
  const [callLocalStream, setCallLocalStream] = useState<MediaStream | null>(null);
  const [callRemoteStream, setCallRemoteStream] = useState<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const [activeVoiceChannelId, setActiveVoiceChannelId] = useState<string | null>(null);
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipant[]>([]);
  const [voiceLocalStream, setVoiceLocalStream] = useState<MediaStream | null>(null);
  const voiceRemoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const voicePeerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [voiceStreamUpdateTrigger, setVoiceStreamUpdateTrigger] = useState(0);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  useEffect(() => {
    async function initKeys() {
      if (!identityKeyPair) {
        const storedPrivKeyJwk = localStorage.getItem('toothchat_priv_key') || localStorage.getItem('aether_priv_key');
        if (storedPrivKeyJwk) {
          try {
            const privKey = await importPrivateKeyJwk(storedPrivKeyJwk);
            const newPair = await generateIdentityKeyPair();
            setIdentityKeyPair({ privateKey: privKey, publicKey: newPair.publicKey });
            return;
          } catch (e) {
            console.warn('Failed to restore saved private key, generating new pair:', e);
          }
        }
        const keyPair = await generateIdentityKeyPair();
        setIdentityKeyPair(keyPair);
        const privJwk = await exportPrivateKeyJwk(keyPair.privateKey);
        localStorage.setItem('toothchat_priv_key', privJwk);
      }
    }

    initKeys();
  }, [authToken]);

  useEffect(() => {
    if (!authToken || !identityKeyPair) return;

    // Connect Socket.io
    const socket = io({
      auth: { token: authToken },
    });
    socketRef.current = socket;

    socket.on('auth:state', async (data: { user: UserProfile; friends: FriendRelation[]; servers: ServerGroup[] }) => {
      setCurrentUser(data.user);
      setFriends(data.friends);
      setServers(data.servers);

      // Set default initial channel if needed
      if (data.servers.length > 0 && !activeChannel) {
        const genServer = data.servers.find(s => s.id === 'srv_general_01') || data.servers[0];
        if (genServer.channels.length > 0) {
          setActiveChannel(genServer.channels[0]);
        }
      }
    });

    socket.on('user:presence', (data: { userId: string; status: string }) => {
      setFriends(prev => prev.map(f => {
        if (f.userId === data.userId && f.user) {
          return { ...f, user: { ...f.user, status: data.status as any } };
        }
        return f;
      }));
    });

    // Handle Incoming Direct Message (E2EE)
    const handleIncomingMessage = async (msg: EncryptedMessage) => {
      // Decrypt message using stored/derived key
      const decryptedMsg = await processDecryption(msg);
      setMessages(prev => [...prev, decryptedMsg]);
    };

    // 1-on-1 Call Signaling Events
    socket.on('call:incoming', (data: { callerId: string; callerName: string; callerTag: string; callType: 'audio' | 'video' }) => {
      setIncomingCall(data);
    });

    socket.on('call:answered', async (data: { responderId: string; accepted: boolean }) => {
      if (!data.accepted) {
        alert('Połączenie zostało odrzucone przez rozmówcę.');
        cleanupDirectCall();
        return;
      }
      // Peer accepted call! Send WebRTC Offer
      await createDirectCallOffer(data.responderId);
    });

    socket.on('call:signal', async (data: { senderId: string; sdp?: any; candidate?: any; type: string }) => {
      if (data.sdp && peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === 'offer') {
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          socket.emit('call:signal', { targetUserId: data.senderId, sdp: answer, type: 'answer' });
        }
      } else if (data.candidate && peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    socket.on('call:hangup', () => {
      cleanupDirectCall();
    });

    // Voice Channel Signaling Events
    socket.on('voice:user_joined', async (data: { userId: string; displayName: string; isMuted: boolean; isVideoOn: boolean }) => {
      setVoiceParticipants(prev => [...prev.filter(p => p.userId !== data.userId), {
        userId: data.userId,
        displayName: data.displayName,
        isMuted: data.isMuted,
        isDeafened: false,
        isVideoOn: data.isVideoOn,
        isScreenSharing: false,
        joinedAt: new Date().toISOString(),
      }]);

      // Create peer connection to new participant
      if (activeVoiceChannelId) {
        await initiateVoicePeerConnection(data.userId, activeVoiceChannelId, true);
      }
    });

    socket.on('voice:signal', async (data: { senderId: string; channelId: string; sdp?: any; candidate?: any }) => {
      let pc = voicePeerConnectionsRef.current.get(data.senderId);
      if (!pc && activeVoiceChannelId) {
        pc = await initiateVoicePeerConnection(data.senderId, activeVoiceChannelId, false);
      }

      if (data.sdp && pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('voice:signal', { targetUserId: data.senderId, channelId: data.channelId, sdp: answer });
        }
      } else if (data.candidate && pc) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    socket.on('voice:peer_state_changed', (data: { userId: string; isMuted: boolean; isVideoOn: boolean }) => {
      setVoiceParticipants(prev => prev.map(p => {
        if (p.userId === data.userId) {
          return { ...p, isMuted: data.isMuted, isVideoOn: data.isVideoOn };
        }
        return p;
      }));
    });

    socket.on('voice:user_left', (data: { userId: string }) => {
      setVoiceParticipants(prev => prev.filter(p => p.userId !== data.userId));
      const pc = voicePeerConnectionsRef.current.get(data.userId);
      if (pc) {
        pc.close();
        voicePeerConnectionsRef.current.delete(data.userId);
      }
      voiceRemoteStreamsRef.current.delete(data.userId);
      setVoiceStreamUpdateTrigger(n => n + 1);
    });

    return () => {
      socket.disconnect();
    };
  }, [authToken, identityKeyPair]);

  // Load chat history when active channel or DM changes
  useEffect(() => {
    if (!socketRef.current || !socketRef.current.connected) return;

    setMessages([]);

    if (activeChannel) {
      socketRef.current.emit('chat:get_history', { channelId: activeChannel.id }, async (res: any) => {
        if (res.success && res.history) {
          const decryptedList = await Promise.all(res.history.map((m: EncryptedMessage) => processDecryption(m)));
          setMessages(decryptedList);
        }
      });

      // Listen for channel broadcasts
      socketRef.current.off(`chat:channel:${activeChannel.id}`);
      socketRef.current.on(`chat:channel:${activeChannel.id}`, async (msg: EncryptedMessage) => {
        const decryptedMsg = await processDecryption(msg);
        setMessages(prev => [...prev, decryptedMsg]);
      });
    } else if (activeDmUser) {
      socketRef.current.emit('chat:get_history', { recipientId: activeDmUser.id }, async (res: any) => {
        if (res.success && res.history) {
          const decryptedList = await Promise.all(res.history.map((m: EncryptedMessage) => processDecryption(m)));
          setMessages(decryptedList);
        }
      });

      socketRef.current.off(`chat:dm:${activeDmUser.id}`);
      socketRef.current.on(`chat:dm:${activeDmUser.id}`, async (msg: EncryptedMessage) => {
        const decryptedMsg = await processDecryption(msg);
        setMessages(prev => [...prev, decryptedMsg]);
      });
    }
  }, [activeChannel, activeDmUser]);

  // DECRYPTION HELPER USING AES-GCM
  const processDecryption = async (msg: EncryptedMessage): Promise<EncryptedMessage & { plaintext?: string; decryptionFailed?: boolean }> => {
    try {
      if (!identityKeyPair) return { ...msg, decryptionFailed: true };

      // Case A: Group/Channel Message (Uses Channel Symmetric Key or fallback Shared Key)
      let aesKey = derivedKeysRef.current.get(msg.channelId || msg.serverId || msg.senderId);

      if (!aesKey) {
        // Derive shared key with sender if sender's public key exists
        const senderUser = friends.find(f => f.userId === msg.senderId)?.user;
        if (senderUser?.ecdhPublicKeyJwk) {
          const senderPubKey = await importPublicKeyJwk(senderUser.ecdhPublicKeyJwk);
          aesKey = await deriveSharedKey(identityKeyPair.privateKey, senderPubKey);
          derivedKeysRef.current.set(msg.senderId, aesKey);
        } else {
          // Fallback group channel key generated for session
          aesKey = await generateGroupChannelKey();
          derivedKeysRef.current.set(msg.channelId || 'group_fallback', aesKey);
        }
      }

      const plaintext = await decryptText(msg.ciphertext, msg.iv, aesKey);
      return { ...msg, plaintext };
    } catch (err) {
      console.warn('Decryption failed for message ID:', msg.id, err);
      return { ...msg, decryptionFailed: true };
    }
  };

  // HELPER FOR TEMP AUTH SOCKET EMITS
  const sendTempAuthEmit = (event: string, payload: any): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const socket = io({ auth: { token: '' }, timeout: 8000, reconnection: false });
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          socket.disconnect();
          resolve({ success: false, error: 'Przekroczono czas oczekiwania na połączenie z serwerem.' });
        }
      }, 8000);

      socket.on('connect_error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          socket.disconnect();
          resolve({ success: false, error: 'Błąd połączenia z serwerem: ' + (err?.message || 'Nie połączono') });
        }
      });

      const doEmit = () => {
        socket.emit(event, payload, (res: any) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            socket.disconnect();
            if (res?.success) {
              resolve({ success: true });
            } else {
              resolve({ success: false, error: res?.error || 'Błąd operacji autoryzacji' });
            }
          }
        });
      };

      if (socket.connected) {
        doEmit();
      } else {
        socket.once('connect', doEmit);
      }
    });
  };

  // HANDLERS FOR AUTHENTICATION
  const handleRegister = async (token: string, displayName: string) => {
    try {
      let pair = identityKeyPair;
      if (!pair) {
        pair = await generateIdentityKeyPair();
        setIdentityKeyPair(pair);
        try {
          const privJwk = await exportPrivateKeyJwk(pair.privateKey);
          localStorage.setItem('toothchat_priv_key', privJwk);
        } catch (e) {
          console.warn('Failed to save private key:', e);
        }
      }
      const pubJwk = await exportPublicKeyJwk(pair.publicKey);

      const res = await sendTempAuthEmit('auth:register', { token, displayName, ecdhPublicKeyJwk: pubJwk });
      if (res.success) {
        localStorage.setItem('toothchat_token', token);
        setAuthToken(token);
      }
      return res;
    } catch (err: any) {
      console.error('Registration error:', err);
      return { success: false, error: err?.message || 'Błąd inicjalizacji kluczy E2EE' };
    }
  };

  const handleLogin = async (token: string) => {
    try {
      const res = await sendTempAuthEmit('auth:login', { token });
      if (res.success) {
        localStorage.setItem('toothchat_token', token);
        setAuthToken(token);
      }
      return res;
    } catch (err: any) {
      console.error('Login error:', err);
      return { success: false, error: err?.message || 'Błąd logowania' };
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('toothchat_token');
    localStorage.removeItem('toothchat_priv_key');
    localStorage.removeItem('aether_token');
    localStorage.removeItem('aether_priv_key');
    setAuthToken(null);
    setCurrentUser(null);
    setIdentityKeyPair(null);
    if (socketRef.current) socketRef.current.disconnect();
  };

  // HANDLERS FOR COMMUNITY & CHATS
  const handleSendMessage = async (text: string) => {
    if (!socketRef.current || !identityKeyPair) return;

    let targetId = activeChannel?.id || activeDmUser?.id;
    if (!targetId) return;

    // Get or Derive AES Key
    let aesKey = derivedKeysRef.current.get(targetId);
    if (!aesKey) {
      if (activeDmUser?.ecdhPublicKeyJwk) {
        const remotePubKey = await importPublicKeyJwk(activeDmUser.ecdhPublicKeyJwk);
        aesKey = await deriveSharedKey(identityKeyPair.privateKey, remotePubKey);
        derivedKeysRef.current.set(activeDmUser.id, aesKey);
      } else {
        aesKey = await generateGroupChannelKey();
        derivedKeysRef.current.set(targetId, aesKey);
      }
    }

    // Encrypt payload Zero-Knowledge
    const { ciphertext, iv } = await encryptText(text, aesKey);

    socketRef.current.emit('chat:send_message', {
      serverId: activeServerId || undefined,
      channelId: activeChannel?.id,
      recipientId: activeDmUser?.id,
      ciphertext,
      iv,
      keyAlgorithm: 'AES-GCM-256',
    }, (res: any) => {
      if (!res.success) {
        alert(`Błąd wysyłania: ${res.error}`);
      }
    });
  };

  // WEBRTC 1-ON-1 DIRECT CALL LOGIC
  const createDirectCallOffer = async (peerId: string) => {
    const stream = await getMediaStream(true, true);
    setCallLocalStream(stream);

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });
    peerConnectionRef.current = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      setCallRemoteStream(event.streams[0]);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('call:signal', {
          targetUserId: peerId,
          candidate: event.candidate,
          type: 'candidate',
        });
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socketRef.current?.emit('call:signal', {
      targetUserId: peerId,
      sdp: offer,
      type: 'offer',
    });
  };

  const handleInitiateCall = (targetUserId: string, callType: 'audio' | 'video') => {
    const peer = friends.find(f => f.userId === targetUserId)?.user;
    if (!peer) return;

    setCallPeerId(targetUserId);
    setActiveCallPeerName(peer.displayName);

    socketRef.current?.emit('call:initiate', { targetUserId, callType }, (res: any) => {
      if (!res.success) {
        alert(res.error || 'Nie można nawiązać połączenia');
        cleanupDirectCall();
      }
    });
  };

  const handleAcceptCall = async () => {
    if (!incomingCall) return;

    setCallPeerId(incomingCall.callerId);
    setActiveCallPeerName(incomingCall.callerName);

    const stream = await getMediaStream(true, incomingCall.callType === 'video');
    setCallLocalStream(stream);

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    peerConnectionRef.current = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      setCallRemoteStream(event.streams[0]);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('call:signal', {
          targetUserId: incomingCall.callerId,
          candidate: event.candidate,
          type: 'candidate',
        });
      }
    };

    socketRef.current?.emit('call:response', {
      callerId: incomingCall.callerId,
      accepted: true,
    });

    setIncomingCall(null);
  };

  const handleDeclineCall = () => {
    if (incomingCall) {
      socketRef.current?.emit('call:response', {
        callerId: incomingCall.callerId,
        accepted: false,
      });
      setIncomingCall(null);
    }
  };

  const cleanupDirectCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (callLocalStream) {
      callLocalStream.getTracks().forEach(t => t.stop());
      setCallLocalStream(null);
    }
    setCallRemoteStream(null);
    setActiveCallPeerName(null);
    setCallPeerId(null);
  };

  const handleHangupCall = () => {
    if (callPeerId) {
      socketRef.current?.emit('call:hangup', { targetUserId: callPeerId });
    }
    cleanupDirectCall();
  };

  // WEBRTC MESH VOICE CHANNEL LOGIC
  const initiateVoicePeerConnection = async (peerUserId: string, channelId: string, isInitiator: boolean) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    voicePeerConnectionsRef.current.set(peerUserId, pc);

    if (voiceLocalStream) {
      voiceLocalStream.getTracks().forEach(track => pc.addTrack(track, voiceLocalStream));
    }

    pc.ontrack = (event) => {
      voiceRemoteStreamsRef.current.set(peerUserId, event.streams[0]);
      setVoiceStreamUpdateTrigger(n => n + 1);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('voice:signal', {
          targetUserId: peerUserId,
          channelId,
          candidate: event.candidate,
        });
      }
    };

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('voice:signal', {
        targetUserId: peerUserId,
        channelId,
        sdp: offer,
      });
    }

    return pc;
  };

  const handleJoinVoiceChannel = async (channel: Channel) => {
    setActiveVoiceChannelId(channel.id);
    setActiveChannel(channel);

    const stream = await getMediaStream(true, isVideoOn);
    setVoiceLocalStream(stream);

    setVoiceParticipants([{
      userId: 'self',
      displayName: currentUser?.displayName || 'Ja',
      isMuted: false,
      isDeafened: false,
      isVideoOn,
      isScreenSharing: false,
      joinedAt: new Date().toISOString(),
    }]);

    socketRef.current?.emit('voice:join', { channelId: channel.id, isMuted, isVideoOn }, async (res: any) => {
      if (res.success && res.existingPeers) {
        for (const peer of res.existingPeers) {
          setVoiceParticipants(prev => [...prev, {
            userId: peer.userId,
            displayName: peer.displayName,
            isMuted: peer.isMuted,
            isDeafened: peer.isDeafened,
            isVideoOn: peer.isVideoOn,
            isScreenSharing: false,
            joinedAt: new Date().toISOString(),
          }]);
          await initiateVoicePeerConnection(peer.userId, channel.id, true);
        }
      }
    });
  };

  const handleLeaveVoiceChannel = () => {
    if (activeVoiceChannelId) {
      socketRef.current?.emit('voice:leave', { channelId: activeVoiceChannelId });
    }
    voicePeerConnectionsRef.current.forEach(pc => pc.close());
    voicePeerConnectionsRef.current.clear();
    voiceRemoteStreamsRef.current.clear();

    if (voiceLocalStream) {
      voiceLocalStream.getTracks().forEach(t => t.stop());
      setVoiceLocalStream(null);
    }

    setActiveVoiceChannelId(null);
    setVoiceParticipants([]);
  };

  // IF NOT LOGGED IN: SHOW AUTH MODAL
  if (!authToken || !currentUser) {
    return (
      <AuthModal
        onRegister={handleRegister}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <div className="flex h-screen w-screen bg-slate-950 font-sans antialiased text-slate-100 overflow-hidden">
      
      {/* DESKTOP SIDEBAR */}
      <div className="hidden md:flex h-full shrink-0">
        <Sidebar
          currentUser={currentUser}
          servers={servers}
          activeServerId={activeServerId}
          activeChannelId={activeChannel?.id || null}
          activeDmUserId={activeDmUser?.id || null}
          friendsCount={friends.filter(f => f.status === 'accepted').length}
          activeVoiceChannelId={activeVoiceChannelId}
          onSelectServer={(serverId) => {
            setActiveServerId(serverId);
            setActiveDmUser(null);
            setIsFriendsTabOpen(false);
            setIsMobileSidebarOpen(false);
          }}
          onSelectChannel={(channel) => {
            setIsFriendsTabOpen(false);
            setActiveDmUser(null);
            setIsMobileSidebarOpen(false);
            if (channel.type === 'voice') {
              handleJoinVoiceChannel(channel);
            } else {
              setActiveChannel(channel);
            }
          }}
          onSelectDmUser={(userId) => {
            const friendObj = friends.find(f => f.userId === userId)?.user;
            if (friendObj) {
              setActiveDmUser(friendObj);
              setActiveServerId(null);
              setActiveChannel(null);
              setIsFriendsTabOpen(false);
              setIsMobileSidebarOpen(false);
            }
          }}
          onOpenFriendsTab={() => {
            setActiveServerId(null);
            setActiveChannel(null);
            setActiveDmUser(null);
            setIsFriendsTabOpen(true);
            setIsMobileSidebarOpen(false);
          }}
          onOpenCreateServerModal={() => {
            setIsCreateServerModalOpen(true);
            setIsMobileSidebarOpen(false);
          }}
          onOpenDocsModal={() => {
            setIsDocsModalOpen(true);
            setIsMobileSidebarOpen(false);
          }}
          onOpenProfileModal={() => {
            setIsProfileModalOpen(true);
            setIsMobileSidebarOpen(false);
          }}
          onLogout={handleLogout}
          onOpenCreateChannelModal={(sId, type) => {
            handleOpenCreateChannelModal(sId, type);
            setIsMobileSidebarOpen(false);
          }}
        />
      </div>

      {/* MOBILE DRAWER SIDEBAR */}
      {isMobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Dark Backdrop */}
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          {/* Drawer Content */}
          <div className="relative z-10 flex h-full max-w-[85vw] shadow-2xl animate-in slide-in-from-left duration-200">
            <Sidebar
              currentUser={currentUser}
              servers={servers}
              activeServerId={activeServerId}
              activeChannelId={activeChannel?.id || null}
              activeDmUserId={activeDmUser?.id || null}
              friendsCount={friends.filter(f => f.status === 'accepted').length}
              activeVoiceChannelId={activeVoiceChannelId}
              onSelectServer={(serverId) => {
                setActiveServerId(serverId);
                setActiveDmUser(null);
                setIsFriendsTabOpen(false);
                setIsMobileSidebarOpen(false);
              }}
              onSelectChannel={(channel) => {
                setIsFriendsTabOpen(false);
                setActiveDmUser(null);
                setIsMobileSidebarOpen(false);
                if (channel.type === 'voice') {
                  handleJoinVoiceChannel(channel);
                } else {
                  setActiveChannel(channel);
                }
              }}
              onSelectDmUser={(userId) => {
                const friendObj = friends.find(f => f.userId === userId)?.user;
                if (friendObj) {
                  setActiveDmUser(friendObj);
                  setActiveServerId(null);
                  setActiveChannel(null);
                  setIsFriendsTabOpen(false);
                  setIsMobileSidebarOpen(false);
                }
              }}
              onOpenFriendsTab={() => {
                setActiveServerId(null);
                setActiveChannel(null);
                setActiveDmUser(null);
                setIsFriendsTabOpen(true);
                setIsMobileSidebarOpen(false);
              }}
              onOpenCreateServerModal={() => {
                setIsCreateServerModalOpen(true);
                setIsMobileSidebarOpen(false);
              }}
              onOpenDocsModal={() => {
                setIsDocsModalOpen(true);
                setIsMobileSidebarOpen(false);
              }}
              onOpenProfileModal={() => {
                setIsProfileModalOpen(true);
                setIsMobileSidebarOpen(false);
              }}
              onLogout={handleLogout}
              onCloseMobileSidebar={() => setIsMobileSidebarOpen(false)}
              onOpenCreateChannelModal={(sId, type) => {
                handleOpenCreateChannelModal(sId, type);
                setIsMobileSidebarOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {/* MAIN WORKSPACE AREA */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {isFriendsTabOpen ? (
          <FriendsView
            friends={friends}
            onSendFriendRequest={async (tag) => {
              return new Promise((res) => {
                socketRef.current?.emit('friend:request', { targetUserTag: tag }, (r: any) => res(r));
              });
            }}
            onAcceptFriendRequest={async (userId) => {
              socketRef.current?.emit('friend:accept', { targetUserId: userId });
            }}
            onDeclineFriendRequest={async (userId) => {
              socketRef.current?.emit('friend:decline', { targetUserId: userId });
            }}
            onSelectDmUser={(user) => {
              setActiveDmUser(user);
              setIsFriendsTabOpen(false);
            }}
            onInitiateCall={handleInitiateCall}
            onToggleMobileSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
          />
        ) : activeVoiceChannelId && activeChannel?.type === 'voice' ? (
          <VoiceChannelArea
            channelName={activeChannel.name}
            participants={voiceParticipants}
            localStream={voiceLocalStream}
            remoteStreams={voiceRemoteStreamsRef.current}
            isMuted={isMuted}
            isVideoOn={isVideoOn}
            isScreenSharing={isScreenSharing}
            onToggleMute={() => {
              setIsMuted(!isMuted);
              socketRef.current?.emit('voice:toggle_state', {
                channelId: activeVoiceChannelId,
                isMuted: !isMuted,
                isVideoOn,
              });
            }}
            onToggleVideo={() => {
              setIsVideoOn(!isVideoOn);
              socketRef.current?.emit('voice:toggle_state', {
                channelId: activeVoiceChannelId,
                isMuted,
                isVideoOn: !isVideoOn,
              });
            }}
            onToggleScreenShare={() => setIsScreenSharing(!isScreenSharing)}
            onLeaveVoiceChannel={handleLeaveVoiceChannel}
            onToggleMobileSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
          />
        ) : (
          <ChatArea
            channelName={activeChannel?.name}
            dmRecipient={activeDmUser || undefined}
            messages={messages}
            onSendMessage={handleSendMessage}
            onOpenDocsModal={() => setIsDocsModalOpen(true)}
            onToggleMobileSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
          />
        )}
      </div>

      {/* 1-ON-1 DIRECT CALL OVERLAY */}
      <DirectCallOverlay
        incomingCall={incomingCall}
        activeCallPeerName={activeCallPeerName}
        localStream={callLocalStream}
        remoteStream={callRemoteStream}
        isMuted={isMuted}
        isVideoOn={isVideoOn}
        isScreenSharing={isScreenSharing}
        onAcceptCall={handleAcceptCall}
        onDeclineCall={handleDeclineCall}
        onHangupCall={handleHangupCall}
        onToggleMute={() => setIsMuted(!isMuted)}
        onToggleVideo={() => setIsVideoOn(!isVideoOn)}
        onToggleScreenShare={() => setIsScreenSharing(!isScreenSharing)}
      />

      {/* MODALS */}
      <ServerCreateModal
        isOpen={isCreateServerModalOpen}
        onClose={() => setIsCreateServerModalOpen(false)}
        onCreateServer={async (name, icon) => {
          return new Promise((res) => {
            socketRef.current?.emit('server:create', { name, icon }, (r: any) => res(r));
          });
        }}
      />

      <ChannelCreateModal
        isOpen={isCreateChannelModalOpen}
        serverId={createChannelServerId}
        initialType={createChannelInitialType}
        onClose={() => setIsCreateChannelModalOpen(false)}
        onCreateChannel={async (sId, name, type) => {
          return new Promise((res) => {
            socketRef.current?.emit('channel:create', { serverId: sId, name, type }, (r: any) => res(r));
          });
        }}
      />

      {currentUser && (
        <ProfileModal
          isOpen={isProfileModalOpen}
          currentUser={currentUser}
          onClose={() => setIsProfileModalOpen(false)}
          onUpdateProfile={async (displayName) => {
            return new Promise((res) => {
              socketRef.current?.emit('user:update_profile', { displayName }, (r: any) => {
                if (r.success) setCurrentUser(r.user);
                res(r);
              });
            });
          }}
        />
      )}

      <ArchitectureDocsModal
        isOpen={isDocsModalOpen}
        onClose={() => setIsDocsModalOpen(false)}
      />

    </div>
  );
}
