const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://Toothchat:Antek123!@toothchat.761i0.mongodb.net/ToothchatDB?retryWrites=true&w=majority&appName=Toothchat";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

// Express Middleware
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

// -----------------------------------------------------------------------------
// KROK 1: MONGODB SCHEMAS & MODELS
// -----------------------------------------------------------------------------
const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userTag: { type: String, required: true, unique: true },
  displayName: { type: String, required: true },
  token: { type: String, required: true },
  tokenHash: { type: String, required: true },
  publicKeyJwk: { type: String, default: '' },
  friends: [{
    userId: String,
    status: { type: String, enum: ['pending_sent', 'pending_received', 'accepted', 'blocked'] },
    updatedAt: String
  }],
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() }
});

const channelSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  serverId: { type: String, required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['text', 'voice'], default: 'text' },
  topic: { type: String, default: '' },
  createdBy: { type: String },
  createdAt: { type: String, default: () => new Date().toISOString() }
});

const serverSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  icon: { type: String, default: '🛡️' },
  ownerId: { type: String, required: true },
  members: [{
    userId: String,
    role: { type: String, default: 'member' },
    joinedAt: String
  }],
  channels: [channelSchema],
  createdAt: { type: String, default: () => new Date().toISOString() }
});

const messageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  channelId: { type: String, required: true, index: true },
  senderId: { type: String, required: true },
  recipientId: { type: String },
  encryptedPayload: { type: String, required: true },
  iv: { type: String, required: true },
  senderPublicKey: { type: String },
  signature: { type: String },
  timestamp: { type: String, required: true, index: true }
});

const UserModel = mongoose.model('User', userSchema);
const ServerModel = mongoose.model('Server', serverSchema);
const ChannelModel = mongoose.model('Channel', channelSchema);
const MessageModel = mongoose.model('Message', messageSchema);

// Helper for hashing tokens
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Ensure default demo server exists in DB
async function seedDefaultServer() {
  try {
    const existingServer = await ServerModel.findOne({ id: 'srv_general_01' });
    if (!existingServer) {
      const defaultServer = {
        id: 'srv_general_01',
        name: 'Toothchat Community',
        icon: '🦷',
        ownerId: 'sys_admin',
        members: [{ userId: 'sys_admin', role: 'owner', joinedAt: new Date().toISOString() }],
        channels: [
          {
            id: 'chn_general_text',
            serverId: 'srv_general_01',
            name: 'ogólny-czat',
            type: 'text',
            topic: 'Główny kanał rozmów E2EE',
            createdBy: 'sys_admin',
            createdAt: new Date().toISOString()
          },
          {
            id: 'chn_general_voice',
            serverId: 'srv_general_01',
            name: 'Pokój Główny (Głos/Wideo)',
            type: 'voice',
            topic: 'Kanał głosowy WebRTC Mesh',
            createdBy: 'sys_admin',
            createdAt: new Date().toISOString()
          }
        ],
        createdAt: new Date().toISOString()
      };
      await ServerModel.create(defaultServer);
      for (const ch of defaultServer.channels) {
        await ChannelModel.findOneAndUpdate({ id: ch.id }, ch, { upsert: true, new: true });
      }
      console.log('✅ Default demo server seeded in MongoDB.');
    }
  } catch (err) {
    console.error('Error seeding default server:', err);
  }
}

