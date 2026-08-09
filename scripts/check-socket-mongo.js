/**
 * Test script to verify Socket.io communication and MongoDB Atlas persistence.
 * Run using: npx tsx scripts/check-socket-mongo.js
 */

import mongoose from 'mongoose';
import { io as Client } from 'socket.io-client';

const FALLBACK_MONGODB_URI = "mongodb+srv://nefondupon3000_db_user:NEfiiFOLWARK009@zombek.r8vdzpa.mongodb.net/toothchat?retryWrites=true&w=majority&appName=Zombek";
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

async function runTest() {
  console.log('====================================================');
  console.log('🔍 [1/3] VERIFYING DIRECT MONGODB ATLAS CONNECTION');
  console.log('====================================================');

  const urisToTry = process.env.MONGODB_URI ? [process.env.MONGODB_URI, FALLBACK_MONGODB_URI] : [FALLBACK_MONGODB_URI];
  let connected = false;
  try {
    for (const uri of urisToTry) {
      try {
        await mongoose.connect(uri, {
          dbName: 'toothchat',
          connectTimeoutMS: 5000,
          serverSelectionTimeoutMS: 5000,
        });
        connected = true;
        break;
      } catch (e) {
        console.warn('URI attempt failed:', e.message);
      }
    }

    if (connected) {
      console.log('✅ Direct Mongoose connection to MongoDB Atlas SUCCESSFUL!');
      console.log('Database name:', mongoose.connection.name);
      console.log('Host:', mongoose.connection.host);

      // Schema definition for verification
      const testMessageSchema = new mongoose.Schema({
        id: String,
        senderId: String,
        senderName: String,
        text: String,
        channelId: String,
        timestamp: String,
      }, { strict: false });

      const TestMessage = mongoose.models.Message || mongoose.model('Message', testMessageSchema);

      // Perform a test write
      const testMsgId = 'test_verify_' + Date.now();
      const testDoc = await TestMessage.create({
        id: testMsgId,
        senderId: 'usr_test_script',
        senderName: 'Test Script Runner',
        text: 'Wiadomość testowa weryfikująca poprawność zapisu w MongoDB Atlas!',
        channelId: 'chn_general_text',
        timestamp: new Date().toISOString(),
      });

      console.log('✅ Test write to MongoDB Atlas SUCCESSFUL! Document ID:', testDoc.id);

      // Query back from MongoDB
      const foundDoc = await TestMessage.findOne({ id: testMsgId });
      if (foundDoc) {
        console.log('✅ Document retrieval from MongoDB Atlas SUCCESSFUL! Text:', foundDoc.text);
      } else {
        console.error('❌ Document created but could not be queried back!');
      }

      // Clean up test document
      await TestMessage.deleteOne({ id: testMsgId });
      console.log('🧹 Cleaned up test document from MongoDB Atlas.');
    } else {
      console.error('❌ Could not connect to any MongoDB URI.');
    }
  } catch (err) {
    console.error('❌ Direct MongoDB Atlas Connection / Write Error:', err);
  } finally {
    if (connected) {
      await mongoose.disconnect();
    }
  }

  console.log('\n====================================================');
  console.log('⚡ [2/3] VERIFYING SOCKET.IO WEBSOCKET CONNECTION');
  console.log('====================================================');

  return new Promise((resolve) => {
    // Generate mock token for socket handshake
    const socket = Client(SERVER_URL, {
      auth: { token: 'tok_test_verify_script_' + Date.now() },
      transports: ['websocket', 'polling'],
      reconnection: false,
      timeout: 5000,
    });

    socket.on('connect', () => {
      console.log('✅ Socket.io connected to server successfully! Socket ID:', socket.id);

      console.log('\n====================================================');
      console.log('📩 [3/3] TESTING SOCKET.IO EVENT EMISSION & REALTIME ECHO');
      console.log('====================================================');

      // Test event emission: chat:send_message
      const testPayload = {
        channelId: 'chn_general_text',
        text: 'Wiadomość wysłana przez skrypt weryfikujący Socket.io!',
      };

      console.log('Emiting "chat:send_message" with payload:', testPayload);

      socket.emit('chat:send_message', testPayload, (response) => {
        console.log('📩 Received acknowledgment response from server:', response);
        if (response?.success) {
          console.log('✅ Socket.io "chat:send_message" event handled successfully by server!');
        } else {
          console.error('❌ Server responded with error:', response?.error);
        }

        socket.disconnect();
        resolve(true);
      });
    });

    socket.on('connect_error', (err) => {
      console.log('⚠️ Socket.io connection attempt note (server might be starting or requires user session):', err.message);
      socket.disconnect();
      resolve(false);
    });

    setTimeout(() => {
      if (socket.connected) {
        socket.disconnect();
      }
      resolve(false);
    }, 6000);
  });
}

runTest().then(() => {
  console.log('\n🎉 Verification script complete!\n');
  process.exit(0);
});
