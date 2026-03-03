// Minimal game state for WebShooter 2.1
class GameState {
  static adjectives = [
    'Swift', 'Fierce', 'Rapid', 'Silent', 'Shadow', 'Flash', 'Cyber', 'Nova',
    'Phantom', 'Vortex', 'Storm', 'Void', 'Apex', 'Chrome', 'Icon', 'Echo',
    'Bolt', 'Titan', 'Nexus', 'Blaze', 'Steel', 'Quantum', 'Sonic', 'Helix',
    'Rogue', 'Prism', 'Pulse', 'Volt', 'Neon', 'Surge', 'Scarlet', 'Inferno'
  ];

  static ARENA_HALF_SIZE = 600;
  static BULLET_HIT_TTL_MS = 180;

  // Layout C obstacles (for collision detection)
  static COVER_WALLS = [
    { x: -420, z: -170, width: 12, depth: 200, height: 14 },
    { x: -420, z: 170, width: 12, depth: 200, height: 14 },
    { x: 420, z: -170, width: 12, depth: 200, height: 14 },
    { x: 420, z: 170, width: 12, depth: 200, height: 14 },
    { x: -170, z: -420, width: 200, depth: 12, height: 14 },
    { x: 170, z: -420, width: 200, depth: 12, height: 14 },
    { x: -170, z: 420, width: 200, depth: 12, height: 14 },
    { x: 170, z: 420, width: 200, depth: 12, height: 14 },
    { x: -170, z: 0, width: 14, depth: 200, height: 11 },
    { x: 170, z: 0, width: 14, depth: 200, height: 11 },
    { x: 0, z: -170, width: 200, depth: 14, height: 11 },
    { x: 0, z: 170, width: 200, depth: 14, height: 11 },
    { x: 0, z: 0, width: 14, depth: 160, height: 11 },
    { x: 0, z: 0, width: 160, depth: 14, height: 11 }
  ];

  static BUILDINGS = [
    { x: -280, z: -280, width: 110, depth: 86, height: 11 },
    { x: 280, z: -280, width: 110, depth: 86, height: 11 },
    { x: -280, z: 280, width: 110, depth: 86, height: 11 },
    { x: 280, z: 280, width: 110, depth: 86, height: 11 },
    { x: -100, z: -280, width: 92, depth: 88, height: 10.6 },
    { x: 100, z: -280, width: 92, depth: 88, height: 10.6 },
    { x: -100, z: 280, width: 92, depth: 88, height: 10.6 },
    { x: 100, z: 280, width: 92, depth: 88, height: 10.6 },
    { x: -280, z: -100, width: 88, depth: 92, height: 10.6 },
    { x: -280, z: 100, width: 88, depth: 92, height: 10.6 },
    { x: 280, z: -100, width: 88, depth: 92, height: 10.6 },
    { x: 280, z: 100, width: 88, depth: 92, height: 10.6 }
  ];

  constructor() {
    this.players = new Map();
    this.bullets = [];
    this.bulletId = 0;
  }

  generatePlayerName() {
    const adjective = GameState.adjectives[Math.floor(Math.random() * GameState.adjectives.length)];
    const number = Math.floor(Math.random() * 9999) + 1;
    return `${adjective}${number}`;
  }

  addPlayer(playerId) {
    const player = {
      id: playerId,
      name: playerId,
      position: {
        x: (Math.random() * 2 - 1) * GameState.ARENA_HALF_SIZE,
        y: 1,
        z: (Math.random() * 2 - 1) * GameState.ARENA_HALF_SIZE
      },
      rotation: { x: 0, y: 0 },
      health: 100,
      lastShotTime: 0,
      lastInputSequence: 0
    };
    this.players.set(playerId, player);
    return player;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
  }

  updatePlayerPosition(playerId, position, rotation, inputSequence) {
    const player = this.players.get(playerId);
    if (!player) return;

    const halfSize = GameState.ARENA_HALF_SIZE;
    const safePosition = {
      x: Number.isFinite(position?.x) ? Math.max(-halfSize, Math.min(halfSize, position.x)) : player.position.x,
      y: 1,
      z: Number.isFinite(position?.z) ? Math.max(-halfSize, Math.min(halfSize, position.z)) : player.position.z
    };

    player.position = safePosition;
    player.rotation = { ...rotation };
    if (Number.isFinite(inputSequence)) {
      player.lastInputSequence = inputSequence;
    }
  }

  addBullet(playerId, position, direction) {
    const bullet = {
      id: this.bulletId++,
      playerId: playerId,
      position: { ...position },
      direction: { ...direction },
      speed: 500,
      createdAt: Date.now(),
      state: 'air',
      hitType: null,
      hitPlayerId: null,
      impactPosition: null,
      impactNormal: null,
      removeAt: null
    };
    this.bullets.push(bullet);
    return bullet;
  }

  getAabbImpactNormal(x, y, z, obstacle) {
    const halfWidth = obstacle.width / 2;
    const halfDepth = obstacle.depth / 2;
    const minX = obstacle.x - halfWidth;
    const maxX = obstacle.x + halfWidth;
    const minY = 0;
    const maxY = obstacle.height;
    const minZ = obstacle.z - halfDepth;
    const maxZ = obstacle.z + halfDepth;

    if (x < minX || x > maxX || y < minY || y > maxY || z < minZ || z > maxZ) {
      return null;
    }

    const distances = [
      { axis: 'x', sign: -1, dist: Math.abs(x - minX) },
      { axis: 'x', sign: 1, dist: Math.abs(maxX - x) },
      { axis: 'y', sign: -1, dist: Math.abs(y - minY) },
      { axis: 'y', sign: 1, dist: Math.abs(maxY - y) },
      { axis: 'z', sign: -1, dist: Math.abs(z - minZ) },
      { axis: 'z', sign: 1, dist: Math.abs(maxZ - z) }
    ];

    distances.sort((a, b) => a.dist - b.dist);
    const nearest = distances[0];

    if (nearest.axis === 'x') return { x: nearest.sign, y: 0, z: 0 };
    if (nearest.axis === 'y') return { x: 0, y: nearest.sign, z: 0 };
    return { x: 0, y: 0, z: nearest.sign };
  }

