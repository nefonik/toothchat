import mongoose, { Schema, Document } from 'mongoose';

/**
 * KROK 1: Schematy MongoDB (Mongoose)
 * Architektura bazy danych dla w pełni szyfrowanego komunikatora
 */

// 1. User Schema (Użytkownik)
export interface IUser extends Document {
  tokenHash: string; // SHA-256 Hash unikalnego tokenu autoryzacyjnego
  displayName: string; // Nazwa wyświetlana
  userTag: string; // Identyfikator w formacie Nazwa#0000
  ecdhPublicKey: string; // Publiczny Klucz Kryptograficzny ECDH P-256 (JWK)
  status: 'online' | 'offline' | 'busy' | 'away';
  friends: {
    user: mongoose.Types.ObjectId;
    status: 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';
    updatedAt: Date;
  }[];
  createdAt: Date;
}

export const UserSchema: Schema = new Schema<IUser>({
  tokenHash: { type: String, required: true, unique: true, index: true },
  displayName: { type: String, required: true, trim: true },
  userTag: { type: String, required: true, unique: true, index: true },
  ecdhPublicKey: { type: String, required: true },
  status: { type: String, enum: ['online', 'offline', 'busy', 'away'], default: 'online' },
  friends: [
    {
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      status: {
        type: String,
        enum: ['pending_sent', 'pending_received', 'accepted', 'blocked'],
        required: true
      },
      updatedAt: { type: Date, default: Date.now }
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

// 2. Server/Group Schema (Serwer / Grupa)
export interface IServerGroup extends Document {
  name: string;
  icon?: string;
  owner: mongoose.Types.ObjectId;
  members: {
    user: mongoose.Types.ObjectId;
    role: 'owner' | 'admin' | 'member';
    joinedAt: Date;
    encryptedGroupKey?: string; // Szyfrowany klucz symetryczny kanału dla danego użytkownika
  }[];
  channels: mongoose.Types.ObjectId[];
  createdAt: Date;
}

export const ServerGroupSchema: Schema = new Schema<IServerGroup>({
  name: { type: String, required: true, trim: true },
  icon: { type: String },
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  members: [
    {
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
      joinedAt: { type: Date, default: Date.now },
      encryptedGroupKey: { type: String }
    }
  ],
  channels: [{ type: Schema.Types.ObjectId, ref: 'Channel' }],
  createdAt: { type: Date, default: Date.now }
});

// 3. Channel Schema (Kanał)
export interface IChannel extends Document {
  server?: mongoose.Types.ObjectId; // Null w przypadku konwersacji bezpośredniej (DM)
  name: string;
  type: 'text' | 'voice';
  topic?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

export const ChannelSchema: Schema = new Schema<IChannel>({
  server: { type: Schema.Types.ObjectId, ref: 'ServerGroup', default: null },
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['text', 'voice'], required: true, default: 'text' },
  topic: { type: String, default: '' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

// 4. Message Schema (Zaszyfrowana Wiadomość - Ciphertext Only)
export interface IMessage extends Document {
  server?: mongoose.Types.ObjectId;
  channel?: mongoose.Types.ObjectId;
  recipient?: mongoose.Types.ObjectId; // Dla wiadomości 1-on-1 DM
  sender: mongoose.Types.ObjectId;
  senderName: string;
  ciphertext: string; // Zaszyfrowany ładunek tekstowy (Base64) - SERWER NIE ZNA KLUCZA
  iv: string; // Wektor inicjalizacyjny AES-GCM (Base64)
  keyAlgorithm: string; // e.g., "AES-GCM-256"
  timestamp: Date;
}

export const MessageSchema: Schema = new Schema<IMessage>({
  server: { type: Schema.Types.ObjectId, ref: 'ServerGroup', index: true },
  channel: { type: Schema.Types.ObjectId, ref: 'Channel', index: true },
  recipient: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: { type: String, required: true },
  ciphertext: { type: String, required: true }, // ZERO-KNOWLEDGE: Szyfrogram!
  iv: { type: String, required: true },
  keyAlgorithm: { type: String, default: 'AES-GCM-256' },
  timestamp: { type: Date, default: Date.now, index: true }
});

// Mongoose Models export
export const UserModel = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
export const ServerGroupModel = mongoose.models.ServerGroup || mongoose.model<IServerGroup>('ServerGroup', ServerGroupSchema);
export const ChannelModel = mongoose.models.Channel || mongoose.model<IChannel>('Channel', ChannelSchema);
export const MessageModel = mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);
