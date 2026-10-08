import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNotificationHandler, notificationOptions } from './notifications.mjs';
import { createAssistantHandler, assistantOptions } from './assistant.mjs';

import { attachRoomServer, roomOptions, clientAddress } from './room.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
let notify;
let assistant;
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const server = createServer((request, response) => {
  notify(request, response, () => {
    assistant(request, response, () => {
      void serve(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(500);
        response.end();
      });
    });
  });
});
const options = roomOptions(process.env);
const room = attachRoomServer(server, options);
notify = createNotificationHandler({ ...notificationOptions(process.env),
  authorize: (message, request) => room.authorize({ type: 'message', roomId: 'carters-studio',
    player: { id: message.playerId, name: message.name }, token: message.token,
    message: { id: message.id, text: message.text } }, request),
});
assistant = createAssistantHandler({ ...assistantOptions(process.env),
  authorize: room.authorize, getVisitors: room.visitors,
  getClientAddress: request => clientAddress(request, options.trustedProxyHops),
});
async function serve(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400); response.end(); return; }
  let file = resolve(root, '.' + pathname);
  if (file !== resolve(root) && !file.startsWith(resolve(root) + sep)) {
    response.writeHead(403); response.end(); return;
  }
  if (pathname.endsWith('/')) file = resolve(file, 'index.html');
  let info;
  try { info = await stat(file); }
  catch {
    if (extname(pathname) || pathname.startsWith('/api/')) {
      response.writeHead(404); response.end(); return;
    }
    file = resolve(root, 'index.html'); info = await stat(file);
  }
  if (!info.isFile()) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, {
    'Content-Type': mime[extname(file)] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': pathname.startsWith('/assets/index-') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (request.method === 'HEAD') { response.end(); return; }
  createReadStream(file).on('error', () => response.destroy()).pipe(response);
}
server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`Studio server listening on port ${server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  room.close();
  server.close(() => process.exit(0));
});
