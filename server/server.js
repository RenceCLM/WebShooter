const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const GameState = require('./gameState');
const config = require('./config');

const app = express();
const server = http.createServer(app);

// Create WebSocket servers WITHOUT auto-handling upgrades
const wss = new WebSocket.Server({ noServer: true });
const debugWss = new WebSocket.Server({ noServer: true });

const PORT = process.env.PORT || 3000;
const gameState = new GameState();
const verboseRealtimeLogs = Boolean(config.logging && config.logging.verboseRealtime);

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Serve debug page
app.get('/debug', (req, res) => {
  res.sendFile(path.join(__dirname, './debug.html'));
});

// Store connected clients
const clients = new Map();
const debugClients = new Set();

// Handle HTTP upgrades - route to correct WebSocket server
server.on('upgrade', (request, socket, head) => {
  try {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    if (verboseRealtimeLogs) {
      console.log(`🔌 WebSocket upgrade request: ${pathname}`);
    }

    if (pathname.startsWith('/debug')) {
      if (verboseRealtimeLogs) {
        console.log('   → Routing to DEBUG server');
      }
      debugWss.handleUpgrade(request, socket, head, (ws) => {
        debugWss.emit('connection', ws, request);
      });
    } else {
      if (verboseRealtimeLogs) {
        console.log('   → Routing to GAME server');
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  } catch (error) {
    console.error('❌ WebSocket upgrade error:', error);
    socket.destroy();
  }
});

// Debug WebSocket connections
debugWss.on('connection', (ws) => {
  console.log('Debug client connected');
  debugClients.add(ws);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      if (message.type === 'debugKillPlayer') {
        const playerId = message.playerId;
        const player = gameState.players.get(playerId);
        
        if (player) {
          console.log(`🔫 DEBUG: Killing player ${player.name} (${playerId.substring(0, 8)})`);

          // Record a kill so the victim sees the death screen
          gameState.killPlayer(playerId, 'debug-admin', 'Admin');

          // Broadcast updated state with kill record
          broadcastToAll({
            type: 'gameState',
            state: gameState.getGameState()
          });
        }
      }
    } catch (error) {
      console.error('Debug message error:', error);
    }
  });

  ws.on('close', () => {
    console.log('Debug client disconnected');
    debugClients.delete(ws);
  });
});

wss.on('connection', (ws) => {
  const playerId = uuidv4();
  let hasJoined = false;
  
  console.log(`\n✅ New player connected: ${playerId}`);
  console.log(`   Total players: ${gameState.players.size + 1}`);

  // Send hello so the client can join
  ws.send(JSON.stringify({
    type: 'hello'
  }));

  // Handle messages from client
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      if (message.type === 'join') {
        if (hasJoined) {
          return;
        }

        const newPlayer = gameState.addPlayer(playerId);
        clients.set(playerId, ws);
        hasJoined = true;

        console.log(`   Assigned name: ${newPlayer.name}`);

        ws.send(JSON.stringify({
          type: 'joinResponse',
          name: newPlayer.name,
          worldLayout: gameState.getWorldLayout(),
          config: {
            arenaHalfSize: gameState.getArenaHalfSize(),
            shootCooldownMs: config.combat.shootCooldownMs,
            maxHealth: config.player.maxHealth,
            lookSensitivity: config.input.lookSensitivity,
            stateBroadcastHz: config.network.broadcastHz,
            snapshotPrecision: Number(config.network && config.network.snapshotPrecision) || 0,
            autoRespawn: Boolean(config.respawn && config.respawn.autoRespawn),
            autoRespawnTime: Number(config.respawn && config.respawn.autoRespawnTime) || 0
          }
        }));
      } else if (message.type === 'move') {
        if (!hasJoined) {
          return;
        }
        const player = gameState.players.get(playerId);
        if (!player || player.deathTime) {
          return;
        }
        // Update player position and rotation
        gameState.updatePlayerPosition(
          playerId,
          message.position,
          message.rotation,
          message.inputSequence
        );
      } else if (message.type === 'shoot') {
        if (!hasJoined) {
          return;
        }
        const player = gameState.players.get(playerId);
        if (!player) {
          return;
        }
        if (player.deathTime) {
          return;
        }

        const now = Date.now();
        if (now - player.lastShotTime < config.combat.shootCooldownMs) {
          return;
        }
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

        // Add bullet to game state
        const bullet = gameState.addBullet(
          playerId,
          position,
          direction
        );

        // Broadcast minimal bullet info for optional client effects (e.g. audio)
        broadcastToAll({
          type: 'bulletFired',
          bullet: {
            position: bullet.position,
            direction: bullet.direction
          }
        });
        if (verboseRealtimeLogs) {
          const playerName = player ? player.name : playerId.substring(0, 8);
          console.log(`Player ${playerName}: fired bullet`);
        }
      } else if (message.type === 'respawn') {
        if (!hasJoined) {
          return;
        }
        if (gameState.respawnPlayer(playerId)) {
          broadcastToAll({
            type: 'gameState',
            state: gameState.getGameState()
          });
        }
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  ws.on('close', () => {
    const player = gameState.players.get(playerId);
    const playerName = player ? player.name : playerId.substring(0, 8);
    console.log(`\n❌ Player disconnected: ${playerName}`);
    gameState.removePlayer(playerId);
    clients.delete(playerId);
    console.log(`   Total players: ${gameState.players.size}`);

  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for ${playerId}:`, error);
  });
});

// Simulation loop (authoritative world update)
setInterval(() => {
  gameState.updateSimpleBots();
  gameState.updateBullets();
  gameState.checkForRespawns();
}, 1000 / config.network.simulationHz);

// Broadcast loop (network snapshots)
let stateSequence = 0;
setInterval(() => {
  const state = gameState.getGameState({
    killsLimit: config.network.killsPerState,
    bulletsLimit: config.network.maxBulletsPerState
  });
  const hasDebugClients = debugClients.size > 0;

  // Send current game state to all clients
  broadcastToAll({
    type: 'gameState',
    sequence: stateSequence,
    serverTime: Date.now(),
    state: state
  });

  // Send debug state to all debug clients
  if (hasDebugClients) {
    const debugState = gameState.getGameState({
      killsLimit: config.network.killsPerState,
      bulletsLimit: config.network.maxBulletsPerState,
      includeWorld: true
    });

    broadcastDebug({
      type: 'debugState',
      sequence: stateSequence,
      serverTime: Date.now(),
      state: debugState
    });
  }

  stateSequence += 1;

  if (verboseRealtimeLogs && stateSequence % config.network.broadcastHz === 0) {
    if (state.bullets.length > 0) {
      console.log(`📦 Broadcast bullets: ${state.bullets.length}`);
    }
    if (state.kills.length > 0) {
      console.log(`📢 Broadcast kills (recent): ${state.kills.length}`);
    }
  }

  // Kills are capped in state snapshots, full history is still retained in kill log.
}, 1000 / config.network.broadcastHz);

function broadcastToAll(message) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function broadcastDebug(message) {
  const data = JSON.stringify(message);
  debugClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║     🎮 WebShooter Server Started       ║
╚════════════════════════════════════════╝

📍 Game Server:    http://localhost:${PORT}
🐛 Debug View:     http://localhost:${PORT}/debug

Server is ready for players to connect!
  `);
});
