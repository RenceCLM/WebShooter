// Game state management
const fs = require('fs');
const path = require('path');
const config = require('./config');

class GameState {
  constructor() {
    this.players = new Map(); // playerId -> player object
    this.bullets = []; // array of bullet objects
    this.bulletId = 0;
    this.allKills = []; // Track all kills since last reset
    this.killLogPath = path.resolve(__dirname, config.killLog.path);
    this.killLogResetMs = config.killLog.resetMs;
    this.resetKillLog();
    this.startKillLogRotation();
    this.nameAdjectives = [
      'Swift', 'Fierce', 'Rapid', 'Silent', 'Shadow', 'Flash', 'Cyber', 'Nova',
      'Phantom', 'Vortex', 'Storm', 'Void', 'Apex', 'Chrome', 'Icon', 'Echo',
      'Bolt', 'Titan', 'Nexus', 'Blaze', 'Steel', 'Quantum', 'Sonic', 'Helix',
      'Rogue', 'Prism', 'Pulse', 'Volt', 'Neon', 'Surge', 'Scarlet', 'Inferno'
    ];
    this.nameNouns = [
      'Falcon', 'Dragon', 'Phoenix', 'Viper', 'Hawk', 'Raven', 'Angel', 'Demon',
      'Specter', 'Panther', 'Tiger', 'Wolf', 'Bear', 'Eagle', 'Cobra', 'Reaper',
      'Hunter', 'Ninja', 'Cipher', 'Pathfinder', 'Scout', 'Ranger', 'Striker',
      'Wraith', 'Ghost', 'Blade', 'Fang', 'Talon', 'Assassin'
    ];
    this.playerColors = [
      0xFF8800,
      0x00CCFF,
      0xFF33AA,
      0x33FF88,
      0xFFCC00,
      0xAA66FF,
      0x66FFEE,
      0xFF6666
    ];
  }

  resetKillLog() {
    this.allKills = [];
    fs.writeFile(this.killLogPath, '', (error) => {
      if (error) {
        console.error('❌ Failed to reset kill log:', error);
      } else {
        console.log(`🧹 Kill log reset: ${this.killLogPath}`);
      }
    });
  }

  startKillLogRotation() {
    setInterval(() => {
      this.resetKillLog();
    }, this.killLogResetMs);
  }

  appendKillToLog(kill) {
    const line = `${JSON.stringify(kill)}\n`;
    fs.appendFile(this.killLogPath, line, (error) => {
      if (error) {
        console.error('❌ Failed to append kill log:', error);
      }
    });
  }

  getRandomPlayerColor() {
    const index = Math.floor(Math.random() * this.playerColors.length);
    return this.playerColors[index];
  }

  generateRandomName() {
    const adjective = this.nameAdjectives[Math.floor(Math.random() * this.nameAdjectives.length)];
    const noun = this.nameNouns[Math.floor(Math.random() * this.nameNouns.length)];
    const number = Math.floor(Math.random() * 999) + 1;
    return `${adjective}${noun}${number}`;
  }

  getUniqueName() {
    let name = this.generateRandomName();
    const existing = new Set(Array.from(this.players.values()).map(player => player.name));
    let guard = 0;
    while (existing.has(name) && guard < 100) {
      name = this.generateRandomName();
      guard += 1;
    }
    return name;
  }

  addPlayer(playerId, name) {
    const spawnRange = config.arena.halfSize;
    const player = {
      id: playerId,
      name: name && name.trim().length > 0 ? name.trim() : this.getUniqueName(),
      position: {
        x: Math.random() * spawnRange * 2 - spawnRange,
        y: config.arena.spawnY,
        z: Math.random() * spawnRange * 2 - spawnRange
      },
      rotation: { x: 0, y: 0, z: 0 },
      color: this.getRandomPlayerColor(),
      health: config.player.maxHealth,
      score: 0,
      lastUpdate: Date.now(),
      deathTime: null, // Track when player died for respawn delay
      lastKillerName: null,
      lastShotTime: 0
    };
    this.players.set(playerId, player);
    return player;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
  }

  updatePlayerPosition(playerId, position, rotation) {
    const player = this.players.get(playerId);
    if (player) {
      player.position = position;
      player.rotation = rotation;
      player.lastUpdate = Date.now();
    }
  }

