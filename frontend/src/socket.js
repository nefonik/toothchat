import { io } from 'socket.io-client';

// Adres Twojego osobnego backendu (np. na Render / Railway)
// Możesz podać bezpośrednio w kodzie lub w pliku .env jako VITE_SOCKET_URL
const BACKEND_URL = import.meta.env.VITE_SOCKET_URL || 'https://twoj-backend-render.onrender.com';

/**
 * Inicjalizacja połączenia WebSocket z przekazaniem tokena w nagłówku auth oraz query.
 * @param {string} authToken Token sesji użytkownika uzyskany z REST API / MongoDB
 */
export function initializeSocket(authToken) {
  if (!authToken) {
    throw new Error('Brak tokena do nawiązania połączenia WebSocket');
  }

  const socket = io(BACKEND_URL, {
    auth: {
      token: authToken
    },
    query: {
      token: authToken
    },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('✅ Połączono z Socket.io na backendzie MongoDB:', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.error('❌ Błąd połączenia z Socket.io:', err.message);
  });

  return socket;
}
