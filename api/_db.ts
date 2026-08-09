import mongoose from 'mongoose';

// MongoDB Schemas with strict: false so all fields are stored
const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  tokenHash: { type: String, required: true, unique: true, index: true },
  displayName: { type: String, required: true },
  userTag: { type: String, required: true, index: true },
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
}, { strict: false, timestamps: true });

const ChannelSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  serverId: { type: String, index: true },
  name: { type: String, required: true },
  type: { type: String, required: true },
  topic: { type: String },
  createdBy: { type: String, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { strict: false });

const ServerSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
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
}, { strict: false });

const MessageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  serverId: { type: String, index: true },
  channelId: { type: String, index: true },
  recipientId: { type: String, index: true },
  senderId: { type: String, required: true, index: true },
  senderName: { type: String, required: true },
  text: { type: String },
  ciphertext: { type: String },
  iv: { type: String },
  keyAlgorithm: { type: String, default: 'PLAIN' },
  timestamp: { type: String, default: () => new Date().toISOString() },
}, { strict: false, timestamps: true });

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
  if (cached.conn && mongoose.connection.readyState === 1) {
    return true;
  }

  const envUri = process.env.MONGODB_URI?.trim();
  const urisToTry = [DEFAULT_MONGODB_URI, ...(envUri && envUri !== DEFAULT_MONGODB_URI ? [envUri] : [])];

  const opts = {
    dbName: 'toothchat',
    bufferCommands: true,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    maxPoolSize: 10,
  };

  for (const uri of urisToTry) {
    try {
      console.log(`[MongoDB Attempt] Connecting to Atlas cluster...`);
      const conn = await mongoose.connect(uri, opts);
      cached.conn = conn;
      cached.promise = Promise.resolve(conn);
      console.log('[MongoDB Atlas] Connected successfully to database!');
      return true;
    } catch (e: any) {
      console.error(`[MongoDB Connection Error with URI] ${e?.message || e}`);
      cached.promise = null;
      cached.conn = null;
    }
  }

  return false;
}

