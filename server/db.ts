import mongoose from 'mongoose';

// MongoDB Schemas
const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  tokenHash: { type: String, required: true, unique: true, index: true },
  displayName: { type: String, required: true },
  userTag: { type: String, required: true, unique: true },
  ecdhPublicKey: { type: String, required: true },
  status: { type: String, default: 'offline' },
  friends: [
    {
      userId: { type: String, required: true },
      status: { type: String, required: true },
      updatedAt: { type: String, default: () => new Date().toISOString() },
    },
  ],
  createdAt: { type: String, default: () => new Date().toISOString() },
});

const ChannelSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  serverId: { type: String },
  name: { type: String, required: true },
  type: { type: String, required: true },
  topic: { type: String },
  createdBy: { type: String, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
});

const ServerSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  icon: { type: String, default: '🛡️' },
  ownerId: { type: String, required: true },
  members: [
    {
      userId: { type: String, required: true },
      role: { type: String, default: 'member' },
      joinedAt: { type: String, default: () => new Date().toISOString() },
      encryptedGroupKey: { type: String },
    },
  ],
  channels: [ChannelSchema],
  createdAt: { type: String, default: () => new Date().toISOString() },
});

const MessageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  serverId: { type: String },
  channelId: { type: String },
  recipientId: { type: String },
  senderId: { type: String, required: true },
  senderName: { type: String, required: true },
  ciphertext: { type: String, required: true },
  iv: { type: String, required: true },
  keyAlgorithm: { type: String, default: 'AES-GCM-256' },
  timestamp: { type: String, default: () => new Date().toISOString() },
});

export const UserModel = mongoose.model('User', UserSchema);
export const ServerModel = mongoose.model('Server', ServerSchema);
export const ChannelModel = mongoose.model('Channel', ChannelSchema);
export const MessageModel = mongoose.model('Message', MessageSchema);

export const DEFAULT_MONGODB_URI = "mongodb+srv://nefondupon3000_db_user:NEfiiFOLWARK009@zombek.r8vdzpa.mongodb.net/toothchat?retryWrites=true&w=majority&appName=Zombek";

export async function connectToMongoDB() {
  const mongoUri = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;
  if (!mongoUri) {
    console.log('[MongoDB] MONGODB_URI nie jest zdefiniowane w zmiennych środowiskowych. Aplikacja działa w trybie in-memory.');
    return false;
  }

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('Successfully connected to MongoDB Atlas!');
    return true;
  } catch (err: any) {
    console.error('Failed to connect to MongoDB Atlas (running in in-memory fallback):', err?.message || err);
    return false;
  }
}
