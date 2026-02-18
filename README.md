# WebShooter - Simple 3D Multiplayer Web Shooter

A real-time 3D multiplayer shooter game built with Node.js, Express, WebSockets, and Three.js.



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

## Bot Training + Scaling Notes

This project intentionally keeps bot training simple with plain JSON:
- Bot/client movement input is still sent as `move` JSON (`position`, `rotation`, `inputSequence`).
- Bots/clients still receive `gameState` JSON every broadcast tick.

For higher loads (many bullets + players/bots), tune these in [server/config.js](server/config.js):
- `network.maxBulletsPerState`: caps bullets sent per snapshot to reduce payload size.
- `network.snapshotPrecision`: rounds numeric snapshot values (e.g. `2` = 2 decimals).
- `network.collisionGridCellSize`: broadphase cell size used by server bullet collision checks.

These optimizations keep the JSON protocol readable while making simulation + broadcast more scalable.

## Bot Mix Configuration

You can blend server-side bot types in [server/config.js](server/config.js) under `bots.counts`:
- `dumb`: slow walk + slow fire, straightforward behavior.
- `simple`: regular speed, line-of-sight shooting, active dodging.
- `seeking`: hunts nearest targets even off-LOS and dodges toward cover.
- `teleporting`: teleports near nearest targets and teleports away from danger.
- `danger`: very fast seeker with high projectile speed.
- `monsters`: fastest seeker with the most aggressive projectile profile.

Example:

```js
bots: {
  counts: {
    dumb: 2,
    simple: 4,
    seeking: 2,
    teleporting: 1,
    danger: 2,
    monsters: 1
  }
}
```

`simplebot` is still supported as a fallback if all `bots.counts` are `0`.

## World Generation Scaling

World layout generation is also configurable in [server/config.js](server/config.js) under `world`.

Recommended defaults for larger arenas:
- `autoScaleBuildings: true`: scales building count automatically with `arena.halfSize`.
- `buildingScaleBaseline: 80`: baseline arena size used for building scaling.
- `maxBuildings: 140`: hard cap so huge maps do not over-generate blocks.
- `crossedWalls: true`: adds structured cross-style wall patterns through the city.
- `largeBuildingDoorThreshold`, `largeBuildingDoorsPerSide`, `maxDoorSides`: gives bigger buildings multiple doors (including multiple doors on the same side).

Example:

```js
world: {
  wallsCount: 24,
  buildingsCount: 10,
  autoScaleBuildings: true,
  buildingScaleBaseline: 80,
  maxBuildings: 140,
  crossedWalls: true,
  largeBuildingDoorThreshold: 30,
  largeBuildingDoorsPerSide: 2,
  maxDoorSides: 4
}
```

## Server API

All communication happens via WebSocket JSON messages.

There are **2 WebSocket channels**:
- **Game channel**: `ws(s)://<host>/`
- **Debug channel**: `ws(s)://<host>/debug`

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
  "rotation": { "x": 0, "y": 0, "z": 0 },
  "inputSequence": 42
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
  "worldLayout": {
    "generatedAt": 1234567890,
    "walls": [
      { "x": 12.4, "z": -8.1, "axis": "x", "length": 22, "thickness": 2, "height": 5 }
    ],
    "buildings": [
      {
        "x": -20,
        "z": 18,
        "width": 24,
        "depth": 22,
        "wallThickness": 1.8,
        "wallHeight": 6,
        "doorWidth": 6,
        "doorSide": "east",
        "wallSegments": [
          { "x": -25, "z": 7, "width": 8, "depth": 1.8, "height": 6 },
          { "x": -14, "z": 7, "width": 7, "depth": 1.8, "height": 6 }
        ]
      }
    ],
    "ramps": []
  },
  "config": {
    "arenaHalfSize": 80,
    "shootCooldownMs": 100,
    "maxHealth": 100,
    "lookSensitivity": 0.006,
    "stateBroadcastHz": 30,
    "snapshotPrecision": 2,
    "autoRespawn": true,
    "autoRespawnTime": 3
  }
}
```

#### Game state updates (sent at configured broadcast rate, default 30 FPS)
```json
{
  "type": "gameState",
  "sequence": 120,
  "serverTime": 1234567890,
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
        "lastKillerName": null,
        "lastInputSequence": 42
      }
    ],
    "bullets": [
      {
        "id": "uuid-0",
        "playerId": "uuid",
        "position": { "x": 0, "y": 1, "z": 0 },
        "direction": { "x": 0, "y": 0, "z": -1 },
        "speed": 1,
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

`state.kills` is capped to a recent window (default `25` latest entries) for payload size.

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
  "sequence": 120,
  "serverTime": 1234567890,
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