  checkObstacleCollision(x, y, z) {
    for (const building of GameState.BUILDINGS) {
      const normal = this.getAabbImpactNormal(x, y, z, building);
      if (normal) {
        return {
          hitType: 'wall',
          impactPosition: { x, y, z },
          impactNormal: normal
        };
      }
    }

    for (const wall of GameState.COVER_WALLS) {
      const normal = this.getAabbImpactNormal(x, y, z, wall);
      if (normal) {
        return {
          hitType: 'wall',
          impactPosition: { x, y, z },
          impactNormal: normal
        };
      }
    }

    return null;
  }

  checkPlayerCollision(bullet) {
    const hitRadius = 1.0;
    const hitRadiusSq = hitRadius * hitRadius;
    for (const player of this.players.values()) {
      if (player.id === bullet.playerId) continue;

      const dx = bullet.position.x - player.position.x;
      const dz = bullet.position.z - player.position.z;
      const horizontalDistSq = dx * dx + dz * dz;
      if (horizontalDistSq > hitRadiusSq) continue;

      const dy = Math.abs(bullet.position.y - (player.position.y + 0.8));
      if (dy > 1.2) continue;

      const length = Math.sqrt(horizontalDistSq);
      const normal = length > 0.0001
        ? { x: dx / length, y: 0, z: dz / length }
        : { x: 0, y: 1, z: 0 };

      return {
        hitType: 'player',
        hitPlayerId: player.id,
        impactPosition: { ...bullet.position },
        impactNormal: normal
      };
    }

    return null;
  }

  markBulletImpact(bullet, collision) {
    bullet.state = 'hit';
    bullet.hitType = collision.hitType;
    bullet.hitPlayerId = collision.hitPlayerId || null;
    bullet.impactPosition = collision.impactPosition || { ...bullet.position };
    bullet.impactNormal = collision.impactNormal || null;
    bullet.removeAt = Date.now() + GameState.BULLET_HIT_TTL_MS;
    bullet.speed = 0;
  }

  updateBullets(deltaTime) {
    const removed = [];
    const now = Date.now();
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];

      if (bullet.state !== 'air') {
        if (bullet.removeAt !== null && now >= bullet.removeAt) {
          removed.push(i);
        }
        continue;
      }

      bullet.position.x += bullet.direction.x * bullet.speed * deltaTime;
      bullet.position.y += bullet.direction.y * bullet.speed * deltaTime;
      bullet.position.z += bullet.direction.z * bullet.speed * deltaTime;

      // Remove bullets that hit arena boundaries
      if (Math.abs(bullet.position.x) > GameState.ARENA_HALF_SIZE ||
          Math.abs(bullet.position.z) > GameState.ARENA_HALF_SIZE) {
        const impactPosition = {
          x: Math.max(-GameState.ARENA_HALF_SIZE, Math.min(GameState.ARENA_HALF_SIZE, bullet.position.x)),
          y: bullet.position.y,
          z: Math.max(-GameState.ARENA_HALF_SIZE, Math.min(GameState.ARENA_HALF_SIZE, bullet.position.z))
        };
        const impactNormal = Math.abs(bullet.position.x) > GameState.ARENA_HALF_SIZE
          ? { x: bullet.position.x > 0 ? -1 : 1, y: 0, z: 0 }
          : { x: 0, y: 0, z: bullet.position.z > 0 ? -1 : 1 };
        this.markBulletImpact(bullet, {
          hitType: 'wall',
          impactPosition,
          impactNormal
        });
        continue;
      }

      // Remove bullets that hit obstacles
      const obstacleCollision = this.checkObstacleCollision(
        bullet.position.x,
        bullet.position.y,
        bullet.position.z
      );
      if (obstacleCollision) {
        this.markBulletImpact(bullet, obstacleCollision);
        continue;
      }

      const playerCollision = this.checkPlayerCollision(bullet);
      if (playerCollision) {
        this.markBulletImpact(bullet, playerCollision);
        continue;
      }

      // Remove bullets that are too old (safety check)
      const age = Date.now() - bullet.createdAt;
      if (age > 5000) {
        removed.push(i);
        continue;
      }
    }

    for (let i = removed.length - 1; i >= 0; i--) {
      this.bullets.splice(removed[i], 1);
    }
  }

  getGameState() {
    const players = [];
    for (const player of this.players.values()) {
      players.push({
        id: player.id,
        name: player.name,
        position: player.position,
        rotation: player.rotation,
        health: player.health,
        lastInputSequence: player.lastInputSequence
      });
    }

    const bullets = this.bullets.slice(0, 300).map(b => ({
      id: b.id,
      playerId: b.playerId,
      position: b.position,
      direction: b.direction,
      state: b.state,
      hitType: b.hitType,
      hitPlayerId: b.hitPlayerId,
      impactPosition: b.impactPosition,
      impactNormal: b.impactNormal
    }));

    return { players, bullets };
  }
}

module.exports = GameState;
