const config = {
  arena: {
    halfSize: 80,
    spawnY: 1
  },
  player: {
    maxHealth: 3
  },
  combat: {
    bulletSpeed: 5,
    bulletDamage: 1,
    shootCooldownMs: 100
  },
  input: {
    lookSensitivity: 0.006
  },
  network: {
    simulationHz: 60,
    broadcastHz: 30,
    killsPerState: 25,
    maxBulletsPerState: 800,
    snapshotPrecision: 2,
    collisionGridCellSize: 8
  },
  world: {
    wallsCount: 28,
    buildingsCount: 8,
    autoScaleBuildings: true,
    buildingScaleBaseline: 80,
    maxBuildings: 140,
    streetWidth: 10,
    minBlockSize: 18,
    minSpacing: 10,
    edgeMargin: 8,
    emptyLotChance: 0.1,
    centerEmptyBoost: 0.55,
    centerClearRadiusCells: 0.85,
    merge2Chance: 0.34,
    merge3Chance: 0.22,
    merge4Chance: 0.16,
    windowCombineChance: 0.08,
    crossedWalls: true,
    crossedWallChance: 0.72,
    crossedWallCenterChance: 0.35,
    crossedWallLengthMin: 8.5,
    crossedWallLengthMax: 12.5,
    crossedWallLongChance: 0.4,
    crossedWallLongMultiplier: 1.75,
    crossWallExclusionPadding: 2.4,
    outerCrossNoSpawnSpaces: 2,
    crossedWallThickness: 2,
    crossedWallHeight: 3.8,
    outerStraightWalls: true,
    outerStraightWallsMinHalfSize: 70,
    outerStraightWallsChance: 0.7,
    perimeterFreeBandCells: 1,
    outerWallBuildingGap: 2.4,
    outerStraightWallsInset: 12,
    outerStraightWallsThickness: 2.2,
    outerStraightWallsHeight: 6.5,
    outerCornerOpeningRatio: 0.12,
    outerMiddleOpeningRatio: 0.18,
    outerCornerOpeningMin: 12,
    outerMiddleOpeningMin: 18,
    outerCornerJunctionMatchMiddle: true,
    outerCornerJunctionOpening: 10,
    outerCornerOpening: 12,
    outerMiddleOpening: 18,
    guaranteedOpenSpaceMinHalfSize: 140,
    guaranteedOpenSpaceRadiusCells: 1.2,
    largeBuildingDoorThreshold: 30,
    largeBuildingDoorsPerSide: 2,
    maxDoorSides: 4
  },
  respawn: {
    autoRespawn: true,
    autoRespawnTime: 0.1
  },
  bots: {
    counts: {
      dumb: 0,
      simple: 5,
      seeking: 0,
      teleporting: 0,
      danger: 0,
      monsters: 0
    },
    colors: {
      dumb: 0x6E7B8B,
      simple: 0x00CCFF,
      seeking: 0x22C55E,
      teleporting: 0xA855F7,
      danger: 0xF97316,
      monsters: 0xEF4444
    },
    settings: {
      dumb: {
        moveSpeed: 0.14,
        shootDistance: 28,
        shootCooldownMs: 420
      },
      simple: {
        moveSpeed: 0.23,
        shootDistance: 40,
        shootCooldownMs: 100,
        dodgeDistance: 14
      },
      seeking: {
        moveSpeed: 0.28,
        shootDistance: 208,
        shootCooldownMs: 90,
        dodgeDistance: 16,
        seekCoverDistance: 6
      },
      teleporting: {
        moveSpeed: 0.2,
        shootDistance: 52,
        shootCooldownMs: 100,
        dodgeDistance: 16,
        teleportCooldownMs: 550,
        teleportDistance: 6.4,
        teleportAwayDistance: 12
      },
      danger: {
        moveSpeed: 1,
        shootDistance: 60,
        shootCooldownMs: 75,
        dodgeDistance: 18,
        bulletSpeedMultiplier: 1.8,
        bulletDamageMultiplier: 1.5
      },
      monsters: {
        moveSpeed: 2.5,
        shootDistance: 265,
        shootCooldownMs: 60,
        dodgeDistance: 20,
        bulletSpeedMultiplier: 2.4,
        bulletDamageMultiplier: 100
      }
    }
  },
  simplebot: 12,
  logging: {
    verboseRealtime: false
  },
  killLog: {
    path: 'kills.log',
    resetMs: 60 * 60 * 1000
  }
};

module.exports = config;
