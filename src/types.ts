export interface UserProfile {
  id: string;
  displayName: string;
  userTag: string; // e.g. "Szyfrant#1337"
  tokenHash: string;
  ecdhPublicKeyJwk: string; // JWK representation of ECDH Public Key
  status: 'online' | 'offline' | 'busy' | 'away';
  createdAt: string;
}

export interface FriendRelation {
  userId: string;
  user?: UserProfile;
  status: 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';
  updatedAt: string;
}

export type ChannelType = 'text' | 'voice';

export interface Channel {
  id: string;
  serverId?: string;
  name: string;
  type: ChannelType;
  topic?: string;
  createdBy: string;
  createdAt: string;
}

export interface ServerGroup {
  id: string;
  name: string;
  icon?: string;
  ownerId: string;
  members: {
    userId: string;
    role: 'owner' | 'admin' | 'member';
    joinedAt: string;
    encryptedGroupKey?: string; // Group Key encrypted with user's Public Key
  }[];
  channels: Channel[];
  createdAt: string;
}

export interface EncryptedMessage {
  id: string;
  serverId?: string;
  channelId?: string;
  recipientId?: string;
  senderId: string;
  senderName: string;
  ciphertext: string; // Base64 ciphertext
  iv: string; // Base64 initialization vector
  keyAlgorithm: string; // e.g. "AES-GCM-256"
  timestamp: string;
}

export interface WebRTCSignalData {
  senderId: string;
  recipientId: string;
  type: 'offer' | 'answer' | 'ice-candidate' | 'call-ringing' | 'call-accepted' | 'call-declined' | 'call-hangup';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  callType?: 'audio' | 'video';
  channelId?: string;
}

export interface VoiceParticipant {
  userId: string;
  displayName: string;
  isMuted: boolean;
  isDeafened: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  joinedAt: string;
}
