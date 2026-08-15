import { connectToMongoDB, MessageModel } from './_db';

export interface MessagePayload {
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

/**
 * Direct MongoDB Atlas Persistence Service for Messages
 * Ensures every message from any user is reliably saved to MongoDB Atlas.
 */
export async function saveMessageToDatabase(msg: MessagePayload): Promise<{ success: boolean; message: MessagePayload }> {
  const cleanMsg: MessagePayload = {
    id: msg.id,
    serverId: msg.serverId || 'srv_general_01',
    channelId: msg.channelId || 'chn_general_text',
    recipientId: msg.recipientId || undefined,
    senderId: msg.senderId || 'usr_anonymous',
    senderName: msg.senderName || 'Użytkownik',
    text: msg.text || msg.ciphertext || '',
    ciphertext: msg.ciphertext || msg.text || '',
    iv: msg.iv || '',
    keyAlgorithm: msg.keyAlgorithm || 'PLAIN',
    timestamp: msg.timestamp || new Date().toISOString(),
  };

  const isConnected = await connectToMongoDB();
  if (isConnected) {
    try {
      const cleanObj = JSON.parse(JSON.stringify(cleanMsg));
      const doc = await MessageModel.findOneAndUpdate(
        { id: cleanMsg.id },
        { $set: cleanObj },
        { upsert: true, new: true }
      );
      console.log('✅ [MongoDB Atlas Service] Message saved successfully to Atlas:', doc?.id || cleanMsg.id, 'Sender:', cleanMsg.senderName, 'Text:', cleanMsg.text);
      return { success: true, message: cleanMsg };
    } catch (error: any) {
      if (error?.code === 11000 || error?.message?.includes('E11000')) {
        try {
          const cleanObj = JSON.parse(JSON.stringify(cleanMsg));
          await MessageModel.updateOne({ id: cleanMsg.id }, { $set: cleanObj });
          console.log('✅ [MongoDB Atlas Service] Updated existing message in Atlas:', cleanMsg.id);
          return { success: true, message: cleanMsg };
        } catch (retryError: any) {
          console.error('❌ [MongoDB Atlas Service] Message update retry error:', retryError?.message || retryError);
        }
      } else {
        console.error('❌ [MongoDB Atlas Service] Message save error:', error?.message || error);
      }
    }
  } else {
    console.warn('⚠️ [MongoDB Atlas Service] Atlas not connected, fallback to memory');
  }

  return { success: true, message: cleanMsg };
}

/**
 * Fetch message history directly from MongoDB Atlas
 */
export async function fetchMessageHistoryFromDatabase(
  channelId?: string,
  recipientId?: string,
  currentUserId?: string
): Promise<MessagePayload[]> {
  const isConnected = await connectToMongoDB();
  if (!isConnected) return [];

  try {
    const cleanCh = (!channelId || channelId === 'undefined' || channelId === 'null') ? '' : channelId;
    const cleanRec = (!recipientId || recipientId === 'undefined' || recipientId === 'null') ? '' : recipientId;
    const targetChannelId = cleanCh || (cleanRec ? `dm_${cleanRec}` : 'chn_general_text');

    let queryConditions: any[] = [];

    if (cleanRec) {
      queryConditions = [
        { recipientId: cleanRec },
        { senderId: cleanRec },
        { channelId: `dm_${cleanRec}` },
        { channelId: targetChannelId }
      ];
      if (currentUserId) {
        queryConditions.push(
          { senderId: currentUserId, recipientId: cleanRec },
          { senderId: cleanRec, recipientId: currentUserId }
        );
      }
    } else {
      const queryChId = cleanCh || 'chn_general_text';
      queryConditions = [{ channelId: queryChId }, { channelId: targetChannelId }];
      if (targetChannelId === 'chn_general_text' || queryChId === 'chn_general_text') {
        queryConditions.push({ channelId: { $in: ['chn_general_text', '', null] } });
      }
    }

    const docs = await MessageModel.find({ $or: queryConditions }).sort({ timestamp: 1 }).limit(500).lean();
    console.log(`📖 [MongoDB Atlas Service] Loaded ${docs.length} messages from Atlas for: ${targetChannelId}`);

    return docs.map((m: any) => ({
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
  } catch (error) {
    console.error('❌ [MongoDB Atlas Service] Fetch message history error:', error);
    return [];
  }
}
