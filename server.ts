import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import {
  connectToMongoDB,
  UserModel,
  ServerModel,
  ChannelModel,
  MessageModel,
} from './api/_db.js';

let isMongoConnected = false;

// Helper function to hash stateless authorization tokens with SHA-256
function computeSha256(str: string): string {
  return crypto.createHash('sha256').update(str.trim()).digest('hex');
}

// Interfaces for server memory database state
interface UserStore {
  id: string;
  tokenHash: string;
  displayName: string;
  userTag: string;
  ecdhPublicKey: string;
  status: 'online' | 'offline' | 'busy' | 'away';
  friends: {
    userId: string;
    status: 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';
    updatedAt: string;
  }[];
  createdAt: string;
}

interface ChannelStore {
  id: string;
  serverId?: string;
  name: string;
  type: 'text' | 'voice';
  topic?: string;
  createdBy: string;
  createdAt: string;
}

interface ServerStore {
  id: string;
  name: string;
  icon?: string;
  ownerId: string;
  members: {
    userId: string;
    role: 'owner' | 'admin' | 'member';
    joinedAt: string;
    encryptedGroupKey?: string;
  }[];
  channels: ChannelStore[];
  createdAt: string;
}

interface MessageStore {
  id: string;
  serverId?: string;
  channelId?: string;
  recipientId?: string;
  senderId: string;
  senderName: string;
  ciphertext: string;
  iv: string;
  keyAlgorithm: string;
  timestamp: string;
}

// In-Memory Database Store
const db = {
  users: new Map<string, UserStore>(), // id -> user
  tokenHashMap: new Map<string, string>(), // tokenHash -> userId
  servers: new Map<string, ServerStore>(), // id -> server
  channels: new Map<string, ChannelStore>(), // id -> channel
  messages: [] as MessageStore[],
  // Voice channel active participants: channelId -> Map<userId, { isMuted, isDeafened, isVideoOn }>
  voiceChannels: new Map<string, Map<string, { socketId: string; displayName: string; isMuted: boolean; isDeafened: boolean; isVideoOn: boolean }>>(),
  // Socket ID -> User ID lookup
  socketUserMap: new Map<string, string>(),
  // User ID -> Socket ID lookup
  userSocketMap: new Map<string, string>(),
};

// Seed initial default public demo server so users immediately have a room to test
function initializeDemoData() {
  const defaultServerId = 'srv_general_01';
  const textChannelId = 'chn_general_text';
  const voiceChannelId = 'chn_general_voice';

  const defaultChannels: ChannelStore[] = [
    {
      id: textChannelId,
      serverId: defaultServerId,
      name: 'ogólny-czat',
      type: 'text',
      topic: 'Oficjalny kanał dyskusyjny Toothchat',
      createdBy: 'sys_admin',
      createdAt: new Date().toISOString(),
    },
    {
      id: voiceChannelId,
      serverId: defaultServerId,
      name: 'Pokój Główny (Głos/Wideo)',
      type: 'voice',
      topic: 'Kanał głosowy WebRTC',
      createdBy: 'sys_admin',
      createdAt: new Date().toISOString(),
    },
  ];

  db.servers.set(defaultServerId, {
    id: defaultServerId,
    name: 'Toothchat Community',
    icon: '🦷',
    ownerId: 'sys_admin',
    members: [],
    channels: defaultChannels,
    createdAt: new Date().toISOString(),
  });

  db.channels.set(textChannelId, defaultChannels[0]);
  db.channels.set(voiceChannelId, defaultChannels[1]);
}

initializeDemoData();

