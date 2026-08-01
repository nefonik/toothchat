import crypto from 'crypto';
import { connectToMongoDB, UserModel } from '../_db.js';

function computeSha256(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex');
}

export default async function handler(req: any, res: any) {
  // CORS Headers
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
    const { token, displayName, ecdhPublicKeyJwk } = body || {};

    // 1. Walidacja danych wejściowych
    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ success: false, error: 'Wymagany jest prawidłowy token konta.' });
    }
    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      return res.status(400).json({ success: false, error: 'Wymagana jest nazwa użytkownika (displayName).' });
    }
    if (!ecdhPublicKeyJwk) {
      return res.status(400).json({ success: false, error: 'Wymagany jest klucz publiczny szyfrowania (ecdhPublicKeyJwk).' });
    }

    const cleanToken = token.trim();
    const cleanDisplayName = displayName.trim();
    const tokenHash = computeSha256(cleanToken);

    // 2. Połączenie z MongoDB z obsługą serverless cache
    await connectToMongoDB();

    // Sprawdzenie czy token już istnieje
    const existingUser = await UserModel.findOne({ tokenHash });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'Ten token jest już zarejestrowany. Skorzystaj z opcji logowania.',
      });
    }

    // 3. Generowanie unikalnego ID i Tagu użytkownika
    const userId = 'usr_' + crypto.randomBytes(8).toString('hex');
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const userTag = `${cleanDisplayName}#${randomNum}`;

    const newUser = {
      id: userId,
      tokenHash,
      displayName: cleanDisplayName,
      userTag,
      ecdhPublicKey: typeof ecdhPublicKeyJwk === 'string' ? ecdhPublicKeyJwk : JSON.stringify(ecdhPublicKeyJwk),
      status: 'online',
      friends: [],
      createdAt: new Date().toISOString(),
    };

    // 4. Zapis w bazie danych
    await UserModel.create(newUser);

    return res.status(200).json({
      success: true,
      user: {
        id: newUser.id,
        displayName: newUser.displayName,
        userTag: newUser.userTag,
        status: newUser.status,
      },
    });
  } catch (err: any) {
    console.error('[API Register Error]:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Wystąpił wewnętrzny błąd serwera podczas rejestracji.',
      stack: err?.stack,
      details: String(err),
    });
  }
}
