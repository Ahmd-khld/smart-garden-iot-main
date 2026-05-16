import { io } from 'socket.io-client';

// Create a single socket instance for the entire application.
// 'autoConnect: false' prevents it from connecting immediately upon import.
// We will manually call socket.connect() inside our components.
export const socket = io('http://localhost:5000', {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});