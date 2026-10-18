import http from 'http';
import app from './app';
import { env } from './config/env';
import { initSocketServer, closeSocketServer } from './services/socket.service';

const httpServer = http.createServer(app);
const io = initSocketServer(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`🚀 Sahaara backend server listening on port ${env.PORT} [${env.NODE_ENV}]`);
  console.log(`🔌 Socket.IO real-time gateway initialized`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP and Socket servers');
  await closeSocketServer();
  httpServer.close(() => {
    console.log('HTTP server closed');
  });
});

export { httpServer, io };
