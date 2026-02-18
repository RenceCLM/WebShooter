# WebShooter - Simple 3D Multiplayer Web Shooter

A real-time 3D multiplayer shooter game built with Node.js, Express, WebSockets, and Three.js.


## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- npm

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Start the Server

```bash
cd server
npm start
```

The server will start on `http://localhost:3000`

### 3. Open in Browser

Open your web browser and navigate to:
```
http://localhost:3000
```

Multiple players can join from different browser windows/tabs or different machines on the same network.

## Controls

| Key/Input | Action |
|-----------|--------|
| **W** | Move Forward |
| **A** | Strafe Left |
| **S** | Move Backward |
| **D** | Strafe Right |
| **Mouse Move** | Look Around (requires click first) |
| **Left Click** | Shoot |
| **Space** | Shoot (alternative) |

## How It Works

### Server Side (Node.js)
- **WebSocket Server**: Maintains persistent connection with each player
- **Game State**: Tracks all players, their positions, health, and bullets
- **Broadcasting**: Sends game state updates to all connected players

### Client Side (Browser)
- **Three.js Rendering**: Renders 3D scene with players, bullets, and environment
- **Network Communication**: Sends player position/rotation updates and shoot events
- **Player Interpolation**: Updates remote player positions based on server data

## Development

To run with auto-reload on code changes:

```bash
cd server
npm install -g nodemon
npm run dev
```










## Server API

All communication happens via WebSocket JSON messages.

There are **2 WebSocket channels**:
- **Game channel**: `ws(s)://<host>/`

### Game channel message list

Client can send:
- `join` (no payload; server assigns name)
- `move`
- `shoot`
- `respawn`

Server can send:
- `hello`
- `joinResponse`
- `gameState`
- `bulletFired` (optional immediate event for effects)



### Client → Server (what a player can send)

#### Move/update rotation
```json
{
  "type": "move",
  "position": { "x": 0, "y": 1, "z": 0 },
  "rotation": { "x": 0, "y": 0, "z": 0 }
}
```

#### Shoot
```json
{
  "type": "shoot"
}
```

#### Join (server assigns name)
```json
{
  "type": "join"
}
```

#### Respawn (after death screen)
```json
{
  "type": "respawn"
}
```

### Server → Client

#### Hello (server prompts the client to join)
```json
{
  "type": "hello"
}
```

#### Join response (server assigns name)
```json
{
  "type": "joinResponse",
  "name": "SwiftPhoenix42",
  "config": {
    "arenaHalfSize": 80,
    "shootCooldownMs": 100,
    "maxHealth": 100,
    "lookSensitivity": 0.006
  }
}
```

#### Game state updates (sent at 60 FPS)
```json
{
  "type": "gameState",
  "state": {
    "players": [
      {
        "id": "uuid",
        "name": "SwiftPhoenix42",
        "position": { "x": 0, "y": 1, "z": 0 },
        "rotation": { "x": 0, "y": 0, "z": 0 },
        "color": 16746240,
        "health": 100,
        "score": 0,
        "lastUpdate": 1234567890,
        "deathTime": null,
        "lastKillerName": null
      }
    ],
    "bullets": [
      {
        "id": "uuid-0",
        "playerId": "uuid",
        "position": { "x": 0, "y": 1, "z": 0 },
        "direction": { "x": 0, "y": 0, "z": -1 },
        "speed": 0.5,
        "age": 0,
        "maxAge": 300
      }
    ],
    "kills": [
      {
        "killer": "SwiftPhoenix42",
        "killerId": "uuid",
        "victim": "NeonRaven7",
        "victimId": "uuid",
        "timestamp": 1234567890
      }
    ],
    "timestamp": 1234567890
  }
}
```

#### Bullet fired (immediate event, optional)
Use this only for fast client-side effects (e.g., audio). The authoritative bullet list is in `gameState`.

```json
{
  "type": "bulletFired",
  "bullet": {
    "position": { "x": 0, "y": 1, "z": 0 },
    "direction": { "x": 0, "y": 0, "z": -1 }
  }
}
```

### Debug channel message list (`/debug`)

Debug client can send:
- `debugKillPlayer`

Debug server can send:
- `debugState`

#### Debug kill player
```json
{
  "type": "debugKillPlayer",
  "playerId": "uuid"
}
```

#### Debug state update
```json
{
  "type": "debugState",
  "state": {
    "players": [],
    "bullets": [],
    "kills": [],
    "timestamp": 1234567890
  }
}
```


## Credits

- Built with [Node.js](https://nodejs.org/) and [Express](https://expressjs.com/)
- 3D graphics with [Three.js](https://threejs.org/)
- Real-time communication with [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