async function startAppServer() {
  // Connect to MongoDB Atlas
  try {
    isMongoConnected = await connectToMongoDB();
  } catch (err) {
    console.error('[MongoDB Startup Error]', err);
    isMongoConnected = false;
  }
  if (isMongoConnected) {
    try {
      const users = await UserModel.find({});
      for (const u of users) {
        const uObj: UserStore = {
          id: u.id,
          tokenHash: u.tokenHash,
          displayName: u.displayName,
          userTag: u.userTag,
          ecdhPublicKey: u.ecdhPublicKey,
          status: 'offline',
          friends: (u.friends || []).map((f: any) => ({
            userId: f.userId,
            status: f.status as any,
            updatedAt: f.updatedAt || new Date().toISOString(),
          })),
          createdAt: u.createdAt || new Date().toISOString(),
        };
        db.users.set(u.id, uObj);
        db.tokenHashMap.set(u.tokenHash, u.id);
      }

      const servers = await ServerModel.find({});
      for (const s of servers) {
        const sObj: ServerStore = {
          id: s.id,
          name: s.name,
          icon: s.icon,
          ownerId: s.ownerId,
          members: (s.members || []).map((m: any) => ({
            userId: m.userId,
            role: m.role as any,
            joinedAt: m.joinedAt || new Date().toISOString(),
            encryptedGroupKey: m.encryptedGroupKey,
          })),
          channels: (s.channels || []).map((c: any) => ({
            id: c.id,
            serverId: c.serverId,
            name: c.name,
            type: c.type as any,
            topic: c.topic,
            createdBy: c.createdBy,
            createdAt: c.createdAt || new Date().toISOString(),
          })),
          createdAt: s.createdAt || new Date().toISOString(),
        };
        db.servers.set(s.id, sObj);
        for (const ch of sObj.channels) {
          db.channels.set(ch.id, ch);
        }
      }

      const msgs = await MessageModel.find({}).sort({ timestamp: 1 }).limit(1000);
      for (const m of msgs) {
        db.messages.push({
          id: m.id,
          serverId: m.serverId,
          channelId: m.channelId,
          recipientId: m.recipientId,
          senderId: m.senderId,
          senderName: m.senderName,
          ciphertext: m.ciphertext,
          iv: m.iv,
          keyAlgorithm: m.keyAlgorithm || 'AES-GCM-256',
          timestamp: m.timestamp || new Date().toISOString(),
        });
      }
      console.log(`[MongoDB Sync] Synchronized ${users.length} users, ${servers.length} servers, ${msgs.length} messages from Atlas.`);
    } catch (loadErr) {
      console.error('[MongoDB Sync Error]', loadErr);
    }
  }

  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: { origin: '*' },
    maxHttpBufferSize: 1e7, // 10MB payload limit
  });

  app.use(express.json());

  // API Health Endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      mongoDbConnected: isMongoConnected,
      activeUsers: db.users.size,
      onlineUsers: db.socketUserMap.size,
      activeServers: db.servers.size,
      security: 'Zero-Knowledge E2EE Active',
      timestamp: new Date().toISOString(),
    });
  });

  // REST API: Get schemas metadata for architectural documentation inspector
  app.get('/api/docs/architecture', (req, res) => {
    res.json({
      title: 'Aether E2EE - Architektura Systemu i Bezpieczeństwo',
      cryptoEngine: 'Web Crypto API (SubtleCrypto)',
      algorithms: {
        keyAgreement: 'ECDH P-256 (Elliptic Curve Diffie-Hellman)',
        symmetricCipher: 'AES-GCM-256 z 12-bajtowym IV',
        statelessAuth: 'SHA-256 Token Hashing',
        webrtcSecurity: 'DTLS-SRTP + WebRTC Insertable Streams (Frame Crypto)',
      },
      webrtcTopology: {
        p2pCall: 'Peer-to-Peer 1-on-1 z sygnalizacją Socket.io (Ringing, SDP, ICE Trickle)',
        groupVoice: 'Mesh Topology (Full Mesh Peer Connections z unikalnymi ID uczestników)',
      },
    });
  });

  // REST API: Register
  app.post('/api/auth/register', (req, res) => {
    try {
      const { token, displayName, ecdhPublicKeyJwk } = req.body || {};
      if (!token || !displayName || !ecdhPublicKeyJwk) {
        return res.status(400).json({ success: false, error: 'Nieprawidłowe dane rejestracji' });
      }

      const tokenHash = computeSha256(token);
      if (db.tokenHashMap.has(tokenHash)) {
        return res.status(400).json({ success: false, error: 'Ten token jest już powiązany z kontem' });
      }

      const userId = 'usr_' + crypto.randomBytes(8).toString('hex');
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const userTag = `${displayName.trim()}#${randomNum}`;

      const newUser: UserStore = {
        id: userId,
        tokenHash,
        displayName: displayName.trim(),
        userTag,
        ecdhPublicKey: ecdhPublicKeyJwk,
        status: 'online',
        friends: [],
        createdAt: new Date().toISOString(),
      };

      db.users.set(userId, newUser);
      db.tokenHashMap.set(tokenHash, userId);

      if (isMongoConnected) {
        UserModel.create(newUser).catch(err => console.error('MongoDB UserModel.create error:', err));
      }

      // Auto-add to demo server
      const genServer = db.servers.get('srv_general_01');
      if (genServer) {
        if (!genServer.members.some(m => m.userId === userId)) {
          genServer.members.push({
            userId,
            role: 'member',
            joinedAt: new Date().toISOString(),
          });
        }
      }

      return res.json({ success: true, user: newUser });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Błąd serwera przy rejestracji' });
    }
  });

  // REST API: Login
  app.post('/api/auth/login', (req, res) => {
    try {
      const { token } = req.body || {};
      if (!token) {
        return res.status(400).json({ success: false, error: 'Wymagany token' });
      }

      const tokenHash = computeSha256(token);
      const userId = db.tokenHashMap.get(tokenHash);

      if (!userId) {
        return res.status(400).json({ success: false, error: 'Nieprawidłowy token konta. Sprawdź wpisany token.' });
      }

      const user = db.users.get(userId);
      return res.json({ success: true, userId, user });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Błąd logowania' });
    }
  });

  // ==========================================
  // SOCKET.IO REAL-TIME SIGNALING & MESSAGING
  // ==========================================

  // Authentication Middleware for Socket Connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      // Allow unauthenticated connection for registration
      return next();
    }
    const tokenHash = computeSha256(token);
    const userId = db.tokenHashMap.get(tokenHash);
    if (userId) {
      (socket as any).userId = userId;
    }
    next();
  });

  io.on('connection', (socket: Socket) => {
    let currentUserId = (socket as any).userId;

    // Helper to send state to user
    const sendUserState = (userId: string) => {
      const user = db.users.get(userId);
      if (!user) return;

      // Map friends details
      const friendsDetailed = user.friends.map(f => {
        const friendUser = db.users.get(f.userId);
        return {
          userId: f.userId,
          status: f.status,
          updatedAt: f.updatedAt,
          user: friendUser
            ? {
                id: friendUser.id,
                displayName: friendUser.displayName,
                userTag: friendUser.userTag,
                ecdhPublicKeyJwk: friendUser.ecdhPublicKey,
                status: db.userSocketMap.has(friendUser.id) ? 'online' : 'offline',
                createdAt: friendUser.createdAt,
              }
            : undefined,
        };
      });

      // Servers joined
      const userServers = Array.from(db.servers.values()).filter(
        s => s.ownerId === userId || s.members.some(m => m.userId === userId) || s.id === 'srv_general_01'
      );

      socket.emit('auth:state', {
        user: {
          id: user.id,
          displayName: user.displayName,
          userTag: user.userTag,
          tokenHash: user.tokenHash,
          ecdhPublicKeyJwk: user.ecdhPublicKey,
          status: 'online',
          createdAt: user.createdAt,
        },
        friends: friendsDetailed,
        servers: userServers,
      });
    };

    if (currentUserId) {
      db.socketUserMap.set(socket.id, currentUserId);
      db.userSocketMap.set(currentUserId, socket.id);
      
      // Auto-join user to general server members if not already
      const genServer = db.servers.get('srv_general_01');
      if (genServer && !genServer.members.some(m => m.userId === currentUserId)) {
        genServer.members.push({
          userId: currentUserId,
          role: 'member',
          joinedAt: new Date().toISOString(),
        });
      }

      sendUserState(currentUserId);
      io.emit('user:presence', { userId: currentUserId, status: 'online' });
    }

    // 1. REGISTER USER WITH STATELESS TOKEN
    socket.on('auth:register', (data: { token: string; displayName: string; ecdhPublicKeyJwk: string }, callback) => {
      try {
        if (!data.token || !data.displayName || !data.ecdhPublicKeyJwk) {
          return callback({ success: false, error: 'Nieprawidłowe dane rejestracji' });
        }

        const tokenHash = computeSha256(data.token);
        if (db.tokenHashMap.has(tokenHash)) {
          return callback({ success: false, error: 'Ten token jest już powiązany z kontem' });
        }

        const userId = 'usr_' + crypto.randomBytes(8).toString('hex');
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const userTag = `${data.displayName.trim()}#${randomNum}`;

        const newUser: UserStore = {
          id: userId,
          tokenHash,
          displayName: data.displayName.trim(),
          userTag,
          ecdhPublicKey: data.ecdhPublicKeyJwk,
          status: 'online',
          friends: [],
          createdAt: new Date().toISOString(),
        };

        db.users.set(userId, newUser);
        db.tokenHashMap.set(tokenHash, userId);

        if (isMongoConnected) {
          UserModel.create(newUser).catch(err => console.error('MongoDB UserModel.create error:', err));
        }

        // Auto-add to demo server
        const genServer = db.servers.get('srv_general_01');
        if (genServer) {
          genServer.members.push({
            userId,
            role: 'member',
            joinedAt: new Date().toISOString(),
          });
        }

        currentUserId = userId;
        (socket as any).userId = userId;
        db.socketUserMap.set(socket.id, userId);
        db.userSocketMap.set(userId, socket.id);

        sendUserState(userId);
        io.emit('user:presence', { userId, status: 'online' });

        callback({ success: true, user: newUser });
      } catch (err: any) {
        callback({ success: false, error: err?.message || 'Błąd serwera przy rejestracji' });
      }
    });

    // 2. LOGIN USER WITH STATELESS TOKEN
    socket.on('auth:login', (data: { token: string }, callback) => {
      try {
        if (!data.token) {
          return callback({ success: false, error: 'Wymagany token' });
        }

        const tokenHash = computeSha256(data.token);
        const userId = db.tokenHashMap.get(tokenHash);

        if (!userId) {
          return callback({ success: false, error: 'Nieprawidłowy token autoryzacyjny' });
        }

        currentUserId = userId;
        (socket as any).userId = userId;
        db.socketUserMap.set(socket.id, userId);
        db.userSocketMap.set(userId, socket.id);

        sendUserState(userId);
        io.emit('user:presence', { userId, status: 'online' });

        callback({ success: true, userId });
      } catch (err: any) {
        callback({ success: false, error: err?.message || 'Błąd logowania' });
      }
    });

    // 3. EDIT PROFILE (Change Display Name without changing keys/token)
    socket.on('user:update_profile', (data: { displayName: string }, callback) => {
      if (!currentUserId) return callback?.({ success: false, error: 'Brak autoryzacji' });
      const user = db.users.get(currentUserId);
      if (!user) return callback?.({ success: false, error: 'Nie znaleziono użytkownika' });

      if (!data.displayName || data.displayName.trim().length < 2) {
        return callback?.({ success: false, error: 'Nazwa musi mieć co najmniej 2 znaki' });
      }

      const tagNumber = user.userTag.split('#')[1] || '1337';
      user.displayName = data.displayName.trim();
      user.userTag = `${user.displayName}#${tagNumber}`;

      if (isMongoConnected) {
        UserModel.updateOne({ id: user.id }, { displayName: user.displayName, userTag: user.userTag }).catch(err => console.error('MongoDB profile update error:', err));
      }

      sendUserState(currentUserId);
      callback?.({ success: true, user });
    });

    // 4. FRIEND REQUEST SYSTEM (Send, Accept, Decline, Remove)
    socket.on('friend:request', (data: { targetUserTag: string }, callback) => {
      if (!currentUserId) return callback?.({ success: false, error: 'Brak autoryzacji' });
      const currentUser = db.users.get(currentUserId);
      if (!currentUser) return;

      const targetTag = data.targetUserTag.trim();
      if (targetTag === currentUser.userTag) {
        return callback?.({ success: false, error: 'Nie możesz wysłać zaproszenia do samego siebie' });
      }

      const targetUser = Array.from(db.users.values()).find(u => u.userTag.toLowerCase() === targetTag.toLowerCase());
      if (!targetUser) {
        return callback?.({ success: false, error: 'Nie znaleziono użytkownika o takim kodzie' });
      }

      // Check existing relation
      const existingInSelf = currentUser.friends.find(f => f.userId === targetUser.id);
      if (existingInSelf) {
        return callback?.({ success: false, error: 'Relacja ze znajomym już istnieje' });
      }

      currentUser.friends.push({
        userId: targetUser.id,
        status: 'pending_sent',
        updatedAt: new Date().toISOString(),
      });

      targetUser.friends.push({
        userId: currentUser.id,
        status: 'pending_received',
        updatedAt: new Date().toISOString(),
      });

      sendUserState(currentUser.id);

      // Notify target if online
      const targetSocketId = db.userSocketMap.get(targetUser.id);
      if (targetSocketId) {
        io.to(targetSocketId).emit('friend:incoming', {
          fromUser: {
            id: currentUser.id,
            displayName: currentUser.displayName,
            userTag: currentUser.userTag,
            ecdhPublicKeyJwk: currentUser.ecdhPublicKey,
          },
        });
        // refresh target state
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          const tUser = db.users.get(targetUser.id);
          if (tUser) sendUserState(targetUser.id);
        }
      }

      callback?.({ success: true, targetUserTag: targetUser.userTag });
    });

    socket.on('friend:accept', (data: { targetUserId: string }, callback) => {
      if (!currentUserId) return callback?.({ success: false, error: 'Brak autoryzacji' });
      const currentUser = db.users.get(currentUserId);
      const targetUser = db.users.get(data.targetUserId);
      if (!currentUser || !targetUser) return callback?.({ success: false, error: 'Błąd użytkownika' });

      const relSelf = currentUser.friends.find(f => f.userId === targetUser.id);
      const relTarget = targetUser.friends.find(f => f.userId === currentUser.id);

      if (relSelf) relSelf.status = 'accepted';
      if (relTarget) relTarget.status = 'accepted';

      sendUserState(currentUser.id);

      const targetSocketId = db.userSocketMap.get(targetUser.id);
      if (targetSocketId) {
        sendUserState(targetUser.id);
      }

      callback?.({ success: true });
    });

    socket.on('friend:decline', (data: { targetUserId: string }, callback) => {
      if (!currentUserId) return callback?.({ success: false, error: 'Brak autoryzacji' });
      const currentUser = db.users.get(currentUserId);
      const targetUser = db.users.get(data.targetUserId);

      if (currentUser) {
        currentUser.friends = currentUser.friends.filter(f => f.userId !== data.targetUserId);
        sendUserState(currentUser.id);
      }
      if (targetUser) {
        targetUser.friends = targetUser.friends.filter(f => f.userId !== currentUserId);
        const targetSocketId = db.userSocketMap.get(targetUser.id);
        if (targetSocketId) sendUserState(targetUser.id);
      }

      callback?.({ success: true });
    });

    // 5. SERVER / GROUP CREATION WITH DEFAULT CHANNELS
    socket.on('server:create', (data: { name: string; icon?: string }, callback) => {
      if (!currentUserId) return callback?.({ success: false, error: 'Brak autoryzacji' });
      if (!data.name || data.name.trim().length < 2) {
        return callback?.({ success: false, error: 'Nazwa grupy musi mieć co najmniej 2 znaki' });
      }

      const serverId = 'srv_' + crypto.randomBytes(6).toString('hex');
      const textChId = 'chn_' + crypto.randomBytes(6).toString('hex');
      const voiceChId = 'chn_' + crypto.randomBytes(6).toString('hex');

      const textChannel: ChannelStore = {
        id: textChId,
        serverId,
        name: 'ogólny',
        type: 'text',
        topic: 'Domyślny kanał tekstowy E2EE',
        createdBy: currentUserId,
        createdAt: new Date().toISOString(),
      };

      const voiceChannel: ChannelStore = {
        id: voiceChId,
        serverId,
        name: 'Głosowy 1',
        type: 'voice',
        topic: 'Pojemny kanał głosowy WebRTC Mesh',
        createdBy: currentUserId,
        createdAt: new Date().toISOString(),
      };

      const newServer: ServerStore = {
        id: serverId,
        name: data.name.trim(),
        icon: data.icon || '🛡️',
        ownerId: currentUserId,
        members: [
          {
            userId: currentUserId,
            role: 'owner',
            joinedAt: new Date().toISOString(),
          },
        ],
        channels: [textChannel, voiceChannel],
        createdAt: new Date().toISOString(),
      };

      db.servers.set(serverId, newServer);
      db.channels.set(textChId, textChannel);
      db.channels.set(voiceChId, voiceChannel);

      if (isMongoConnected) {
        ServerModel.create(newServer).catch(err => console.error('MongoDB ServerModel.create error:', err));
      }

      sendUserState(currentUserId);
      callback?.({ success: true, server: newServer });
    });

    // 5b. CREATE CHANNEL ON A SERVER (TEXT OR VOICE)
    socket.on('channel:create', (data: { serverId: string; name: string; type: 'text' | 'voice'; topic?: string }, callback) => {
      if (!currentUserId) return callback?.({ success: false, error: 'Brak autoryzacji' });
      if (!data.serverId || !data.name || data.name.trim().length < 1) {
        return callback?.({ success: false, error: 'Nazwa kanału jest wymagana' });
      }

      const serverObj = db.servers.get(data.serverId);
      if (!serverObj) {
        return callback?.({ success: false, error: 'Nie znaleziono serwera' });
      }

      const channelId = 'chn_' + crypto.randomBytes(6).toString('hex');
      const cleanName = data.name.trim().toLowerCase().replace(/\s+/g, '-');
      const newChannel: ChannelStore = {
        id: channelId,
        serverId: data.serverId,
        name: cleanName,
        type: data.type === 'voice' ? 'voice' : 'text',
        topic: data.topic || (data.type === 'voice' ? 'Kanał głosowy WebRTC' : 'Kanał tekstowy'),
        createdBy: currentUserId,
        createdAt: new Date().toISOString(),
      };

      serverObj.channels.push(newChannel);
      db.channels.set(channelId, newChannel);

      if (isMongoConnected) {
        ServerModel.updateOne({ id: data.serverId }, { channels: serverObj.channels })
          .catch(err => console.error('MongoDB channel creation update error:', err));
      }

      // Refresh state for all online users connected to this server or room
      for (const [sId, uId] of db.socketUserMap.entries()) {
        sendUserState(uId);
      }

      callback?.({ success: true, channel: newChannel });
    });

    // 6. E2EE CHAT MESSAGING (Relays & Stores ONLY CIPHERTEXT)
    socket.on('chat:send_message', (data: {
      serverId?: string;
      channelId?: string;
      recipientId?: string;
      ciphertext: string;
      iv: string;
      keyAlgorithm?: string;
    }, callback) => {
      if (!currentUserId) return callback?.({ success: false, error: 'Brak autoryzacji' });
      const sender = db.users.get(currentUserId);
      if (!sender) return callback?.({ success: false, error: 'Nie odnaleziono nadawcy' });

      if (!data.ciphertext || !data.iv) {
        return callback?.({ success: false, error: 'Brak zaszyfrowanego ładunku (ciphertext)' });
      }

      const newMsg: MessageStore = {
        id: 'msg_' + crypto.randomBytes(8).toString('hex'),
        serverId: data.serverId,
        channelId: data.channelId,
        recipientId: data.recipientId,
        senderId: currentUserId,
        senderName: sender.displayName,
        ciphertext: data.ciphertext,
        iv: data.iv,
        keyAlgorithm: data.keyAlgorithm || 'AES-GCM-256',
        timestamp: new Date().toISOString(),
      };

      db.messages.push(newMsg);

      if (isMongoConnected) {
        MessageModel.create(newMsg).catch(err => console.error('MongoDB MessageModel.create error:', err));
      }

      // Broadcast to channel or DM recipient
      if (data.channelId) {
        io.emit(`chat:channel:${data.channelId}`, newMsg);
      } else if (data.recipientId) {
        // Send to recipient
        const targetSocketId = db.userSocketMap.get(data.recipientId);
        if (targetSocketId) {
          io.to(targetSocketId).emit(`chat:dm:${currentUserId}`, newMsg);
        }
        // Send to sender so sender UI updates
        socket.emit(`chat:dm:${data.recipientId}`, newMsg);
      }

      callback?.({ success: true, message: newMsg });
    });

    socket.on('chat:get_history', (data: { channelId?: string; recipientId?: string }, callback) => {
      if (!currentUserId) return callback?.({ success: false, error: 'Brak autoryzacji' });

      let history: MessageStore[] = [];
      if (data.channelId) {
        history = db.messages.filter(m => m.channelId === data.channelId);
      } else if (data.recipientId) {
        history = db.messages.filter(
          m => (m.senderId === currentUserId && m.recipientId === data.recipientId) ||
               (m.senderId === data.recipientId && m.recipientId === currentUserId)
        );
      }

      callback?.({ success: true, history: history.slice(-100) });
    });

    // ==========================================
    // KROK 4: WEBRTC SIGNALING (P2P 1-ON-1 & MESH VOICE CHANNELS)
    // ==========================================

    // A) 1-ON-1 DIRECT CALL SIGNALING
    socket.on('call:initiate', (data: { targetUserId: string; callType: 'audio' | 'video' }, callback) => {
      if (!currentUserId) return callback?.({ success: false, error: 'Brak autoryzacji' });
      const caller = db.users.get(currentUserId);
      const targetSocketId = db.userSocketMap.get(data.targetUserId);

      if (!targetSocketId || !caller) {
        return callback?.({ success: false, error: 'Użytkownik nie jest obecnie dostępny online' });
      }

      io.to(targetSocketId).emit('call:incoming', {
        callerId: currentUserId,
        callerName: caller.displayName,
        callerTag: caller.userTag,
        callType: data.callType,
      });

      callback?.({ success: true });
    });

    socket.on('call:response', (data: { callerId: string; accepted: boolean }) => {
      if (!currentUserId) return;
      const callerSocketId = db.userSocketMap.get(data.callerId);
      if (callerSocketId) {
        io.to(callerSocketId).emit('call:answered', {
          responderId: currentUserId,
          accepted: data.accepted,
        });
      }
    });

    socket.on('call:signal', (data: { targetUserId: string; sdp?: any; candidate?: any; type: string }) => {
      if (!currentUserId) return;
      const targetSocketId = db.userSocketMap.get(data.targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('call:signal', {
          senderId: currentUserId,
          sdp: data.sdp,
          candidate: data.candidate,
          type: data.type,
        });
      }
    });

    socket.on('call:hangup', (data: { targetUserId: string }) => {
      if (!currentUserId) return;
      const targetSocketId = db.userSocketMap.get(data.targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('call:hangup', { senderId: currentUserId });
      }
    });

    // B) GROUP VOICE CHANNEL WEBRTC SIGNALING (MESH TOPOLOGY)
    socket.on('voice:join', (data: { channelId: string; isMuted?: boolean; isVideoOn?: boolean }, callback) => {
      if (!currentUserId) return callback?.({ success: false, error: 'Brak autoryzacji' });
      const user = db.users.get(currentUserId);
      if (!user) return callback?.({ success: false, error: 'Użytkownik nie istnieje' });

      const channelId = data.channelId;
      if (!db.voiceChannels.has(channelId)) {
        db.voiceChannels.set(channelId, new Map());
      }

      const participants = db.voiceChannels.get(channelId)!;

      // Existing peers list before joining
      const existingPeers = Array.from(participants.entries()).map(([pUserId, pData]) => ({
        userId: pUserId,
        socketId: pData.socketId,
        displayName: pData.displayName,
        isMuted: pData.isMuted,
        isDeafened: pData.isDeafened,
        isVideoOn: pData.isVideoOn,
      }));

      // Add user to channel
      participants.set(currentUserId, {
        socketId: socket.id,
        displayName: user.displayName,
        isMuted: !!data.isMuted,
        isDeafened: false,
        isVideoOn: !!data.isVideoOn,
      });

      socket.join(`voice_room_${channelId}`);

      // Notify existing channel participants that a new peer joined
      socket.to(`voice_room_${channelId}`).emit('voice:user_joined', {
        userId: currentUserId,
        displayName: user.displayName,
        isMuted: !!data.isMuted,
        isVideoOn: !!data.isVideoOn,
      });

      callback?.({ success: true, existingPeers });
    });

    socket.on('voice:signal', (data: { targetUserId: string; channelId: string; sdp?: any; candidate?: any }) => {
      if (!currentUserId) return;
      const targetSocketId = db.userSocketMap.get(data.targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('voice:signal', {
          senderId: currentUserId,
          channelId: data.channelId,
          sdp: data.sdp,
          candidate: data.candidate,
        });
      }
    });

    socket.on('voice:toggle_state', (data: { channelId: string; isMuted: boolean; isVideoOn: boolean }) => {
      if (!currentUserId) return;
      const participants = db.voiceChannels.get(data.channelId);
      if (participants && participants.has(currentUserId)) {
        const p = participants.get(currentUserId)!;
        p.isMuted = data.isMuted;
        p.isVideoOn = data.isVideoOn;

        io.to(`voice_room_${data.channelId}`).emit('voice:peer_state_changed', {
          userId: currentUserId,
          isMuted: data.isMuted,
          isVideoOn: data.isVideoOn,
        });
      }
    });

    socket.on('voice:leave', (data: { channelId: string }) => {
      if (!currentUserId) return;
      const participants = db.voiceChannels.get(data.channelId);
      if (participants) {
        participants.delete(currentUserId);
        socket.leave(`voice_room_${data.channelId}`);
        io.to(`voice_room_${data.channelId}`).emit('voice:user_left', { userId: currentUserId });
      }
    });

    // Handle Socket Disconnect
    socket.on('disconnect', () => {
      if (currentUserId) {
        db.socketUserMap.delete(socket.id);
        db.userSocketMap.delete(currentUserId);

        // Remove from voice channels
        db.voiceChannels.forEach((participants, chId) => {
          if (participants.has(currentUserId)) {
            participants.delete(currentUserId);
            io.to(`voice_room_${chId}`).emit('voice:user_left', { userId: currentUserId });
          }
        });

        io.emit('user:presence', { userId: currentUserId, status: 'offline' });
      }
    });
  });

  // Vite Integration for Development & Production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Aether E2EE Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startAppServer().catch(err => {
  console.error('Fatal Server Error:', err);
});
