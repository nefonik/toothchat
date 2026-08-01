import express from 'express';
import crypto from 'crypto';
import { connectToMongoDB, UserModel } from './_db.js';

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

function computeSha256(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex');
}

app.get('/api/health', async (req, res) => {
  const isMongoConnected = await connectToMongoDB();
  res.json({
    status: 'ok',
    mongoDbConnected: isMongoConnected,
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const isMongoConnected = await connectToMongoDB();
    const { token, displayName, ecdhPublicKeyJwk } = req.body || {};
    if (!token || !displayName || !ecdhPublicKeyJwk) {
      return res.status(400).json({ success: false, error: 'Nieprawidłowe dane rejestracji' });
    }

    const tokenHash = computeSha256(token);
    if (isMongoConnected) {
      const existing = await UserModel.findOne({ tokenHash });
      if (existing) {
        return res.status(400).json({ success: false, error: 'Ten token jest już powiązany z kontem' });
      }
    }

    const userId = 'usr_' + crypto.randomBytes(8).toString('hex');
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const userTag = `${displayName.trim()}#${randomNum}`;

    const newUser = {
      id: userId,
      tokenHash,
      displayName: displayName.trim(),
      userTag,
      ecdhPublicKey: ecdhPublicKeyJwk,
      status: 'online',
      friends: [],
      createdAt: new Date().toISOString(),
    };

    if (isMongoConnected) {
      await UserModel.create(newUser);
    }

    return res.json({ success: true, user: newUser });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Błąd serwera przy rejestracji' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const isMongoConnected = await connectToMongoDB();
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ success: false, error: 'Wymagany token' });
    }

    const tokenHash = computeSha256(token);
    if (isMongoConnected) {
      const user = await UserModel.findOne({ tokenHash });
      if (!user) {
        return res.status(400).json({ success: false, error: 'Nieprawidłowy token konta. Sprawdź wpisany token.' });
      }
      return res.json({ success: true, userId: user.id, user });
    }

    return res.status(400).json({ success: false, error: 'Brak połączenia z bazą danych MongoDB.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Błąd logowania' });
  }
});

export default app;
