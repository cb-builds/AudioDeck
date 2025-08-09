const WebSocket = require('ws');
const { WebSocketServer } = WebSocket;

const downloadIdToClients = new Map();
let wss;

function initWebSocketServer(server) {
  if (wss) return wss;
  wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const downloadId = url.searchParams.get('downloadId');
      if (!downloadId) {
        ws.close(1008, 'Missing downloadId');
        return;
      }
      let set = downloadIdToClients.get(downloadId);
      if (!set) {
        set = new Set();
        downloadIdToClients.set(downloadId, set);
      }
      set.add(ws);

      ws.on('close', () => {
        const clients = downloadIdToClients.get(downloadId);
        if (clients) {
          clients.delete(ws);
          if (clients.size === 0) downloadIdToClients.delete(downloadId);
        }
      });
      ws.on('error', () => {
        try { ws.close(); } catch (_) {}
      });

      // Acknowledge
      safeSend(ws, JSON.stringify({ type: 'connected', downloadId }));
    } catch (e) {
      try { ws.close(1011, 'Server error'); } catch (_) {}
    }
  });
  return wss;
}

function safeSend(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(data);
  }
}

function broadcastProgress(downloadId, payload) {
  const clients = downloadIdToClients.get(downloadId);
  if (!clients || clients.size === 0) return;
  const data = JSON.stringify(payload);
  for (const ws of clients) {
    try { safeSend(ws, data); } catch (_) {}
  }
}

module.exports = { initWebSocketServer, broadcastProgress };
