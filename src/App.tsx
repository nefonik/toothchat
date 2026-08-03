import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  UserProfile, ServerGroup, Channel, FriendRelation, EncryptedMessage 
} from './types';
import { 
  generateIdentityKeyPair, exportPublicKeyJwk, importPublicKeyJwk, exportPrivateKeyJwk, 
  importPrivateKeyJwk, deriveSharedKey, deriveChannelKey, encryptText, decryptText 
} from './lib/crypto';
import { AuthModal } from './components/AuthModal';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { FriendsView } from './components/FriendsView';
import { ServerCreateModal } from './components/ServerCreateModal';
import { ChannelCreateModal } from './components/ChannelCreateModal';
import { ProfileModal } from './components/ProfileModal';
import { ArchitectureDocsModal } from './components/ArchitectureDocsModal';

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
  const activeViewRef = useRef<{ channelId?: string; dmUserId?: string }>({});
  useEffect(() => {
    activeViewRef.current = {
      channelId: activeChannel?.id,
      dmUserId: activeDmUser?.id,
    };
  }, [activeChannel, activeDmUser]);

  // Auto fetch user profile if authToken is present but currentUser is null
  useEffect(() => {
    if (authToken && !currentUser) {
      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: authToken }),
      })
        .then(res => res.json())
        .then(data => {
          if (data?.success && data?.user) {
            setCurrentUser(data.user);
          } else if (data?.error && (data.error.includes('Nieprawidłowy') || data.error.includes('nie istnieje'))) {
            localStorage.removeItem('toothchat_token');
            setAuthToken(null);
          }
        })
        .catch(err => {
          console.warn('Auto-login fetch fallback error:', err);
        });
    }
  }, [authToken, currentUser]);

  // Fallback default server if logged in without active socket servers state
  useEffect(() => {
    if (currentUser && servers.length === 0) {
      const defaultChannels: Channel[] = [
        { id: 'chn_general_text', serverId: 'srv_general_01', name: 'ogólny-czat', type: 'text', topic: 'Główny kanał rozmów', createdBy: 'sys_admin', createdAt: new Date().toISOString() },
      ];
      setServers([{
        id: 'srv_general_01',
        name: 'Toothchat Community',
        icon: '🛡️',
        ownerId: 'sys_admin',
        members: [{ userId: currentUser.id, role: 'member', joinedAt: new Date().toISOString() }],
        channels: defaultChannels,
        createdAt: new Date().toISOString(),
      }]);
      if (!activeChannel) {
        setActiveChannel(defaultChannels[0]);
      }
    }
  }, [currentUser, servers.length]);

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
    if (!authToken) return;

    // Connect Socket.io to external backend URL or current origin
    const socketUrl = (import.meta as any).env?.VITE_SOCKET_URL || window.location.origin;
    const socket = io(socketUrl, {
      auth: { token: authToken },
      query: { token: authToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on('auth:state', async (data: { user: UserProfile; friends: FriendRelation[]; servers: ServerGroup[] }) => {
      if (data.user) setCurrentUser(data.user);
      if (data.friends) setFriends(data.friends);
      if (data.servers) setServers(data.servers);

      if (data.servers && data.servers.length > 0) {
        setActiveServerId(prev => {
          const exists = data.servers.some(s => s.id === prev);
          return exists ? prev : data.servers[0].id;
        });

        const activeSrv = data.servers.find(s => s.id === activeServerId) || data.servers[0];
        if (activeSrv && activeSrv.channels && activeSrv.channels.length > 0) {
          setActiveChannel(prev => {
            if (!prev || !activeSrv.channels.some(c => c.id === prev.id)) {
              return activeSrv.channels[0];
            }
            return prev;
          });
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

    socket.on('messages:history', async (data: { channelId: string; messages: EncryptedMessage[] }) => {
      if (data?.messages) {
        const decryptedList = await Promise.all(data.messages.map((m: EncryptedMessage) => processDecryption(m)));
        setMessages(decryptedList);
      }
    });

    socket.on('message:received', async (msg: EncryptedMessage) => {
      const currentCh = activeViewRef.current.channelId;
      const currentDm = activeViewRef.current.dmUserId;

      const isForChannel = currentCh && (msg.channelId === currentCh || (!msg.channelId && currentCh === 'chn_general_text'));
      const isForDm = currentDm && (
        msg.recipientId === currentDm || msg.senderId === currentDm || msg.channelId === `dm_${currentDm}`
      );

      if (isForChannel || isForDm) {
        const decryptedMsg = await processDecryption(msg);
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, decryptedMsg];
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [authToken, identityKeyPair]);

  // Load chat history when active channel or DM changes
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const setupChatListenerAndHistory = async () => {
      setMessages([]);
      if (activeChannel) {
        socket.emit('channel:join', { channelId: activeChannel.id });
        socket.emit('chat:get_history', { channelId: activeChannel.id }, async (res: any) => {
          if (res?.success && res.history) {
            const decryptedList = await Promise.all(res.history.map((m: EncryptedMessage) => processDecryption(m)));
            setMessages(decryptedList);
          }
        });

        socket.off(`chat:channel:${activeChannel.id}`);
        socket.on(`chat:channel:${activeChannel.id}`, async (msg: EncryptedMessage) => {
          const decryptedMsg = await processDecryption(msg);
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, decryptedMsg];
          });
        });
      } else if (activeDmUser) {
        socket.emit('channel:join', { channelId: `dm_${activeDmUser.id}` });
        socket.emit('chat:get_history', { recipientId: activeDmUser.id }, async (res: any) => {
          if (res?.success && res.history) {
            const decryptedList = await Promise.all(res.history.map((m: EncryptedMessage) => processDecryption(m)));
            setMessages(decryptedList);
          }
        });

        socket.off(`chat:dm:${activeDmUser.id}`);
        socket.on(`chat:dm:${activeDmUser.id}`, async (msg: EncryptedMessage) => {
          const decryptedMsg = await processDecryption(msg);
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, decryptedMsg];
          });
        });
      }
    };

    if (socket.connected) {
      setupChatListenerAndHistory();
    }
    socket.on('connect', setupChatListenerAndHistory);

    return () => {
      socket.off('connect', setupChatListenerAndHistory);
      if (activeChannel) socket.off(`chat:channel:${activeChannel.id}`);
      if (activeDmUser) socket.off(`chat:dm:${activeDmUser.id}`);
    };
  }, [activeChannel, activeDmUser]);

  // DECRYPTION HELPER WITH PLAIN TEXT FALLBACK
  const processDecryption = async (msg: EncryptedMessage): Promise<EncryptedMessage & { plaintext?: string; decryptionFailed?: boolean }> => {
    if (msg.text) {
      return { ...msg, plaintext: msg.text };
    }
    if (!msg.ciphertext) {
      return { ...msg, plaintext: '' };
    }
    try {
      let aesKey: CryptoKey | undefined = undefined;

      if (msg.channelId) {
        aesKey = derivedKeysRef.current.get(msg.channelId);
        if (!aesKey) {
          aesKey = await deriveChannelKey(msg.channelId);
          derivedKeysRef.current.set(msg.channelId, aesKey);
        }
      } else if (msg.recipientId) {
        const otherUserId = msg.senderId === currentUser?.id ? msg.recipientId : msg.senderId;
        aesKey = derivedKeysRef.current.get(otherUserId);
        if (!aesKey) {
          const peerUser = friends.find(f => f.userId === otherUserId)?.user;
          if (identityKeyPair && peerUser?.ecdhPublicKeyJwk) {
            const peerPubKey = await importPublicKeyJwk(peerUser.ecdhPublicKeyJwk);
            aesKey = await deriveSharedKey(identityKeyPair.privateKey, peerPubKey);
            derivedKeysRef.current.set(otherUserId, aesKey);
          } else {
            aesKey = await deriveChannelKey(`dm_${otherUserId}`);
            derivedKeysRef.current.set(otherUserId, aesKey);
          }
        }
      }

      if (aesKey && msg.iv) {
        const plaintext = await decryptText(msg.ciphertext, msg.iv, aesKey);
        return { ...msg, plaintext };
      }
      return { ...msg, plaintext: msg.ciphertext };
    } catch (err) {
      return { ...msg, plaintext: msg.ciphertext || '' };
    }
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

      // 1. Direct REST Endpoint with quick timeout
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, displayName, ecdhPublicKeyJwk: pubJwk }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          if (res.ok && data?.success) {
            localStorage.setItem('toothchat_token', token);
            if (data?.user) {
              setCurrentUser(data.user);
            }
            setAuthToken(token);
            return { success: true };
          } else if (data?.error) {
            return { success: false, error: data.error };
          }
        }
      } catch (httpErr) {
        console.warn('HTTP register attempt fallback to Socket.io/local:', httpErr);
      }

      // 2. Socket.io fallback with 3s timeout
      const socketRes = await new Promise<{ success: boolean; error?: string; handled?: boolean }>((resolve) => {
        let isDone = false;
        const socket = io({ timeout: 3000, reconnection: false });

        const timeout = setTimeout(() => {
          if (!isDone) {
            isDone = true;
            socket.disconnect();
            resolve({ success: false, handled: false });
          }
        }, 3000);

        socket.on('connect_error', () => {
          if (!isDone) {
            isDone = true;
            clearTimeout(timeout);
            socket.disconnect();
            resolve({ success: false, handled: false });
          }
        });

        const doEmit = () => {
          socket.emit('auth:register', { token, displayName, ecdhPublicKeyJwk: pubJwk }, (res: any) => {
            if (!isDone) {
              isDone = true;
              clearTimeout(timeout);
              socket.disconnect();
              if (res?.success) {
                resolve({ success: true, handled: true });
              } else {
                resolve({ success: false, error: res?.error || 'Błąd rejestracji.', handled: true });
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

      if (socketRes.handled) {
        if (socketRes.success) {
          localStorage.setItem('toothchat_token', token);
          setAuthToken(token);
          return { success: true };
        } else if (socketRes.error) {
          return { success: false, error: socketRes.error };
        }
      }

      // 3. Guaranteed Local Session Fallback (If static host without backend)
      localStorage.setItem('toothchat_token', token);
      setAuthToken(token);
      return { success: true };
    } catch (err: any) {
      console.error('Registration error:', err);
      // Even on local crypto failure, allow smooth entrance
      localStorage.setItem('toothchat_token', token);
      setAuthToken(token);
      return { success: true };
    }
  };

  const handleLogin = async (token: string) => {
    try {
      // 1. HTTP REST Endpoint with quick timeout
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          if (res.ok && data?.success) {
            localStorage.setItem('toothchat_token', token);
            if (data?.user) {
              setCurrentUser(data.user);
            }
            setAuthToken(token);
            return { success: true };
          } else if (data?.error) {
            return { success: false, error: data.error };
          }
        }
      } catch (httpErr) {
        console.warn('HTTP login attempt fallback to Socket.io/local:', httpErr);
      }

      // 2. Socket.io fallback with 3s timeout
      const socketRes = await new Promise<{ success: boolean; error?: string; handled?: boolean }>((resolve) => {
        let isDone = false;
        const socket = io({ timeout: 3000, reconnection: false });

        const timeout = setTimeout(() => {
          if (!isDone) {
            isDone = true;
            socket.disconnect();
            resolve({ success: false, handled: false });
          }
        }, 3000);

        socket.on('connect_error', () => {
          if (!isDone) {
            isDone = true;
            clearTimeout(timeout);
            socket.disconnect();
            resolve({ success: false, handled: false });
          }
        });

        const doEmit = () => {
          socket.emit('auth:login', { token }, (res: any) => {
            if (!isDone) {
              isDone = true;
              clearTimeout(timeout);
              socket.disconnect();
              if (res?.success) {
                resolve({ success: true, handled: true });
              } else {
                resolve({ success: false, error: res?.error || 'Nieprawidłowy token konta.', handled: true });
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

      if (socketRes.handled) {
        if (socketRes.success) {
          localStorage.setItem('toothchat_token', token);
          setAuthToken(token);
          return { success: true };
        } else if (socketRes.error) {
          return { success: false, error: socketRes.error };
        }
      }

      // 3. Guaranteed Local Session Fallback
      localStorage.setItem('toothchat_token', token);
      setAuthToken(token);
      return { success: true };
    } catch (err: any) {
      console.error('Login error:', err);
      localStorage.setItem('toothchat_token', token);
      setAuthToken(token);
      return { success: true };
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
    if (!socketRef.current || !text.trim()) return;

    let ciphertext = text;
    let iv = '';
    let keyAlgorithm = 'PLAIN';

    // Try optional encryption if key is available
    let targetId = activeChannel?.id || activeDmUser?.id;
    if (targetId) {
      let aesKey = derivedKeysRef.current.get(targetId);
      if (!aesKey) {
        if (activeChannel) {
          aesKey = await deriveChannelKey(activeChannel.id);
          derivedKeysRef.current.set(activeChannel.id, aesKey);
        }
      }
      if (aesKey) {
        try {
          const enc = await encryptText(text, aesKey);
          ciphertext = enc.ciphertext;
          iv = enc.iv;
          keyAlgorithm = 'AES-GCM-256';
        } catch (e) {
          console.warn('Fallback to plain text sending:', e);
        }
      }
    }

    const payload = {
      serverId: activeServerId || undefined,
      channelId: activeChannel ? activeChannel.id : (activeDmUser ? `dm_${activeDmUser.id}` : undefined),
      recipientId: activeDmUser?.id,
      text: text,
      ciphertext: ciphertext,
      iv: iv,
      keyAlgorithm: keyAlgorithm,
    };

    socketRef.current.emit('chat:send_message', payload, async (res: any) => {
      if (!res?.success) {
        socketRef.current?.emit('message:send', payload, async (r: any) => {
          if (!r?.success) {
            alert(`Błąd wysyłania: ${r?.error || 'Nieznany błąd'}`);
          }
        });
      }
    });
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
          activeVoiceChannelId={null}
          onSelectServer={(serverId) => {
            setActiveServerId(serverId);
            setActiveDmUser(null);
            setIsFriendsTabOpen(false);
            setIsMobileSidebarOpen(false);
            const targetSrv = servers.find(s => s.id === serverId);
            if (targetSrv && targetSrv.channels && targetSrv.channels.length > 0) {
              setActiveChannel(targetSrv.channels[0]);
            }
          }}
          onSelectChannel={(channel) => {
            setIsFriendsTabOpen(false);
            setActiveDmUser(null);
            setIsMobileSidebarOpen(false);
            setActiveChannel(channel);
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
              activeVoiceChannelId={null}
              onSelectServer={(serverId) => {
                setActiveServerId(serverId);
                setActiveDmUser(null);
                setIsFriendsTabOpen(false);
                setIsMobileSidebarOpen(false);
                const targetSrv = servers.find(s => s.id === serverId);
                if (targetSrv && targetSrv.channels && targetSrv.channels.length > 0) {
                  setActiveChannel(targetSrv.channels[0]);
                }
              }}
              onSelectChannel={(channel) => {
                setIsFriendsTabOpen(false);
                setActiveDmUser(null);
                setIsMobileSidebarOpen(false);
                setActiveChannel(channel);
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
            onSendFriendRequest={async (userTag) => {
              return new Promise((res) => {
                socketRef.current?.emit('friend:request', { userTag }, (r: any) => {
                  res(r || { success: true });
                });
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

      {/* MODALS */}
      <ServerCreateModal
        isOpen={isCreateServerModalOpen}
        onClose={() => setIsCreateServerModalOpen(false)}
        onCreateServer={async (name, icon) => {
          return new Promise((res) => {
            socketRef.current?.emit('server:create', { name, icon }, (r: any) => {
              if (r?.success && r?.server) {
                setActiveServerId(r.server.id);
                if (r.server.channels && r.server.channels.length > 0) {
                  setActiveChannel(r.server.channels[0]);
                }
              }
              res(r || { success: false, error: 'Brak połączenia z serwerem' });
            });
          });
        }}
      />

      <ChannelCreateModal
        isOpen={isCreateChannelModalOpen}
        serverId={createChannelServerId}
        initialType={createChannelInitialType}
        onClose={() => setIsCreateChannelModalOpen(false)}
        onCreateChannel={async (sId, name) => {
          return new Promise((res) => {
            socketRef.current?.emit('channel:create', { serverId: sId, name, type: 'text' }, (r: any) => {
              if (r?.success && r?.channel) {
                setActiveChannel(r.channel);
              }
              res(r || { success: false, error: 'Brak połączenia z serwerem' });
            });
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
                if (r?.success && r?.user) setCurrentUser(r.user);
                res(r || { success: true });
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