// Connect to MongoDB
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log('✅ Connected to MongoDB Atlas successfully.');
    await seedDefaultServer();
  })
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// -----------------------------------------------------------------------------
// REST API ROUTES
// -----------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mongoStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { displayName, publicKeyJwk } = req.body;
    if (!displayName || displayName.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Nazwa użytkownika musi mieć min. 2 znaki' });
    }

    const cleanName = displayName.trim();
    const tagNum = Math.floor(1000 + Math.random() * 9000);
    const userTag = `${cleanName}#${tagNum}`;
    const userId = `usr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const token = `tc_tok_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = hashToken(token);

    const newUser = await UserModel.create({
      id: userId,
      userTag,
      displayName: cleanName,
      token,
      tokenHash,
      publicKeyJwk: publicKeyJwk || '',
      friends: []
    });

    res.json({
      success: true,
      user: {
        id: newUser.id,
        userTag: newUser.userTag,
        displayName: newUser.displayName,
        publicKeyJwk: newUser.publicKeyJwk,
        createdAt: newUser.createdAt
      },
      token
    });
  } catch (err) {
    console.error('REST Register Error:', err);
    res.status(500).json({ success: false, error: 'Błąd rejestracji w MongoDB' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, error: 'Brak tokena' });

    const tokenH = hashToken(token);
    const user = await UserModel.findOne({ $or: [{ token }, { tokenHash: tokenH }] });

    if (!user) {
      return res.status(401).json({ success: false, error: 'Nieprawidłowy token autoryzacji' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        userTag: user.userTag,
        displayName: user.displayName,
        publicKeyJwk: user.publicKeyJwk,
        createdAt: user.createdAt
      },
      token: user.token
    });
  } catch (err) {
    console.error('REST Login Error:', err);
    res.status(500).json({ success: false, error: 'Błąd autoryzacji w MongoDB' });
  }
});

// -----------------------------------------------------------------------------
// KROK 1: SERWER HTTP & SOCKET.IO Z CORS
// -----------------------------------------------------------------------------
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 30000,
  pingInterval: 10000
});

// User connection maps & Voice tracking
const userSocketMap = new Map(); // userId -> socketId
const voiceChannels = new Map(); // channelId -> Map(userId -> { userId, isMuted, isVideoOn, isScreenSharing })

// Helper: send state sync to user
async function sendUserState(userId, socketInstance = null) {
  try {
    const userDoc = await UserModel.findOne({ id: userId });
    if (!userDoc) return;

    // Load friend profiles
    const friendRelations = [];
    for (const f of userDoc.friends || []) {
      const fUserDoc = await UserModel.findOne({ id: f.userId });
      if (fUserDoc) {
        const isOnline = userSocketMap.has(f.userId);
        friendRelations.push({
          userId: f.userId,
          status: f.status,
          updatedAt: f.updatedAt,
          user: {
            id: fUserDoc.id,
            userTag: fUserDoc.userTag,
            displayName: fUserDoc.displayName,
            status: isOnline ? 'online' : 'offline',
            publicKeyJwk: fUserDoc.publicKeyJwk,
            createdAt: fUserDoc.createdAt
          }
        });
      }
    }

    // Load servers
    const allServers = await ServerModel.find({});
    const dbChannels = await ChannelModel.find({});

    const userServers = allServers
      .filter(s => s.ownerId === userId || (s.members && s.members.some(m => m.userId === userId)) || s.id === 'srv_general_01')
      .map(s => {
        const channels = dbChannels.filter(c => c.serverId === s.id);
        return {
          id: s.id,
          name: s.name,
          icon: s.icon || '🛡️',
          ownerId: s.ownerId,
          members: s.members || [],
          channels: channels.length > 0 ? channels : (s.channels || []),
          createdAt: s.createdAt
        };
      });

    const payload = {
      user: {
        id: userDoc.id,
        userTag: userDoc.userTag,
        displayName: userDoc.displayName,
        status: 'online',
        publicKeyJwk: userDoc.publicKeyJwk,
        createdAt: userDoc.createdAt
      },
      friends: friendRelations,
      servers: userServers
    };

    const targetSocketId = userSocketMap.get(userId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('auth:state', payload);
    } else if (socketInstance) {
      socketInstance.emit('auth:state', payload);
    }
  } catch (err) {
    console.error('Error sending user state:', err);
  }
}

// -----------------------------------------------------------------------------
// KROK 2: AUTORYZACJA WEBSOCKETÓW W MONGODB
// -----------------------------------------------------------------------------
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Brak tokena autoryzacji'));
    }

    const hashed = hashToken(token);
    const user = await UserModel.findOne({ $or: [{ token }, { tokenHash: hashed }] });

    if (!user) {
      return next(new Error('Błędny token autoryzacyjny'));
    }

    socket.userId = user.id;
    socket.user = user;
    next();
  } catch (err) {
    console.error('Socket Auth Middleware Error:', err);
    next(new Error('Błąd weryfikacji w bazie MongoDB'));
  }
});

