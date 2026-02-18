# WebShooter - Simple 3D Multiplayer Web Shooter

A real-time 3D multiplayer shooter game built with Node.js, Express, WebSockets, and Three.js.

## Features

- **Real-time Multiplayer**: Play with other players in the same game world
- **3D Graphics**: Built with Three.js for immersive gameplay
- **Simple Controls**: WASD to move, mouse to look, click/space to shoot
- **Live HUD**: See your position, health, score, and player count
- **Bullet Physics**: Bullets travel and detect collisions with players
- **Health System**: Get damaged when hit, respawn at full health
- **Scoring**: Earn points for eliminating other players

## Project Structure

```
WebShooter/
├── server/
│   ├── server.js          # Main Node.js server with WebSocket support
│   ├── gameState.js       # Game logic and state management
│   └── package.json       # Dependencies
│
├── client/
│   ├── index.html         # Main HTML file
│   ├── css/
│   │   └── style.css      # Game styling and HUD
│   └── js/
│       ├── network.js     # WebSocket client communication
│       ├── input.js       # Keyboard and mouse input handling
│       ├── player.js      # Player management and 3D meshes
│       └── game.js        # Main game engine with Three.js
│
└── README.md
```

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
- **Game Loop**: Runs at 60 FPS, updates bullet positions and handles collisions
- **Broadcasting**: Sends game state updates to all connected players

### Client Side (Browser)
- **Three.js Rendering**: Renders 3D scene with players, bullets, and environment
- **Input Handling**: Captures keyboard and mouse input
- **Network Communication**: Sends player position/rotation updates and shoot events
- **Player Interpolation**: Updates remote player positions based on server data
- **HUD Display**: Shows current position, health, score, and player count

## Game Mechanics

1. **Movement**: Use WASD to move around the arena
2. **Aiming**: Use mouse to look around (auto-aims forward)
3. **Shooting**: Click or press Space to fire bullets
4. **Damage**: Players take 25 damage per hit
5. **Respawn**: When health reaches 0, respawn with full health at a random location
6. **Scoring**: Get 10 points for each elimination

## Customization

You can easily modify:

- **Bullet Damage**: In `server/gameState.js`, change the value in `player.health -= 25`
- **Bullet Speed**: In `server/gameState.js`, adjust `bullet.speed`
- **Movement Speed**: In `client/js/game.js`, change the `speed` variable
- **Shooting Cooldown**: In `client/js/game.js`, adjust `shootCooldown`
- **Arena Size**: In both server and client, change the `maxBounds` and game area dimensions
- **Colors & Styling**: Edit `client/css/style.css`

## Development

To run with auto-reload on code changes:

```bash
cd server
npm install -g nodemon
npm run dev
```










## Server API

All communication happens via WebSocket with JSON messages. This is the full list of messages a bot can send and should expect to receive.

Client can send
-join (no payload; server assigns name)
-move
-shoot
-respawn

Servers will send 
-hello
-join response
-game state
-bullet fired (mostly for sound effects)



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
  "name": "SwiftPhoenix42"
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


## Credits

- Built with [Node.js](https://nodejs.org/) and [Express](https://expressjs.com/)
- 3D graphics with [Three.js](https://threejs.org/)
- Real-time communication with [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
