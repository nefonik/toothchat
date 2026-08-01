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

export const UserModel: any = mongoose.models.User || mongoose.model('User', UserSchema);
export const ServerModel: any = mongoose.models.Server || mongoose.model('Server', ServerSchema);
export const ChannelModel: any = mongoose.models.Channel || mongoose.model('Channel', ChannelSchema);
export const MessageModel: any = mongoose.models.Message || mongoose.model('Message', MessageSchema);

export const DEFAULT_MONGODB_URI = "mongodb+srv://nefondupon3000_db_user:NEfiiFOLWARK009@zombek.r8vdzpa.mongodb.net/toothchat?retryWrites=true&w=majority&appName=Zombek";

let cached = (global as any).mongoose;
if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

export async function connectToMongoDB(): Promise<boolean> {
  const mongoUri = process.env.MONGODB_URI?.trim() || DEFAULT_MONGODB_URI;

  if (cached.conn && mongoose.connection.readyState === 1) {
    return true;
  }

  if (!cached.promise) {
    const opts = {
      dbName: 'toothchat',
      bufferCommands: true,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      maxPoolSize: 10,
    };

    cached.promise = mongoose.connect(mongoUri, opts);
  }

  try {
    cached.conn = await cached.promise;
    console.log('MongoDB Connected successfully');
    return true;
  } catch (e: any) {
    console.error('MongoDB Connection Error:', e?.message || e);
    cached.promise = null;
    cached.conn = null;
    return false;
  }
}