  addBullet(playerId, position, direction) {
    const bullet = {
      id: `${playerId}-${this.bulletId++}`,
      playerId: playerId,
      position: { ...position },
      direction: { ...direction },
      speed: config.combat.bulletSpeed,
      age: 0,
      maxAge: 300 // 300 ticks before disappearing
    };
    this.bullets.push(bullet);
    return bullet;
  }

  updateBullets() {
    // Update bullet positions
    this.bullets = this.bullets.filter(bullet => {
      bullet.position.x += bullet.direction.x * bullet.speed;
      bullet.position.y += bullet.direction.y * bullet.speed;
      bullet.position.z += bullet.direction.z * bullet.speed;
      bullet.age++;

      // Check collision with players
      for (const [playerId, player] of this.players) {
        if (bullet.playerId !== playerId && !player.deathTime) { // Don't hit dead players
          const dx = player.position.x - bullet.position.x;
          const dy = player.position.y - bullet.position.y;
          const dz = player.position.z - bullet.position.z;
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (distance < 2) {
            // Hit detected
            player.health -= config.combat.bulletDamage;
            player.lastUpdate = Date.now();
            console.log(`💥 COLLISION: ${player.name} health now ${player.health}`);
            
            if (player.health <= 0) {
              const kill = this.killPlayer(playerId, bullet.playerId);
              if (kill) {
                // NOTE: Respawn happens in checkForRespawns() after initial death state is broadcast
                console.log(`💀 DEATH: ${player.name} died, will respawn in 3 frames`);
              }
            }
            return false; // Remove bullet
          }
        }
      }

      return bullet.age < bullet.maxAge; // Keep if not expired
    });
  }

  killPlayer(victimId, killerId, killerNameOverride) {
    const victim = this.players.get(victimId);
    if (!victim || victim.deathTime) {
      return null;
    }

    victim.health = 0;
    victim.deathTime = Date.now();
    victim.lastUpdate = victim.deathTime;

    let killerName = killerNameOverride;
    const killerIdValue = killerId || 'game';
    const killer = killerId ? this.players.get(killerId) : null;

    if (!killerName && killer) {
      killer.score += 10;
      killerName = killer.name;
      killer.lastUpdate = Date.now();
    }

    victim.lastKillerName = killerName || 'Game';

    const kill = {
      killer: killerName || 'Game',
      killerId: killerIdValue,
      victim: victim.name,
      victimId: victimId,
      timestamp: Date.now()
    };

    this.allKills.push(kill);
    this.appendKillToLog(kill);
    console.log(`🔫 KILL RECORDED:`, kill);
    return kill;
  }

  respawnPlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player || !player.deathTime) {
      return false;
    }

    const spawnRange = config.arena.halfSize;
    player.position = {
      x: Math.random() * spawnRange * 2 - spawnRange,
      y: config.arena.spawnY,
      z: Math.random() * spawnRange * 2 - spawnRange
    };
    player.health = config.player.maxHealth;
    player.deathTime = null;
    player.lastKillerName = null;
    player.lastUpdate = Date.now();
    console.log(`♻️  RESPAWN: ${player.name} respawned at (${player.position.x.toFixed(1)}, ${player.position.z.toFixed(1)})`);
    return true;
  }

  // Check if players should respawn (delay 3 frames after death for death screen animation)
  checkForRespawns() {
    const now = Date.now();
    const respawnDelay = 50; // 50ms = 3 frames at 60fps
    
    for (const [playerId, player] of this.players) {
      if (player.deathTime && (now - player.deathTime) >= respawnDelay) {
        // Respawn the player
        const spawnRange = config.arena.halfSize;
        player.position = {
          x: Math.random() * spawnRange * 2 - spawnRange,
          y: config.arena.spawnY,
          z: Math.random() * spawnRange * 2 - spawnRange
        };
        player.health = config.player.maxHealth;
        player.deathTime = null;
        player.lastKillerName = null;
        player.lastUpdate = Date.now();
        console.log(`♻️  RESPAWN: ${player.name} respawned at (${player.position.x.toFixed(1)}, ${player.position.z.toFixed(1)})`);
      }
    }
  }

  getGameState() {
    const players = Array.from(this.players.values());
    const state = {
      players: players,
      bullets: this.bullets,
      kills: this.allKills,
      timestamp: Date.now()
    };
    
    return state;
  }

  // Kill log rotation handles cleanup
}

module.exports = GameState;
