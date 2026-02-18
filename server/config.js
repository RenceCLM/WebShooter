const config = {
  arena: {
    halfSize: 80,
    spawnY: 1
  },
  player: {
    maxHealth: 100
  },
  combat: {
    bulletSpeed: 1,
    bulletDamage: 25,
    shootCooldownMs: 100
  },
  input: {
    lookSensitivity: 0.006
  },
  killLog: {
    path: 'kills.log',
    resetMs: 60 * 60 * 1000
  }
};

module.exports = config;
