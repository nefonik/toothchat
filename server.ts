import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import {
  connectToMongoDB,
  UserModel,
  ServerModel,
  ChannelModel,
  MessageModel,
} from './api/_db';

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
  text?: string;
  ciphertext?: string;
  iv?: string;
  keyAlgorithm?: string;
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

// Helper to ensure MongoDB Atlas is connected
async function ensureMongoConnected(): Promise<boolean> {
  if (mongoose.connection.readyState === 1) {
    isMongoConnected = true;
    return true;
  }
  try {
    const ok = await connectToMongoDB();
    isMongoConnected = ok;
    return ok;
  } catch (err) {
    console.error('[MongoDB ensureMongoConnected Error]', err);
    isMongoConnected = false;
    return false;
  }
}

async function startAppServer() {
  // Connect to MongoDB Atlas
  try {
    isMongoConnected = await ensureMongoConnected();
  } catch (err) {
    console.error('[MongoDB Startup Error]', err);
    isMongoConnected = false;
  }
  if (isMongoConnected) {
    try {
      // 1. Ensure Demo Server and its default channels are persisted to MongoDB Atlas if not already present
      const existingDemoServer = await ServerModel.findOne({ id: 'srv_general_01' });
      if (!existingDemoServer) {
        const defaultServer = db.servers.get('srv_general_01');
        if (defaultServer) {
          await ServerModel.create(defaultServer);
          for (const ch of defaultServer.channels) {
            await ChannelModel.findOneAndUpdate(
              { id: ch.id },
              ch,
              { upsert: true, new: true }
            );
          }
        }
      }

      // 2. Load users from MongoDB Atlas
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

      // 3. Load channels from MongoDB Atlas
      const dbChannels = await ChannelModel.find({});
      for (const ch of dbChannels) {
        const chObj: ChannelStore = {
          id: ch.id,
          serverId: ch.serverId,
          name: ch.name,
          type: ch.type as any,
          topic: ch.topic,
          createdBy: ch.createdBy,
          createdAt: ch.createdAt || new Date().toISOString(),
        };
        db.channels.set(ch.id, chObj);
      }

      // 4. Load servers from MongoDB Atlas
      const servers = await ServerModel.find({});
      for (const s of servers) {
        const sObj: ServerStore = {
          id: s.id,
          name: s.name,
          icon: s.icon || '🛡️',
          ownerId: s.ownerId,
          members: (s.members || []).map((m: any) => ({
            userId: m.userId,
            role: m.role as any,
            joinedAt: m.joinedAt || new Date().toISOString(),
            encryptedGroupKey: m.encryptedGroupKey,
          })),
          channels: (s.channels || []).map((c: any) => ({
            id: c.id,
            serverId: c.serverId || s.id,
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

      // 5. Load messages from MongoDB Atlas
      const msgs = await MessageModel.find({}).sort({ timestamp: 1 }).limit(2000);
      for (const m of msgs) {
        if (!db.messages.some(ex => ex.id === m.id)) {
          db.messages.push({
            id: m.id,
            serverId: m.serverId,
            channelId: m.channelId,
            recipientId: m.recipientId,
            senderId: m.senderId,
            senderName: m.senderName,
            text: m.text || m.ciphertext || '',
            ciphertext: m.ciphertext || m.text || '',
            iv: m.iv || '',
            keyAlgorithm: m.keyAlgorithm || 'PLAIN',
            timestamp: m.timestamp || new Date().toISOString(),
          });
        }
      }
      console.log(`[MongoDB Sync] Synchronized ${users.length} users, ${servers.length} servers, ${dbChannels.length} channels, ${msgs.length} messages from Atlas.`);
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
  app.get('/api/health', async (req, res) => {
    const mongoOk = await ensureMongoConnected();
    res.json({
      status: 'ok',
      mongoDbConnected: mongoOk,
      activeUsers: db.users.size,
      onlineUsers: db.socketUserMap.size,
      activeServers: db.servers.size,
      totalMessages: db.messages.length,
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
  app.post('/api/auth/register', async (req, res) => {
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
        ecdhPublicKey: typeof ecdhPublicKeyJwk === 'object' ? JSON.stringify(ecdhPublicKeyJwk) : String(ecdhPublicKeyJwk || ''),
        status: 'online',
        friends: [],
        createdAt: new Date().toISOString(),
      };

      db.users.set(userId, newUser);
      db.tokenHashMap.set(tokenHash, userId);

      const hasMongo = await ensureMongoConnected();
      if (hasMongo) {
        try {
          await UserModel.findOneAndUpdate({ id: userId }, newUser, { upsert: true, new: true });
          console.log('[MongoDB Atlas] Saved new user:', newUser.id);
        } catch (err) {
          console.error('MongoDB UserModel save error:', err);
        }
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

  // Helper to get user by tokenHash with MongoDB dynamic lookup fallback
  async function getUserByTokenHash(tokenHash: string): Promise<UserStore> {
    const existingUserId = db.tokenHashMap.get(tokenHash);
    if (existingUserId) {
      const u = db.users.get(existingUserId);
      if (u) return u;
    }

    const hasMongo = await ensureMongoConnected();
    if (hasMongo) {
      try {
        const u = await UserModel.findOne({ tokenHash });
        if (u) {
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
          return uObj;
        }
      } catch (e) {
        console.error('[MongoDB getUserByTokenHash error]', e);
      }
    }

    // Auto-provision user if unknown tokenHash (e.g. after server restart or static auth fallback)
    const userId = 'usr_' + computeSha256(tokenHash).substring(0, 12);
    const randomTag = Math.floor(1000 + Math.random() * 9000);
    const userTag = `Użytkownik#${randomTag}`;
    const dummyKey = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'dummy', y: 'dummy' });
    const autoUser: UserStore = {
      id: userId,
      tokenHash,
      displayName: 'Użytkownik',
      userTag,
      ecdhPublicKey: dummyKey,
      status: 'online',
      friends: [],
      createdAt: new Date().toISOString(),
    };
    db.users.set(userId, autoUser);
    db.tokenHashMap.set(tokenHash, userId);

    const genServer = db.servers.get('srv_general_01');
    if (genServer && !genServer.members.some(m => m.userId === userId)) {
      genServer.members.push({ userId, role: 'member', joinedAt: new Date().toISOString() });
    }

    if (hasMongo) {
      UserModel.findOneAndUpdate({ id: autoUser.id }, autoUser, { upsert: true, new: true }).catch((err: any) => console.error('MongoDB autoUser save error:', err));
    }

    return autoUser;
  }

  // REST API: Login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { token } = req.body || {};
      if (!token || typeof token !== 'string' || !token.trim()) {
        return res.status(400).json({ success: false, error: 'Wymagany token konta.' });
      }

      const cleanToken = token.trim();
      const tokenHash = computeSha256(cleanToken);
      const user = await getUserByTokenHash(tokenHash);

      if (!user) {
        return res.status(401).json({ success: false, error: 'Nieprawidłowy token konta. Użytkownik nie istnieje.' });
      }

      return res.json({ success: true, userId: user.id, user });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Błąd logowania' });
    }
  });

  // REST API: Get Messages History
  app.get('/api/messages', async (req, res) => {
    try {
      const rawCh = req.query.channelId as string;
      const rawRec = req.query.recipientId as string;
      const channelId = (!rawCh || rawCh === 'undefined' || rawCh === 'null') ? '' : rawCh;
      const recipientId = (!rawRec || rawRec === 'undefined' || rawRec === 'null') ? '' : rawRec;
      const targetChannelId = channelId || (recipientId ? `dm_${recipientId}` : 'chn_general_text');

      console.log('📡 [REST GET /api/messages] Requesting history for target:', targetChannelId);

      const hasMongo = await ensureMongoConnected();
      let history: MessageStore[] = [];

      if (hasMongo) {
        try {
          const queryConditions: any[] = [{ channelId: targetChannelId }];
          if (channelId) queryConditions.push({ channelId });
          if (recipientId) queryConditions.push({ recipientId });
          if (targetChannelId === 'chn_general_text') {
            queryConditions.push({ channelId: { $in: ['chn_general_text', '', null] } });
          }

          const mongoMsgs = await MessageModel.find({
            $or: queryConditions,
          }).sort({ timestamp: 1 }).limit(500);

          history = mongoMsgs.map((m: any) => ({
            id: m.id,
            serverId: m.serverId || 'srv_general_01',
            channelId: m.channelId || targetChannelId,
            recipientId: m.recipientId,
            senderId: m.senderId || 'usr_anonymous',
            senderName: m.senderName || 'Użytkownik',
            text: m.text || m.ciphertext || '',
            ciphertext: m.ciphertext || m.text || '',
            iv: m.iv || '',
            keyAlgorithm: m.keyAlgorithm || 'PLAIN',
            timestamp: m.timestamp || new Date().toISOString(),
          }));

          // Sync into db.messages memory store
          for (const mObj of history) {
            const exIdx = db.messages.findIndex(ex => ex.id === mObj.id);
            if (exIdx >= 0) db.messages[exIdx] = mObj;
            else db.messages.push(mObj);
          }
        } catch (e) {
          console.error('[REST GET /api/messages MongoDB Error]', e);
        }
      }

      if (history.length === 0) {
        history = db.messages.filter(m =>
          m.channelId === targetChannelId || m.channelId === channelId || (recipientId && m.recipientId === recipientId)
        );
      }

      history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      return res.json({ success: true, history });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Błąd pobierania historii' });
    }
  });

  // REST API: Send Message
  app.post('/api/messages', async (req, res) => {
    try {
      const { token, serverId, channelId: rawCh, recipientId: rawRec, text, ciphertext, iv, keyAlgorithm, senderId, senderName } = req.body || {};
      const channelId = (!rawCh || rawCh === 'undefined' || rawCh === 'null') ? '' : rawCh;
      const recipientId = (!rawRec || rawRec === 'undefined' || rawRec === 'null') ? '' : rawRec;
      const cleanToken = (token || req.headers.authorization?.replace('Bearer ', '') || '').trim();

      let user = cleanToken ? await getUserByTokenHash(computeSha256(cleanToken)) : undefined;

      const hasMongo = await ensureMongoConnected();

      if (!user && cleanToken) {
        const tokenHash = computeSha256(cleanToken);
        const newUserId = senderId || ('usr_' + crypto.randomBytes(6).toString('hex'));
        const newDisplayName = senderName || 'Użytkownik';
        user = {
          id: newUserId,
          tokenHash,
          displayName: newDisplayName,
          userTag: newDisplayName + '#' + Math.floor(1000 + Math.random() * 9000),
          ecdhPublicKey: '',
          status: 'online',
          friends: [],
          createdAt: new Date().toISOString(),
        };
        db.users.set(newUserId, user);
        if (hasMongo) {
          try {
            await UserModel.findOneAndUpdate({ id: newUserId }, user, { upsert: true, new: true });
          } catch (e) {
            console.warn('[Auto User Creation Error]', e);
          }
        }
      }

      const msgText = (text || ciphertext || '').trim();
      if (!msgText) {
        return res.status(400).json({ success: false, error: 'Treść wiadomości nie może być pusta' });
      }

      const targetChannelId = channelId || (recipientId ? `dm_${recipientId}` : 'chn_general_text');
      const targetServerId = serverId || (channelId ? 'srv_general_01' : undefined);

      const finalSenderId = user?.id || senderId || ('usr_' + crypto.randomBytes(6).toString('hex'));
      const finalSenderName = user?.displayName || senderName || 'Użytkownik';

      const newMsg: MessageStore = {
        id: req.body.id || ('msg_' + crypto.randomBytes(8).toString('hex')),
        serverId: targetServerId || 'srv_general_01',
        channelId: targetChannelId,
        recipientId: recipientId || undefined,
        senderId: finalSenderId,
        senderName: finalSenderName,
        text: msgText,
        ciphertext: ciphertext || msgText,
        iv: iv || '',
        keyAlgorithm: keyAlgorithm || 'PLAIN',
        timestamp: new Date().toISOString(),
      };

      const existingIdx = db.messages.findIndex(m => m.id === newMsg.id);
      if (existingIdx >= 0) {
        db.messages[existingIdx] = newMsg;
      } else {
        db.messages.push(newMsg);
      }

      if (hasMongo) {
        try {
          console.log('💾 [REST MongoDB WRITE START] Saving message to Atlas:', newMsg.id);
          const cleanMsgForMongo = JSON.parse(JSON.stringify(newMsg));
          const savedDoc = await MessageModel.findOneAndUpdate(
            { id: newMsg.id },
            { $set: cleanMsgForMongo },
            { upsert: true, new: true }
          );
          console.log('✅ [REST MongoDB WRITE SUCCESS] Saved message to Atlas:', savedDoc?.id || newMsg.id);
        } catch (e: any) {
          console.error('❌ [REST MongoDB WRITE ERROR]', e?.message || e);
        }
      }

      // Broadcast via Socket.io
      io.emit('message:received', newMsg);
      if (targetChannelId) {
        io.to(targetChannelId).emit('message:received', newMsg);
        io.emit(`chat:channel:${targetChannelId}`, newMsg);
      }

      return res.json({ success: true, message: newMsg });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Błąd wysyłania wiadomości' });
    }
  });

  // ==========================================
  // SOCKET.IO REAL-TIME SIGNALING & MESSAGING
  // ==========================================

  // Authentication Middleware for Socket Connections
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      // Allow unauthenticated connection for registration
      return next();
    }
    const tokenHash = computeSha256(String(token).trim());
    const user = await getUserByTokenHash(tokenHash);
    if (user) {
      (socket as any).userId = user.id;
    }
    next();
  });

  io.on('connection', (socket: Socket) => {
    let currentUserId: string | undefined;

    const getSocketUserId = async (providedToken?: string): Promise<string | undefined> => {
      let uid = (socket as any).userId || db.socketUserMap.get(socket.id);
      if (uid) {
        currentUserId = uid;
        return uid;
      }

      const token = providedToken || socket.handshake.auth?.token || socket.handshake.query?.token;
      if (token && String(token).trim().length > 0) {
        const cleanToken = String(token).trim();
        const tokenHash = computeSha256(cleanToken);
        const user = await getUserByTokenHash(tokenHash);
        if (user) {
          (socket as any).userId = user.id;
          db.socketUserMap.set(socket.id, user.id);
          db.userSocketMap.set(user.id, socket.id);
          currentUserId = user.id;
          return user.id;
        }
      }
      return undefined;
    };

    getSocketUserId().then(uid => {
      if (uid) {
        currentUserId = uid;
        db.socketUserMap.set(socket.id, uid);
        db.userSocketMap.set(uid, socket.id);

        const genServer = db.servers.get('srv_general_01');
        if (genServer && !genServer.members.some(m => m.userId === uid)) {
          genServer.members.push({
            userId: uid,
            role: 'member',
            joinedAt: new Date().toISOString(),
          });
        }

        sendUserState(uid);
        io.emit('user:presence', { userId: uid, status: 'online' });
      }
    });

    // Helper to send state to user
    const sendUserState = async (userId: string) => {
      const user = db.users.get(userId);
      if (!user) return;

      // Map friends details with Mongo async fallback
      const friendsDetailed = await Promise.all(
        user.friends.map(async f => {
          let friendUser = db.users.get(f.userId);
          if (!friendUser && isMongoConnected) {
            try {
              const mu = await UserModel.findOne({ id: f.userId });
              if (mu) {
                friendUser = {
                  id: mu.id,
                  tokenHash: mu.tokenHash,
                  displayName: mu.displayName,
                  userTag: mu.userTag,
                  ecdhPublicKey: mu.ecdhPublicKey,
                  status: 'offline',
                  friends: (mu.friends || []).map((x: any) => ({
                    userId: x.userId,
                    status: x.status as any,
                    updatedAt: x.updatedAt || new Date().toISOString(),
                  })),
                  createdAt: mu.createdAt || new Date().toISOString(),
                };
                db.users.set(friendUser.id, friendUser);
              }
            } catch (err) {
              console.error('[sendUserState Mongo lookup error]', err);
            }
          }

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
        })
      );

      // Servers joined - merge channels from db.channels
      const userServers = Array.from(db.servers.values())
        .filter(s => s.ownerId === userId || s.members.some(m => m.userId === userId) || s.id === 'srv_general_01')
        .map(s => {
          const channels = Array.from(db.channels.values()).filter(c => c.serverId === s.id);
          return {
            ...s,
            channels: channels.length > 0 ? channels : s.channels,
          };
        });

      const payload = {
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
      };

      const targetSocketId = db.userSocketMap.get(userId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('auth:state', payload);
      } else if ((socket as any).userId === userId || currentUserId === userId) {
        socket.emit('auth:state', payload);
      }
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
          ecdhPublicKey: typeof data.ecdhPublicKeyJwk === 'object' ? JSON.stringify(data.ecdhPublicKeyJwk) : String(data.ecdhPublicKeyJwk || ''),
          status: 'online',
          friends: [],
          createdAt: new Date().toISOString(),
        };

        db.users.set(userId, newUser);
        db.tokenHashMap.set(tokenHash, userId);

        if (isMongoConnected) {
          UserModel.findOneAndUpdate({ id: userId }, newUser, { upsert: true, new: true }).catch(err => console.error('MongoDB UserModel save error:', err));
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
    socket.on('auth:login', async (data: { token: string }, callback) => {
      try {
        if (!data.token || typeof data.token !== 'string' || !data.token.trim()) {
          return callback({ success: false, error: 'Wymagany token' });
        }

        const cleanToken = data.token.trim();
        const tokenHash = computeSha256(cleanToken);
        const user = await getUserByTokenHash(tokenHash);

        if (!user) {
          return callback({ success: false, error: 'Nieprawidłowy token autoryzacyjny' });
        }

        const userId = user.id;
        currentUserId = userId;
        (socket as any).userId = userId;
        db.socketUserMap.set(socket.id, userId);
        db.userSocketMap.set(userId, socket.id);

        sendUserState(userId);
        io.emit('user:presence', { userId, status: 'online' });

        callback({ success: true, userId, user });
      } catch (err: any) {
        callback({ success: false, error: err?.message || 'Błąd logowania' });
      }
    });

    // 3. EDIT PROFILE (Change Display Name without changing keys/token)
    socket.on('user:update_profile', async (data: { displayName: string }, callback) => {
      const userId = await getSocketUserId();
      if (!userId) return callback?.({ success: false, error: 'Brak autoryzacji' });
      const user = db.users.get(userId);
      if (!user) return callback?.({ success: false, error: 'Nie znaleziono użytkownika' });

      if (!data.displayName || data.displayName.trim().length < 2) {
        return callback?.({ success: false, error: 'Nazwa musi mieć co najmniej 2 znaki' });
      }

      const tagNumber = user.userTag.split('#')[1] || '1337';
      user.displayName = data.displayName.trim();
      user.userTag = `${user.displayName}#${tagNumber}`;

      const hasMongo = await ensureMongoConnected();
      if (hasMongo) {
        try {
          await UserModel.findOneAndUpdate(
            { id: user.id },
            { displayName: user.displayName, userTag: user.userTag },
            { upsert: true, new: true }
          );
          console.log('[MongoDB Atlas] Saved profile update for user:', user.id);
        } catch (err) {
          console.error('[MongoDB profile update error]', err);
        }
      }

      await sendUserState(userId);
      callback?.({ success: true, user });
    });

    // 4. FRIEND REQUEST SYSTEM (Send, Accept, Decline, Remove)
    socket.on('friend:request', async (data: { targetUserTag: string }, callback) => {
      const userId = await getSocketUserId();
      if (!userId) return callback?.({ success: false, error: 'Brak autoryzacji' });
      const currentUser = db.users.get(userId);
      if (!currentUser) return callback?.({ success: false, error: 'Nie odnaleziono zalogowanego użytkownika' });

      const targetTag = (data.targetUserTag || '').trim();
      if (!targetTag) {
        return callback?.({ success: false, error: 'Podaj kod lub tag użytkownika (np. Jan#1234)' });
      }

      if (targetTag.toLowerCase() === currentUser.userTag.toLowerCase()) {
        return callback?.({ success: false, error: 'Nie możesz wysłać zaproszenia do samego siebie' });
      }

      const hasMongo = await ensureMongoConnected();
      let targetUser = Array.from(db.users.values()).find(u => u.userTag.toLowerCase() === targetTag.toLowerCase());
      if (!targetUser && hasMongo) {
        try {
          const escapedTag = targetTag.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
          const mongoUser = await UserModel.findOne({ userTag: { $regex: new RegExp(`^${escapedTag}$`, 'i') } });
          if (mongoUser) {
            targetUser = {
              id: mongoUser.id,
              tokenHash: mongoUser.tokenHash,
              displayName: mongoUser.displayName,
              userTag: mongoUser.userTag,
              ecdhPublicKey: mongoUser.ecdhPublicKey,
              status: 'offline',
              friends: (mongoUser.friends || []).map((f: any) => ({
                userId: f.userId,
                status: f.status as any,
                updatedAt: f.updatedAt || new Date().toISOString(),
              })),
              createdAt: mongoUser.createdAt || new Date().toISOString(),
            };
            db.users.set(targetUser.id, targetUser);
          }
        } catch (e) {
          console.error('[friend:request MongoDB lookup error]', e);
        }
      }

      if (!targetUser) {
        return callback?.({ success: false, error: 'Nie znaleziono użytkownika o takim tagu. Sprawdź nazwę i identyfikator (np. Nazwa#1234).' });
      }

      // Check existing relation
      const existingInSelf = currentUser.friends.find(f => f.userId === targetUser.id);
      if (existingInSelf) {
        return callback?.({ success: false, error: 'Relacja ze znajomym już istnieje lub zaproszenie jest w trakcie procesowania' });
      }

      currentUser.friends.push({
        userId: targetUser.id,
        status: 'pending_sent',
        updatedAt: new Date().toISOString(),
      });

      const existingInTarget = targetUser.friends.find(f => f.userId === currentUser.id);
      if (!existingInTarget) {
        targetUser.friends.push({
          userId: currentUser.id,
          status: 'pending_received',
          updatedAt: new Date().toISOString(),
        });
      } else {
        existingInTarget.status = 'pending_received';
      }

      if (hasMongo) {
        try {
          await UserModel.findOneAndUpdate({ id: currentUser.id }, { $set: { friends: currentUser.friends } }, { upsert: true });
          await UserModel.findOneAndUpdate({ id: targetUser.id }, { $set: { friends: targetUser.friends } }, { upsert: true });
          console.log('[MongoDB Atlas] Saved friend request relation between:', currentUser.id, 'and', targetUser.id);
        } catch (err) {
          console.error('[MongoDB friend:request save error]', err);
        }
      }

      await sendUserState(currentUser.id);

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
        await sendUserState(targetUser.id);
      }

      callback?.({ success: true, targetUserTag: targetUser.userTag });
    });

    socket.on('friend:accept', async (data: { targetUserId: string }, callback) => {
      const userId = await getSocketUserId();
      if (!userId) return callback?.({ success: false, error: 'Brak autoryzacji' });
      const currentUser = db.users.get(userId);
      const hasMongo = await ensureMongoConnected();
      let targetUser = db.users.get(data.targetUserId);

      if (!targetUser && hasMongo) {
        try {
          const mongoUser = await UserModel.findOne({ id: data.targetUserId });
          if (mongoUser) {
            targetUser = {
              id: mongoUser.id,
              tokenHash: mongoUser.tokenHash,
              displayName: mongoUser.displayName,
              userTag: mongoUser.userTag,
              ecdhPublicKey: mongoUser.ecdhPublicKey,
              status: 'offline',
              friends: (mongoUser.friends || []).map((f: any) => ({
                userId: f.userId,
                status: f.status as any,
                updatedAt: f.updatedAt || new Date().toISOString(),
              })),
              createdAt: mongoUser.createdAt || new Date().toISOString(),
            };
            db.users.set(targetUser.id, targetUser);
          }
        } catch (e) {
          console.error('[friend:accept MongoDB lookup error]', e);
        }
      }

      if (!currentUser || !targetUser) return callback?.({ success: false, error: 'Błąd użytkownika' });

      const relSelf = currentUser.friends.find(f => f.userId === targetUser.id);
      const relTarget = targetUser.friends.find(f => f.userId === currentUser.id);

      if (relSelf) relSelf.status = 'accepted';
      else currentUser.friends.push({ userId: targetUser.id, status: 'accepted', updatedAt: new Date().toISOString() });

      if (relTarget) relTarget.status = 'accepted';
      else targetUser.friends.push({ userId: currentUser.id, status: 'accepted', updatedAt: new Date().toISOString() });

      if (hasMongo) {
        try {
          await UserModel.findOneAndUpdate({ id: currentUser.id }, { $set: { friends: currentUser.friends } }, { upsert: true });
          await UserModel.findOneAndUpdate({ id: targetUser.id }, { $set: { friends: targetUser.friends } }, { upsert: true });
          console.log('[MongoDB Atlas] Saved accepted friend relation between:', currentUser.id, 'and', targetUser.id);
        } catch (err) {
          console.error('[MongoDB friend:accept save error]', err);
        }
      }

      await sendUserState(currentUser.id);

      const targetSocketId = db.userSocketMap.get(targetUser.id);
      if (targetSocketId) {
        await sendUserState(targetUser.id);
      }

      callback?.({ success: true });
    });

    socket.on('friend:decline', async (data: { targetUserId: string }, callback) => {
      const userId = await getSocketUserId();
      if (!userId) return callback?.({ success: false, error: 'Brak autoryzacji' });
      const currentUser = db.users.get(userId);
      const hasMongo = await ensureMongoConnected();
      let targetUser = db.users.get(data.targetUserId);

      if (currentUser) {
        currentUser.friends = currentUser.friends.filter(f => f.userId !== data.targetUserId);
        if (hasMongo) {
          try {
            await UserModel.findOneAndUpdate({ id: currentUser.id }, { $set: { friends: currentUser.friends } }, { upsert: true });
          } catch (err) {
            console.error('[MongoDB friend:decline save error]', err);
          }
        }
        await sendUserState(currentUser.id);
      }

      if (targetUser) {
        targetUser.friends = targetUser.friends.filter(f => f.userId !== userId);
        if (hasMongo) {
          try {
            await UserModel.findOneAndUpdate({ id: targetUser.id }, { $set: { friends: targetUser.friends } }, { upsert: true });
          } catch (err) {
            console.error('[MongoDB friend:decline save error]', err);
          }
        }
        const targetSocketId = db.userSocketMap.get(targetUser.id);
        if (targetSocketId) await sendUserState(targetUser.id);
      }

      callback?.({ success: true });
    });

    // 5. SERVER / GROUP CREATION WITH DEFAULT CHANNELS
    socket.on('server:create', async (data: { name: string; icon?: string }, callback) => {
      const userId = await getSocketUserId();
      if (!userId) return callback?.({ success: false, error: 'Brak autoryzacji' });
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
        createdBy: userId,
        createdAt: new Date().toISOString(),
      };

      const voiceChannel: ChannelStore = {
        id: voiceChId,
        serverId,
        name: 'Głosowy 1',
        type: 'voice',
        topic: 'Pojemny kanał głosowy WebRTC Mesh',
        createdBy: userId,
        createdAt: new Date().toISOString(),
      };

      const newServer: ServerStore = {
        id: serverId,
        name: data.name.trim(),
        icon: data.icon || '🛡️',
        ownerId: userId,
        members: [
          {
            userId: userId,
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

      const hasMongo = await ensureMongoConnected();
      if (hasMongo) {
        try {
          await ServerModel.findOneAndUpdate({ id: serverId }, newServer, { upsert: true, new: true });
          await ChannelModel.findOneAndUpdate({ id: textChId }, textChannel, { upsert: true, new: true });
          await ChannelModel.findOneAndUpdate({ id: voiceChId }, voiceChannel, { upsert: true, new: true });
          console.log('[MongoDB Atlas] Saved new server and default channels:', serverId);
        } catch (err) {
          console.error('[MongoDB server:create error]', err);
        }
      }

      await sendUserState(userId);
      callback?.({ success: true, server: newServer });
    });

    // 5b. CREATE CHANNEL ON A SERVER (TEXT OR VOICE)
    socket.on('channel:create', async (data: { serverId: string; name: string; type: 'text' | 'voice'; topic?: string }, callback) => {
      const userId = await getSocketUserId();
      if (!userId) return callback?.({ success: false, error: 'Brak autoryzacji' });
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
        createdBy: userId,
        createdAt: new Date().toISOString(),
      };

      serverObj.channels.push(newChannel);
      db.channels.set(channelId, newChannel);

      const hasMongo = await ensureMongoConnected();
      if (hasMongo) {
        try {
          await ChannelModel.findOneAndUpdate({ id: channelId }, newChannel, { upsert: true, new: true });
          await ServerModel.findOneAndUpdate({ id: data.serverId }, { $set: { channels: serverObj.channels } }, { upsert: true, new: true });
          console.log('[MongoDB Atlas] Saved channel:', channelId, 'to server:', data.serverId);
        } catch (err) {
          console.error('[MongoDB channel:create error]', err);
        }
      }

      // Refresh state for all online users connected to this server or room
      for (const [sId, uId] of db.socketUserMap.entries()) {
        await sendUserState(uId);
      }

      callback?.({ success: true, channel: newChannel });
    });

    // 6. CHAT MESSAGING (MongoDB Atlas Persistence + Socket.io Relay)
    const handleSendMessage = async (data: {
      id?: string;
      serverId?: string;
      channelId?: string;
      recipientId?: string;
      text?: string;
      ciphertext?: string;
      iv?: string;
      keyAlgorithm?: string;
      token?: string;
      senderId?: string;
      senderName?: string;
    }, callback?: Function) => {
      console.log('📩 [Socket Event Received] message:send / chat:send_message', { socketId: socket.id, data });
      let currentUserId = await getSocketUserId(data?.token);

      const hasMongo = await ensureMongoConnected();
      let sender = currentUserId ? db.users.get(currentUserId) : undefined;

      if (!sender && data?.token) {
        const tokenHash = computeSha256(String(data.token).trim());
        sender = await getUserByTokenHash(tokenHash);
        if (sender) {
          currentUserId = sender.id;
          (socket as any).userId = sender.id;
          db.socketUserMap.set(socket.id, sender.id);
          db.userSocketMap.set(sender.id, socket.id);
        }
      }

      if (!sender && currentUserId && hasMongo) {
        try {
          const mu = await UserModel.findOne({ id: currentUserId });
          if (mu) {
            sender = {
              id: mu.id,
              tokenHash: mu.tokenHash,
              displayName: mu.displayName,
              userTag: mu.userTag,
              ecdhPublicKey: mu.ecdhPublicKey,
              status: 'online',
              friends: mu.friends || [],
              createdAt: mu.createdAt || new Date().toISOString(),
            };
            db.users.set(currentUserId, sender);
          }
        } catch (e) {
          console.error('[chat message sender lookup error]', e);
        }
      }

      if (!sender && data?.senderId) {
        currentUserId = data.senderId;
        sender = {
          id: data.senderId,
          tokenHash: '',
          displayName: data.senderName || 'Użytkownik',
          userTag: (data.senderName || 'Użytkownik') + '#1337',
          ecdhPublicKey: '',
          status: 'online',
          friends: [],
          createdAt: new Date().toISOString(),
        };
        db.users.set(currentUserId, sender);
      }

      if (!currentUserId || !sender) {
        const fallbackId = 'usr_' + socket.id.replace(/[^a-zA-Z0-9]/g, '').substring(0, 12);
        currentUserId = fallbackId;
        sender = {
          id: fallbackId,
          tokenHash: '',
          displayName: data?.senderName || 'Użytkownik',
          userTag: (data?.senderName || 'Użytkownik') + '#1337',
          ecdhPublicKey: '',
          status: 'online',
          friends: [],
          createdAt: new Date().toISOString(),
        };
        db.users.set(fallbackId, sender);
      }

      const msgText = (data.text || data.ciphertext || '').trim();
      if (!msgText) {
        return callback?.({ success: false, error: 'Treść wiadomości nie może być pusta' });
      }

      const rawCh = data?.channelId;
      const rawRec = data?.recipientId;
      const cleanCh = (!rawCh || rawCh === 'undefined' || rawCh === 'null') ? '' : rawCh;
      const cleanRec = (!rawRec || rawRec === 'undefined' || rawRec === 'null') ? '' : rawRec;

      const channelId = cleanCh || (cleanRec ? `dm_${cleanRec}` : 'chn_general_text');
      const serverId = data.serverId || (cleanCh ? 'srv_general_01' : undefined);

      const newMsg: MessageStore = {
        id: data.id || ('msg_' + crypto.randomBytes(8).toString('hex')),
        serverId,
        channelId,
        recipientId: data.recipientId,
        senderId: currentUserId,
        senderName: sender.displayName,
        text: msgText,
        ciphertext: data.ciphertext || msgText,
        iv: data.iv || '',
        keyAlgorithm: data.keyAlgorithm || 'PLAIN',
        timestamp: new Date().toISOString(),
      };

      if (!db.messages.some(m => m.id === newMsg.id)) {
        db.messages.push(newMsg);
      }

      if (hasMongo) {
        try {
          console.log('💾 [MongoDB WRITE START] Saving message to Atlas MessageModel...', newMsg.id);
          const cleanMsgForMongo = JSON.parse(JSON.stringify(newMsg));
          const savedDoc = await MessageModel.findOneAndUpdate(
            { id: newMsg.id },
            { $set: cleanMsgForMongo },
            { upsert: true, new: true }
          );
          console.log('✅ [MongoDB WRITE SUCCESS] Saved message to Atlas:', savedDoc?.id || newMsg.id, 'Content:', msgText);
        } catch (err: any) {
          console.error('❌ [MongoDB WRITE ERROR]', err?.message || err);
        }
      } else {
        console.warn('⚠️ [MongoDB Status] MongoDB is not connected, saved message to in-memory store only');
      }

      // Auto-join sender to channel room if specified
      if (channelId) {
        socket.join(channelId);
      }

      // Broadcast message to rooms & recipients
      console.log('📢 [Socket Relay] Broadcasting message to channel/DM listeners...', { channelId, recipientId: data.recipientId });
      io.emit('message:received', newMsg);

      if (channelId) {
        io.to(channelId).emit('message:received', newMsg);
        io.emit(`chat:channel:${channelId}`, newMsg);
      }

      if (data.recipientId) {
        const targetSocketId = db.userSocketMap.get(data.recipientId);
        if (targetSocketId) {
          io.to(targetSocketId).emit('message:received', newMsg);
          io.to(targetSocketId).emit(`chat:dm:${currentUserId}`, newMsg);
        }
        socket.emit('message:received', newMsg);
        socket.emit(`chat:dm:${data.recipientId}`, newMsg);
      }

      callback?.({ success: true, message: newMsg });
    };

    socket.on('chat:send', handleSendMessage);
    socket.on('chat:send_message', handleSendMessage);
    socket.on('message:send', handleSendMessage);

    socket.on('channel:join', async (data: { channelId?: string }, callback) => {
      const chId = typeof data === 'string' ? data : data?.channelId;
      console.log('📩 [Socket Event Received] channel:join', { socketId: socket.id, channelId: chId });
      if (chId) {
        socket.join(chId);
      }
      callback?.({ success: true });
    });

    socket.on('chat:get_history', async (data: { channelId?: string; recipientId?: string; token?: string }, callback) => {
      console.log('📩 [Socket Event Received] chat:get_history', { socketId: socket.id, data });
      let currentUserId = await getSocketUserId(data?.token);

      if (!currentUserId && data?.recipientId) {
        return callback?.({ success: false, error: 'Brak autoryzacji dla konwersacji prywatnej' });
      }

      const hasMongo = await ensureMongoConnected();
      let history: MessageStore[] = [];
      const rawCh = data?.channelId;
      const rawRec = data?.recipientId;
      const cleanCh = (!rawCh || rawCh === 'undefined' || rawCh === 'null') ? '' : rawCh;
      const cleanRec = (!rawRec || rawRec === 'undefined' || rawRec === 'null') ? '' : rawRec;
      const targetChannelId = cleanCh || (cleanRec ? `dm_${cleanRec}` : 'chn_general_text');

      if (hasMongo) {
        try {
          let mongoMsgs: any[] = [];
          if (cleanRec && currentUserId) {
            mongoMsgs = await MessageModel.find({
              $or: [
                { senderId: currentUserId, recipientId: cleanRec },
                { senderId: cleanRec, recipientId: currentUserId },
                { channelId: `dm_${cleanRec}` },
                { channelId: targetChannelId }
              ]
            }).lean();
          } else {
            const queryChId = cleanCh || 'chn_general_text';
            const queryConditions: any[] = [{ channelId: queryChId }, { channelId: targetChannelId }];
            if (targetChannelId === 'chn_general_text') {
              queryConditions.push({ channelId: { $in: ['chn_general_text', '', null] } });
            }
            mongoMsgs = await MessageModel.find({
              $or: queryConditions
            }).lean();
          }

          if (mongoMsgs && mongoMsgs.length > 0) {
            console.log(`📖 [MongoDB READ] Fetched ${mongoMsgs.length} messages from Atlas for target:`, targetChannelId);
            for (const m of mongoMsgs) {
              const msgObj: MessageStore = {
                id: m.id,
                serverId: m.serverId || 'srv_general_01',
                channelId: m.channelId || targetChannelId,
                recipientId: m.recipientId,
                senderId: m.senderId || 'usr_anonymous',
                senderName: m.senderName || 'Użytkownik',
                text: m.text || m.ciphertext || '',
                ciphertext: m.ciphertext || m.text || '',
                iv: m.iv || '',
                keyAlgorithm: m.keyAlgorithm || 'PLAIN',
                timestamp: m.timestamp || new Date().toISOString(),
              };
              const existingIdx = db.messages.findIndex(ex => ex.id === m.id);
              if (existingIdx >= 0) {
                db.messages[existingIdx] = msgObj;
              } else {
                db.messages.push(msgObj);
              }
            }
          }
        } catch (e) {
          console.error('[MongoDB chat:get_history error]', e);
        }
      }

      if (data?.recipientId && currentUserId) {
        history = db.messages.filter(
          m => (m.senderId === currentUserId && m.recipientId === data.recipientId) ||
               (m.senderId === data.recipientId && m.recipientId === currentUserId) ||
               m.channelId === `dm_${data.recipientId}`
        );
      } else {
        const filterChId = data?.channelId || 'chn_general_text';
        history = db.messages.filter(m => m.channelId === filterChId || m.channelId === targetChannelId);
      }

      history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      socket.emit('messages:history', { channelId: targetChannelId, messages: history.slice(-200) });
      callback?.({ success: true, history: history.slice(-200) });
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