// -----------------------------------------------------------------------------
// KROK 3: LOGIKA CZATU I SYGNALIZACJA WEBRTC
// -----------------------------------------------------------------------------
io.on('connection', async (socket) => {
  const userId = socket.userId;
  console.log(`⚡ [Socket Connected] User ${userId} (${socket.user.displayName}) connected on socket ${socket.id}`);

  // Register socket
  userSocketMap.set(userId, socket.id);
  socket.join(`user:${userId}`);

  // Send initial state sync from MongoDB
  await sendUserState(userId, socket);

  // Broadcast presence online to friends
  io.emit('user:presence', { userId, status: 'online' });

  // ---------------------------------------------------------------------------
  // CZAT & KANAŁY (MongoDB Persistence)
  // ---------------------------------------------------------------------------

  // Dołączanie do pokoju kanału + pobieranie historii wiadomości z MongoDB
  socket.on('channel:join', async (data, callback) => {
    const channelId = typeof data === 'string' ? data : data?.channelId;
    if (!channelId) return callback?.({ success: false, error: 'Brak channelId' });

    socket.join(channelId);

    try {
      const messages = await MessageModel.find({ channelId }).sort({ timestamp: 1 }).limit(100);
      socket.emit('messages:history', { channelId, messages });
      callback?.({ success: true, count: messages.length });
    } catch (err) {
      console.error('Error fetching channel messages from MongoDB:', err);
      callback?.({ success: false, error: 'Błąd pobierania wiadomości' });
    }
  });

  // Wysyłanie zaszyfrowanej wiadomości (Zapis w MongoDB + Emisja w czasie rzeczywistym)
  socket.on('message:send', async (msgData, callback) => {
    try {
      const { channelId, recipientId, encryptedPayload, iv, senderPublicKey, signature } = msgData;

      if (!channelId || !encryptedPayload || !iv) {
        return callback?.({ success: false, error: 'Niekompletne dane wiadomości' });
      }

      const msgId = msgData.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const timestamp = msgData.timestamp || new Date().toISOString();

      const newMsg = {
        id: msgId,
        channelId,
        senderId: userId,
        recipientId: recipientId || null,
        encryptedPayload,
        iv,
        senderPublicKey: senderPublicKey || socket.user.publicKeyJwk,
        signature: signature || '',
        timestamp
      };

      // Zapis do bazy MongoDB
      await MessageModel.findOneAndUpdate({ id: msgId }, newMsg, { upsert: true, new: true });

      // Emisja do pokoju kanału lub adresata bezpośredniego
      if (channelId.startsWith('dm_') && recipientId) {
        const targetSocketId = userSocketMap.get(recipientId);
        if (targetSocketId) {
          io.to(targetSocketId).emit('message:received', newMsg);
        }
        socket.emit('message:received', newMsg);
      } else {
        io.to(channelId).emit('message:received', newMsg);
      }

      callback?.({ success: true, messageId: msgId });
    } catch (err) {
      console.error('Error saving/sending message in MongoDB:', err);
      callback?.({ success: false, error: 'Nie udało się zapisać wiadomości w MongoDB' });
    }
  });

  // ---------------------------------------------------------------------------
  // SYGNALIZACJA WEBRTC DLA KANAŁÓW GŁOSOWYCH & PRYWATNYCH
  // ---------------------------------------------------------------------------

  // Użytkownik dołącza do kanału głosowego
  socket.on('voice:join', async (data, callback) => {
    const { channelId } = data;
    if (!channelId) return callback?.({ success: false, error: 'Brak channelId' });

    socket.join(`voice:${channelId}`);

    if (!voiceChannels.has(channelId)) {
      voiceChannels.set(channelId, new Map());
    }

    const participants = voiceChannels.get(channelId);
    const participantInfo = {
      userId,
      isMuted: false,
      isVideoOn: false,
      isScreenSharing: false,
      user: {
        id: socket.user.id,
        userTag: socket.user.userTag,
        displayName: socket.user.displayName,
        publicKeyJwk: socket.user.publicKeyJwk
      }
    };

    participants.set(userId, participantInfo);

    // Wyślij nowemu użytkownikowi obecnych uczestników
    const currentParticipants = Array.from(participants.values());
    socket.emit('voice:participants', { channelId, participants: currentParticipants });

    // Poinformuj innych użytkowników w pokoju głosowym
    socket.to(`voice:${channelId}`).emit('voice:user_joined', {
      channelId,
      participant: participantInfo
    });

    console.log(`🎙️ User ${userId} joined voice channel ${channelId}`);
    callback?.({ success: true, participants: currentParticipants });
  });

  // Użytkownik opuszcza kanał głosowy
  socket.on('voice:leave', (data) => {
    const { channelId } = data;
    if (!channelId) return;

    socket.leave(`voice:${channelId}`);

    if (voiceChannels.has(channelId)) {
      const participants = voiceChannels.get(channelId);
      participants.delete(userId);
      if (participants.size === 0) {
        voiceChannels.delete(channelId);
      }
    }

    io.to(`voice:${channelId}`).emit('voice:user_left', { channelId, userId });
    console.log(`🎙️ User ${userId} left voice channel ${channelId}`);
  });

  // WebRTC Signaling Relay (Offer)
  socket.on('voice:offer', (data) => {
    const { targetUserId, offer, channelId } = data;
    const targetSocketId = userSocketMap.get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('voice:offer', {
        senderUserId: userId,
        offer,
        channelId
      });
    }
  });

  // WebRTC Signaling Relay (Answer)
  socket.on('voice:answer', (data) => {
    const { targetUserId, answer, channelId } = data;
    const targetSocketId = userSocketMap.get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('voice:answer', {
        senderUserId: userId,
        answer,
        channelId
      });
    }
  });

  // WebRTC Signaling Relay (ICE Candidates)
  socket.on('voice:candidate', (data) => {
    const { targetUserId, candidate, channelId } = data;
    const targetSocketId = userSocketMap.get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('voice:candidate', {
        senderUserId: userId,
        candidate,
        channelId
      });
    }
  });

  // Status mikrofonu/wideo na kanale głosowym
  socket.on('voice:state_change', (data) => {
    const { channelId, isMuted, isVideoOn, isScreenSharing } = data;
    if (voiceChannels.has(channelId)) {
      const p = voiceChannels.get(channelId).get(userId);
      if (p) {
        p.isMuted = !!isMuted;
        p.isVideoOn = !!isVideoOn;
        p.isScreenSharing = !!isScreenSharing;
        io.to(`voice:${channelId}`).emit('voice:state_change', {
          channelId,
          userId,
          isMuted: p.isMuted,
          isVideoOn: p.isVideoOn,
          isScreenSharing: p.isScreenSharing
        });
      }
    }
  });

  // Sygnalizacja bezpośrednich połączeń 1-na-1 (Direct Calls)
  socket.on('call:request', (data) => {
    const { targetUserId, callType } = data;
    const targetSocketId = userSocketMap.get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:incoming', {
        callerId: userId,
        callerName: socket.user.displayName,
        callerTag: socket.user.userTag,
        callType: callType || 'audio'
      });
    }
  });

  socket.on('call:answer', (data) => {
    const { callerId, accepted } = data;
    const callerSocketId = userSocketMap.get(callerId);
    if (callerSocketId) {
      io.to(callerSocketId).emit('call:answered', {
        responderId: userId,
        accepted
      });
    }
  });

  socket.on('call:signal', (data) => {
    const { targetUserId, signal } = data;
    const targetSocketId = userSocketMap.get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:signal', {
        senderId: userId,
        signal
      });
    }
  });

  socket.on('call:ice_candidate', (data) => {
    const { targetUserId, candidate } = data;
    const targetSocketId = userSocketMap.get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:ice_candidate', {
        senderId: userId,
        candidate
      });
    }
  });

  socket.on('call:end', (data) => {
    const { targetUserId } = data;
    const targetSocketId = userSocketMap.get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:ended', { senderId: userId });
    }
  });

  // ---------------------------------------------------------------------------
  // TWORZENIE GRUP I KANAŁÓW W MONGODB
  // ---------------------------------------------------------------------------
  socket.on('server:create', async (data, callback) => {
    try {
      if (!data.name || data.name.trim().length < 2) {
        return callback?.({ success: false, error: 'Nazwa grupy musi mieć co najmniej 2 znaki' });
      }

      const serverId = `srv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const textChId = `chn_${Date.now()}_text`;
      const voiceChId = `chn_${Date.now()}_voice`;

      const textChannel = {
        id: textChId,
        serverId,
        name: 'ogólny',
        type: 'text',
        topic: 'Domyślny kanał tekstowy E2EE',
        createdBy: userId,
        createdAt: new Date().toISOString()
      };

      const voiceChannel = {
        id: voiceChId,
        serverId,
        name: 'Głosowy 1',
        type: 'voice',
        topic: 'Kanał głosowy WebRTC Mesh',
        createdBy: userId,
        createdAt: new Date().toISOString()
      };

      const newServer = {
        id: serverId,
        name: data.name.trim(),
        icon: data.icon || '🛡️',
        ownerId: userId,
        members: [{ userId, role: 'owner', joinedAt: new Date().toISOString() }],
        channels: [textChannel, voiceChannel],
        createdAt: new Date().toISOString()
      };

      await ServerModel.create(newServer);
      await ChannelModel.create(textChannel);
      await ChannelModel.create(voiceChannel);

      await sendUserState(userId);
      callback?.({ success: true, server: newServer });
    } catch (err) {
      console.error('Error creating server in MongoDB:', err);
      callback?.({ success: false, error: 'Nie udało się utworzyć grupy w MongoDB' });
    }
  });

  socket.on('channel:create', async (data, callback) => {
    try {
      if (!data.serverId || !data.name || data.name.trim().length < 1) {
        return callback?.({ success: false, error: 'Nazwa kanału jest wymagana' });
      }

      const serverObj = await ServerModel.findOne({ id: data.serverId });
      if (!serverObj) return callback?.({ success: false, error: 'Grupa nie istnieje' });

      const channelId = `chn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const cleanName = data.name.toLowerCase().trim().replace(/\s+/g, '-');

      const newChannel = {
        id: channelId,
        serverId: data.serverId,
        name: cleanName,
        type: data.type === 'voice' ? 'voice' : 'text',
        topic: data.topic || (data.type === 'voice' ? 'Kanał głosowy WebRTC' : 'Kanał tekstowy'),
        createdBy: userId,
        createdAt: new Date().toISOString()
      };

      serverObj.channels.push(newChannel);
      await serverObj.save();
      await ChannelModel.create(newChannel);

      // Inform online users
      for (const [uId] of userSocketMap.entries()) {
        await sendUserState(uId);
      }

      callback?.({ success: true, channel: newChannel });
    } catch (err) {
      console.error('Error creating channel in MongoDB:', err);
      callback?.({ success: false, error: 'Nie udało się utworzyć kanału w MongoDB' });
    }
  });

  // ---------------------------------------------------------------------------
  // OBSŁUGA ROZŁĄCZENIA
  // ---------------------------------------------------------------------------
  socket.on('disconnect', () => {
    console.log(`❌ [Socket Disconnected] User ${userId} disconnected.`);
    userSocketMap.delete(userId);

    // Usunięcie z kanałów głosowych
    for (const [chId, participants] of voiceChannels.entries()) {
      if (participants.has(userId)) {
        participants.delete(userId);
        io.to(`voice:${chId}`).emit('voice:user_left', { channelId: chId, userId });
        if (participants.size === 0) voiceChannels.delete(chId);
      }
    }

    // Poinformowanie o stanie offline
    io.emit('user:presence', { userId, status: 'offline' });
  });
});

// Uruchomienie serwera
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Standalone Toothchat Backend active on http://0.0.0.0:${PORT}`);
  console.log(`📡 CORS allowed for origin: ${CLIENT_ORIGIN}`);
});
