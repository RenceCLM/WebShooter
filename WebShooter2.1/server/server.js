const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const GameState = require('./gameState');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const PORT = process.env.PORT || 3000;
const gameState = new GameState();
const clients = new Map();

app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/game.html'));
});

// Handle HTTP upgrades
server.on('upgrade', (request, socket, head) => {
  try {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } catch (error) {
    console.error('WebSocket upgrade error:', error);
    socket.destroy();
  }
});

function broadcastToAll(message) {
  const data = JSON.stringify(message);
  for (const ws of clients.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

wss.on('connection', (ws) => {
  const playerId = gameState.generatePlayerName();
  let hasJoined = false;

  console.log(`Player connected: ${playerId}`);

  ws.send(JSON.stringify({ type: 'hello' }));

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      if (message.type === 'join') {
        if (hasJoined) return;

        const newPlayer = gameState.addPlayer(playerId);
        clients.set(playerId, ws);
        hasJoined = true;

        console.log(`Player joined: ${newPlayer.name}`);

        ws.send(JSON.stringify({
          type: 'joinResponse',
          playerId: playerId,
          playerName: newPlayer.name
        }));
      } else if (message.type === 'move') {
        if (!hasJoined) return;
        gameState.updatePlayerPosition(
          playerId,
          message.position,
          message.rotation,
          message.inputSequence
        );
      } else if (message.type === 'shoot') {
        if (!hasJoined) return;
        const player = gameState.players.get(playerId);
        if (!player) return;

        const now = Date.now();
        if (now - player.lastShotTime < 100) return;
        player.lastShotTime = now;

        const yaw = player.rotation.y || 0;
        const pitch = player.rotation.x || 0;
        const cosPitch = Math.cos(pitch);
        const direction = {
          x: -Math.sin(yaw) * cosPitch,
          y: Math.sin(pitch),
          z: -Math.cos(yaw) * cosPitch
        };

        const position = {
          x: player.position.x,
          y: player.position.y + 0.6,
          z: player.position.z
        };

        gameState.addBullet(playerId, position, direction);
      }
    } catch (error) {
      console.error('Message error:', error);
    }
  });

  ws.on('close', () => {
    console.log(`Player disconnected: ${playerId}`);
    gameState.removePlayer(playerId);
    clients.delete(playerId);
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for ${playerId}:`, error);
  });
});

// Simulation loop
setInterval(() => {
  gameState.updateBullets(1 / 60);
}, 1000 / 60);

// Broadcast loop
setInterval(() => {
  broadcastToAll({
    type: 'gameState',
    serverTime: Date.now(),
    state: gameState.getGameState()
  });
}, 1000 / 30);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
});
