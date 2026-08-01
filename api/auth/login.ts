import crypto from 'crypto';
import { connectToMongoDB, UserModel } from '../_db.js';

function computeSha256(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex');
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metoda niedozwolona. Użyj POST.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }
    const { token } = body || {};
    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ success: false, error: 'Wymagany jest token konta.' });
    }

    const cleanToken = token.trim();
    const tokenHash = computeSha256(cleanToken);

    const isMongoConnected = await connectToMongoDB();

    if (isMongoConnected) {
      const user = await UserModel.findOne({ tokenHash });
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Nieprawidłowy token konta. Użytkownik nie istnieje.',
        });
      }
      return res.status(200).json({
        success: true,
        userId: user.id,
        user: {
          id: user.id,
          displayName: user.displayName,
          userTag: user.userTag,
          status: user.status,
          ecdhPublicKey: user.ecdhPublicKey,
        },
      });
    }

    return res.status(503).json({
      success: false,
      error: 'Brak połączenia z bazą danych MongoDB Atlas.',
    });
  } catch (err: any) {
    console.error('[API Login Error]:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Wystąpił wewnętrzny błąd serwera podczas logowania.',
      stack: err?.stack,
      details: String(err),
    });
  }
}
