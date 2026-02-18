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
    this.playerRadius = 1.0;
    this.playerHeight = 1.8;
    this.worldLayout = this.generateWorldLayout();
    const worldBounds = this.worldLayout && this.worldLayout.bounds ? this.worldLayout.bounds : null;
    const boundsHalfX = worldBounds ? Math.max(Math.abs(Number(worldBounds.minX) || 0), Math.abs(Number(worldBounds.maxX) || 0)) : 0;
    const boundsHalfZ = worldBounds ? Math.max(Math.abs(Number(worldBounds.minZ) || 0), Math.abs(Number(worldBounds.maxZ) || 0)) : 0;
    this.arenaHalfSize = Math.max(20, boundsHalfX, boundsHalfZ, Number(config.arena.halfSize) || 80);
    this.worldCollision = this.buildWorldCollision(this.worldLayout);
    this.botIds = new Set();
    this.botState = new Map();
    this.simpleBotCount = Math.max(0, Number(config.simplebot) || 0);
    this.botTypeColors = ((config.bots || {}).colors) || {};
    this.verboseRealtimeLogs = Boolean(config.logging && config.logging.verboseRealtime);
    const networkConfig = config.network || {};
    this.snapshotPrecision = Math.max(0, Number(networkConfig.snapshotPrecision) || 0);
    this.snapshotFactor = this.snapshotPrecision > 0 ? Math.pow(10, this.snapshotPrecision) : 1;
    this.maxBulletsPerState = Math.max(0, Number(networkConfig.maxBulletsPerState) || 0);
    this.collisionGridCellSize = Math.max(2, Number(networkConfig.collisionGridCellSize) || 8);
    this.bulletHitDistance = 2;
    this.bulletHitDistanceSq = this.bulletHitDistance * this.bulletHitDistance;
    this.botTypeOrder = ['dumb', 'simple', 'seeking', 'teleporting', 'danger', 'monsters'];
    this.initializeSimpleBots();
  }

  randomInRange(min, max) {
    return min + Math.random() * (max - min);
  }

  pickRandom(values) {
    return values[Math.floor(Math.random() * values.length)];
  }

  normalizeDirection(direction) {
    const value = Number(direction) || 0;
    const normalized = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
    return normalized;
  }

  getDirectionVector(direction) {
    const dir = this.normalizeDirection(direction);
    if (dir === 0) {
      return { x: 1, z: 0 };
    }
    if (dir === 90) {
      return { x: 0, z: 1 };
    }
    if (dir === 180) {
      return { x: -1, z: 0 };
    }
    return { x: 0, z: -1 };
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  roundSnapshotNumber(value) {
    const number = Number(value) || 0;
    if (this.snapshotPrecision <= 0) {
      return number;
    }
    return Math.round(number * this.snapshotFactor) / this.snapshotFactor;
  }

  makeBoxAabb(centerX, centerY, centerZ, width, height, depth) {
    return {
      minX: centerX - width / 2,
      maxX: centerX + width / 2,
      minY: centerY - height / 2,
      maxY: centerY + height / 2,
      minZ: centerZ - depth / 2,
      maxZ: centerZ + depth / 2
    };
  }

  makeFlatRect(centerX, centerZ, width, depth, y) {
    return {
      minX: centerX - width / 2,
      maxX: centerX + width / 2,
      minZ: centerZ - depth / 2,
      maxZ: centerZ + depth / 2,
      y
    };
  }

  getBuildingWallLayout(building) {
    const worldConfig = config.world || {};
    const halfW = building.width / 2;
    const halfD = building.depth / 2;
    const thickness = building.wallThickness;
    const height = building.wallHeight;
    const doorWidth = this.clamp(building.doorWidth, 2.8, Math.max(2.8, Math.min(building.width, building.depth) - 2));
    const segments = [];
    const openingsBySide = {
      north: [],
      south: [],
      east: [],
      west: []
    };
    const doorCountsBySide = {
      north: 0,
      south: 0,
      east: 0,
      west: 0
    };
    if (Array.isArray(building.doorSides) && building.doorSides.length > 0) {
      for (const side of building.doorSides) {
        if (doorCountsBySide[side] !== undefined) {
          doorCountsBySide[side] += 1;
        }
      }
    } else if (doorCountsBySide[building.doorSide] !== undefined) {
      doorCountsBySide[building.doorSide] = 1;
    }

    const buildOpeningsForSide = (side, sideLength, doorCount) => {
      const sideMin = -sideLength / 2;
      const sideMax = sideLength / 2;
      const openings = [];
      const hasDoor = doorCount > 0;

      const overlapsOpening = (candidate) => {
        for (const opening of openings) {
          const overlapX = !(candidate.end + 0.35 <= opening.start || candidate.start >= opening.end + 0.35);
          const overlapY = !(candidate.top + 0.2 <= opening.bottom || candidate.bottom >= opening.top + 0.2);
          if (overlapX && overlapY) {
            return true;
          }
        }
        return false;
      };

      const addOpening = (opening) => {
        const clamped = {
          ...opening,
          start: this.clamp(opening.start, sideMin + 0.55, sideMax - 0.55),
          end: this.clamp(opening.end, sideMin + 0.55, sideMax - 0.55),
          bottom: this.clamp(opening.bottom, 0.05, height - 0.8),
          top: this.clamp(opening.top, 0.3, height - 0.25)
        };
        if (clamped.end - clamped.start < 0.9 || clamped.top - clamped.bottom < 0.7) {
          return false;
        }
        if (overlapsOpening(clamped)) {
          return false;
        }
        openings.push(clamped);
        return true;
      };

      if (hasDoor) {
        const safeDoorCount = Math.max(1, Math.min(4, Math.round(doorCount)));
        const lane = sideLength / (safeDoorCount + 1);
        const doorWidthByCount = this.clamp(
          Math.min(doorWidth, lane * 0.82),
          2.8,
          Math.max(2.8, Math.min(doorWidth, sideLength - 2.2))
        );
        for (let doorIndex = 0; doorIndex < safeDoorCount; doorIndex += 1) {
          const centerBase = sideMin + lane * (doorIndex + 1);
          const jitter = lane * this.randomInRange(-0.09, 0.09);
          const center = this.clamp(centerBase + jitter, sideMin + 1.1, sideMax - 1.1);
          addOpening({
            type: 'door',
            start: center - doorWidthByCount / 2,
            end: center + doorWidthByCount / 2,
            bottom: 0,
            top: this.clamp(this.randomInRange(2.8, 3.4), 2.6, height - 0.9)
          });
        }
      }

      const windowWidth = this.clamp(sideLength * this.randomInRange(0.2, 0.28), 2.6, 4.4);
      const minSlotGap = this.clamp(windowWidth * this.randomInRange(0.34, 0.5), 1.0, 2.2);
      const paddedMin = sideMin + 0.8;
      const paddedMax = sideMax - 0.8;
      const usable = Math.max(0, paddedMax - paddedMin);
      const stride = windowWidth + minSlotGap;
      const slotCount = Math.max(1, Math.floor((usable + minSlotGap) / Math.max(0.01, stride)));

      const totalWindowsWidth = slotCount * windowWidth;
      const totalGapWidth = Math.max(0, slotCount - 1) * minSlotGap;
      const occupiedWidth = totalWindowsWidth + totalGapWidth;
      const sideCenter = (paddedMin + paddedMax) / 2;
      const firstCenter = sideCenter - occupiedWidth / 2 + windowWidth / 2;

      const windowBottom = this.clamp(this.randomInRange(0.9, 1.25), 0.75, Math.max(0.75, height - 2.8));
      const windowHeight = this.clamp(this.randomInRange(1.9, 2.8), 1.7, Math.max(1.7, height - windowBottom - 0.45));
      const occupancyChance = hasDoor ? this.randomInRange(0.55, 0.78) : this.randomInRange(0.68, 0.9);
      const windowCombineChance = this.clamp(Number(worldConfig.windowCombineChance) || 0.08, 0, 0.35);

      const slotOccupancy = new Array(slotCount).fill(false);
      for (let index = 0; index < slotCount; index += 1) {
        if (Math.random() <= occupancyChance) {
          slotOccupancy[index] = true;
        }
      }
      if (!slotOccupancy.some(Boolean) && slotCount > 0) {
        slotOccupancy[Math.floor(slotCount / 2)] = true;
      }

      let createdWindows = 0;
      let index = 0;
      while (index < slotCount) {
        if (!slotOccupancy[index]) {
          index += 1;
          continue;
        }

        let slotsUsed = 1;
        if (index < slotCount - 1 && slotOccupancy[index + 1] && Math.random() < windowCombineChance) {
          slotsUsed = 2;
          slotOccupancy[index + 1] = false;
        }

        const slotStart = firstCenter + index * (windowWidth + minSlotGap) - windowWidth / 2;
        const slotEnd = firstCenter + (index + slotsUsed - 1) * (windowWidth + minSlotGap) + windowWidth / 2;

        const added = addOpening({
          type: 'window',
          start: slotStart,
          end: slotEnd,
          bottom: windowBottom,
          top: windowBottom + windowHeight
        });

        if (added) {
          createdWindows += 1;
        }
        index += slotsUsed;
      }

      // Guarantee at least one window where space allows.
      if (createdWindows === 0 && slotCount > 0) {
        const middleIndex = Math.floor(slotCount / 2);
        const center = firstCenter + middleIndex * (windowWidth + minSlotGap);
        addOpening({
          type: 'window',
          start: center - windowWidth / 2,
          end: center + windowWidth / 2,
          bottom: windowBottom,
          top: windowBottom + windowHeight
        });
      }

      openings.sort((a, b) => a.start - b.start || a.bottom - b.bottom);
      openingsBySide[side] = openings.map(opening => ({ side, ...opening }));
      return openings;
    };

    const createSideSegments = (side, sideLength, fixedValue, alongAxis) => {
      const openings = buildOpeningsForSide(side, sideLength, doorCountsBySide[side] || 0);
      const sideMin = -sideLength / 2;
      const sideMax = sideLength / 2;

      const xCuts = [sideMin, sideMax];
      const yCuts = [0, height];
      openings.forEach(opening => {
        xCuts.push(opening.start, opening.end);
        yCuts.push(opening.bottom, opening.top);
      });

      const uniqueSorted = (values) => {
        const sorted = values.slice().sort((a, b) => a - b);
        const output = [];
        for (const value of sorted) {
          if (output.length === 0 || Math.abs(output[output.length - 1] - value) > 0.001) {
            output.push(value);
          }
        }
        return output;
      };

      const xRanges = uniqueSorted(xCuts);
      const yRanges = uniqueSorted(yCuts);

      const isInsideOpening = (uMid, yMid) => {
        for (const opening of openings) {
          if (uMid > opening.start && uMid < opening.end && yMid > opening.bottom && yMid < opening.top) {
            return true;
          }
        }
        return false;
      };

      for (let xi = 0; xi < xRanges.length - 1; xi += 1) {
        const u0 = xRanges[xi];
        const u1 = xRanges[xi + 1];
        const uSpan = u1 - u0;
        if (uSpan <= 0.12) {
          continue;
        }

        for (let yi = 0; yi < yRanges.length - 1; yi += 1) {
          const y0 = yRanges[yi];
          const y1 = yRanges[yi + 1];
          const ySpan = y1 - y0;
          if (ySpan <= 0.12) {
            continue;
          }

          const uMid = (u0 + u1) / 2;
          const yMid = (y0 + y1) / 2;
          if (isInsideOpening(uMid, yMid)) {
            continue;
          }

          if (alongAxis === 'x') {
            segments.push({
              x: building.x + uMid,
              y: yMid,
              z: fixedValue,
              width: uSpan,
              depth: thickness,
              height: ySpan
            });
          } else {
            segments.push({
              x: fixedValue,
              y: yMid,
              z: building.z + uMid,
              width: thickness,
              depth: uSpan,
              height: ySpan
            });
          }
        }
      }
    };

    createSideSegments('north', building.width, building.z - halfD, 'x');
    createSideSegments('south', building.width, building.z + halfD, 'x');
    createSideSegments('west', building.depth, building.x - halfW, 'z');
    createSideSegments('east', building.depth, building.x + halfW, 'z');

    if (segments.length === 0) {
      segments.push(
        { x: building.x, y: height / 2, z: building.z - halfD, width: building.width, depth: thickness, height },
        { x: building.x, y: height / 2, z: building.z + halfD, width: building.width, depth: thickness, height },
        { x: building.x - halfW, y: height / 2, z: building.z, width: thickness, depth: building.depth, height },
        { x: building.x + halfW, y: height / 2, z: building.z, width: thickness, depth: building.depth, height }
      );
    }

    return {
      segments,
      openings: [
        ...openingsBySide.north,
        ...openingsBySide.south,
        ...openingsBySide.east,
        ...openingsBySide.west
      ]
    };
  }

  getBuildingWallSegments(building) {
    return this.getBuildingWallLayout(building).segments;
  }

  createSecondFloorSegments(building, openingWidth, openingDepth) {
    const segments = [];
    const centerX = building.x;
    const centerZ = building.z;
    const floorWidth = Math.max(5, building.width - building.wallThickness * 2.4);
    const floorDepth = Math.max(5, building.depth - building.wallThickness * 2.4);
    const y = building.secondFloorY;
    const thickness = building.secondFloorThickness;

    const clampedOpeningWidth = this.clamp(openingWidth, 3, floorWidth - 2);
    const clampedOpeningDepth = this.clamp(openingDepth, 3, floorDepth - 2);

    const ringX = Math.max(1, (floorWidth - clampedOpeningWidth) / 2);
    const ringZ = Math.max(1, (floorDepth - clampedOpeningDepth) / 2);

    segments.push({
      id: `sf-${building.id}-north`,
      buildingId: building.id,
      x: centerX,
      z: centerZ - (clampedOpeningDepth + ringZ) / 2,
      width: floorWidth,
      depth: ringZ,
      y,
      thickness
    });
    segments.push({
      id: `sf-${building.id}-south`,
      buildingId: building.id,
      x: centerX,
      z: centerZ + (clampedOpeningDepth + ringZ) / 2,
      width: floorWidth,
      depth: ringZ,
      y,
      thickness
    });
    segments.push({
      id: `sf-${building.id}-west`,
      buildingId: building.id,
      x: centerX - (clampedOpeningWidth + ringX) / 2,
      z: centerZ,
      width: ringX,
      depth: clampedOpeningDepth,
      y,
      thickness
    });
    segments.push({
      id: `sf-${building.id}-east`,
      buildingId: building.id,
      x: centerX + (clampedOpeningWidth + ringX) / 2,
      z: centerZ,
      width: ringX,
      depth: clampedOpeningDepth,
      y,
      thickness
    });

    return segments;
  }

  createUpperWallSegments(building) {
    const shouldCreate = Math.random() < 0.65;
    if (!shouldCreate) {
      return [];
    }

    const upperHeight = this.randomInRange(1.8, 2.6);
    const y = building.secondFloorY + upperHeight / 2;
    const thickness = Math.max(0.8, building.wallThickness * 0.8);
    const innerWidth = Math.max(6, building.width - building.wallThickness * 2.8);
    const innerDepth = Math.max(6, building.depth - building.wallThickness * 2.8);
    const gap = this.clamp(this.randomInRange(2.8, 4.2), 2.2, Math.min(innerWidth, innerDepth) - 2);

    const segments = [];
    const addWindowedSide = (side) => {
      if (side === 'north' || side === 'south') {
        const z = side === 'north'
          ? building.z - innerDepth / 2
          : building.z + innerDepth / 2;
        const segmentWidth = Math.max(1.2, (innerWidth - gap) / 2);
        segments.push(
          {
            x: building.x - (gap + segmentWidth) / 2,
            z,
            width: segmentWidth,
            depth: thickness,
            height: upperHeight,
            y,
            buildingId: building.id,
            level: 2
          },
          {
            x: building.x + (gap + segmentWidth) / 2,
            z,
            width: segmentWidth,
            depth: thickness,
            height: upperHeight,
            y,
            buildingId: building.id,
            level: 2
          }
        );
      } else {
        const x = side === 'west'
          ? building.x - innerWidth / 2
          : building.x + innerWidth / 2;
        const segmentDepth = Math.max(1.2, (innerDepth - gap) / 2);
        segments.push(
          {
            x,
            z: building.z - (gap + segmentDepth) / 2,
            width: thickness,
            depth: segmentDepth,
            height: upperHeight,
            y,
            buildingId: building.id,
            level: 2
          },
          {
            x,
            z: building.z + (gap + segmentDepth) / 2,
            width: thickness,
            depth: segmentDepth,
            height: upperHeight,
            y,
            buildingId: building.id,
            level: 2
          }
        );
      }
    };

    addWindowedSide('north');
    addWindowedSide('south');
    addWindowedSide('west');
    addWindowedSide('east');

    return segments;
  }

  buildStreetWalls(streetCenters, spanMin, spanMax, laneWidth, orientation) {
    const walls = [];
    const segmentLength = Math.max(8, (spanMax - spanMin) * 0.24);

    for (const center of streetCenters) {
      const segments = 2;
      for (let index = 0; index < segments; index += 1) {
        const t = segments === 1 ? 0.5 : (index + 1) / (segments + 1);
        const along = spanMin + (spanMax - spanMin) * t;
        if (orientation === 'x') {
          walls.push({
            x: along,
            z: center,
            width: segmentLength,
            depth: laneWidth * 0.18,
            height: 3.4,
            type: 'street-wall'
          });
        } else {
          walls.push({
            x: center,
            z: along,
            width: laneWidth * 0.18,
            depth: segmentLength,
            height: 3.4,
            type: 'street-wall'
          });
        }
      }
    }

    return walls;
  }

  doesWallIntersectZones(wall, zones = []) {
    if (!wall || !Array.isArray(zones) || zones.length === 0) {
      return false;
    }

    const halfW = (Number(wall.width) || 0) / 2;
    const halfD = (Number(wall.depth) || 0) / 2;
    const wallMinX = (Number(wall.x) || 0) - halfW;
    const wallMaxX = (Number(wall.x) || 0) + halfW;
    const wallMinZ = (Number(wall.z) || 0) - halfD;
    const wallMaxZ = (Number(wall.z) || 0) + halfD;

    return zones.some(zone => {
      if (!zone) {
        return false;
      }
      const minX = Number(zone.minX);
      const maxX = Number(zone.maxX);
      const minZ = Number(zone.minZ);
      const maxZ = Number(zone.maxZ);
      if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
        return false;
      }

      const separated = wallMaxX < minX || wallMinX > maxX || wallMaxZ < minZ || wallMinZ > maxZ;
      return !separated;
    });
  }

  buildCrossPatternWalls(verticalStreetCenters, horizontalStreetCenters, laneWidth, worldConfig, centerX, centerZ, centerClearRadius, exclusionZones = []) {
    if (worldConfig.crossedWalls === false) {
      return [];
    }

    const walls = [];
    const thickness = this.clamp(Number(worldConfig.crossedWallThickness) || laneWidth * 0.18, 1.2, laneWidth * 0.45);
    const height = this.clamp(Number(worldConfig.crossedWallHeight) || 3.6, 2.6, 5.6);
    const crossChance = this.clamp(Number(worldConfig.crossedWallChance) || 0.42, 0.05, 1);
    const baseLengthMin = this.clamp(Number(worldConfig.crossedWallLengthMin) || laneWidth * 0.55, 2.2, laneWidth * 2.1);
    const baseLengthMax = this.clamp(Number(worldConfig.crossedWallLengthMax) || laneWidth * 0.95, baseLengthMin, laneWidth * 2.6);
    const baseArmLength = this.clamp(this.randomInRange(baseLengthMin, baseLengthMax), baseLengthMin, baseLengthMax);
    const longChance = this.clamp(Number(worldConfig.crossedWallLongChance) || 0.18, 0, 1);
    const longMultiplier = this.clamp(Number(worldConfig.crossedWallLongMultiplier) || 1.45, 1.05, 2.6);
    const longArmLength = this.clamp(baseArmLength * longMultiplier, 2.4, laneWidth * 3.6);

    const isExcluded = (x, z) => exclusionZones.some(zone => {
      if (!zone) {
        return false;
      }
      const minX = Number(zone.minX);
      const maxX = Number(zone.maxX);
      const minZ = Number(zone.minZ);
      const maxZ = Number(zone.maxZ);
      return Number.isFinite(minX) && Number.isFinite(maxX)
        && Number.isFinite(minZ) && Number.isFinite(maxZ)
        && x >= minX && x <= maxX && z >= minZ && z <= maxZ;
    });

    for (const x of verticalStreetCenters) {
      for (const z of horizontalStreetCenters) {
        const distCenter = Math.hypot(x - centerX, z - centerZ);
        const inCenterGap = distCenter <= centerClearRadius;
        if (inCenterGap || isExcluded(x, z)) {
          continue;
        }
        if (Math.random() > crossChance) {
          continue;
        }
        const armLength = Math.random() < longChance ? longArmLength : baseArmLength;
        walls.push(
          {
            x,
            z,
            width: armLength * 2,
            depth: thickness,
            height,
            type: 'cross-pattern'
          },
          {
            x,
            z,
            width: thickness,
            depth: armLength * 2,
            height,
            type: 'cross-pattern'
          }
        );
      }
    }

    return walls;
  }

  getOuterWallLayout(halfSize, worldConfig, options = {}) {
    if (worldConfig.outerStraightWalls === false) {
      return { enabled: false };
    }

    const minHalfSize = Math.max(20, Number(worldConfig.outerStraightWallsMinHalfSize) || 70);
    if (halfSize < minHalfSize && Math.random() > this.clamp(Number(worldConfig.outerStraightWallsChance) || 0.7, 0, 1)) {
      return { enabled: false };
    }

    const blockWidth = Number(options.blockWidth) || 0;
    const blockDepth = Number(options.blockDepth) || 0;
    const streetWidth = Number(options.streetWidth) || 0;
    const perimeterFreeBandCells = this.clamp(Number(worldConfig.perimeterFreeBandCells) || 1, 0.3, 3.2);
    const missingBuildingLength = Math.max(0, Math.max(blockWidth, blockDepth) + streetWidth * 0.5);
    const derivedInset = missingBuildingLength * perimeterFreeBandCells;
    const fallbackInset = Math.max(10, halfSize * 0.12);
    const configuredInset = Number(worldConfig.outerStraightWallsInset);
    const baseInset = Number.isFinite(configuredInset) ? configuredInset : fallbackInset;
    const inset = this.clamp(Math.max(baseInset, derivedInset), 6, halfSize * 0.42);
    const thickness = this.clamp(Number(worldConfig.outerStraightWallsThickness) || 2.2, 1.2, 4.8);
    const height = this.clamp(Number(worldConfig.outerStraightWallsHeight) || 6.5, 3, 10);
    const cornerOpenRatio = this.clamp(Number(worldConfig.outerCornerOpeningRatio) || 0.12, 0.04, 0.38);
    const middleOpenRatio = this.clamp(Number(worldConfig.outerMiddleOpeningRatio) || 0.18, 0.06, 0.55);
    const cornerOpenMin = Math.max(8, Number(worldConfig.outerCornerOpeningMin) || Number(worldConfig.outerCornerOpening) || 10);
    const middleOpenMin = Math.max(10, Number(worldConfig.outerMiddleOpeningMin) || Number(worldConfig.outerMiddleOpening) || 14);
    const cornerOpen = this.clamp(Math.max(cornerOpenMin, halfSize * cornerOpenRatio), 8, halfSize * 0.42);
    const middleOpen = this.clamp(Math.max(middleOpenMin, halfSize * middleOpenRatio), 10, halfSize * 0.62);

    const spanMin = -halfSize + cornerOpen;
    const spanMax = halfSize - cornerOpen;
    const halfMiddleOpen = middleOpen / 2;
    const leftEnd = -halfMiddleOpen;
    const rightStart = halfMiddleOpen;
    const spanLeftLen = Math.max(0, leftEnd - spanMin);
    const spanRightLen = Math.max(0, spanMax - rightStart);

    return {
      enabled: true,
      inset,
      thickness,
      height,
      cornerOpen,
      middleOpen,
      spanMin,
      spanMax,
      halfMiddleOpen,
      spanLeftLen,
      spanRightLen,
      xWallAbs: halfSize - inset,
      zWallAbs: halfSize - inset
    };
  }

  buildOuterStraightWalls(halfSize, worldConfig, options = {}) {
    const layout = this.getOuterWallLayout(halfSize, worldConfig, options);
    if (!layout.enabled) {
      return [];
    }

    const walls = [];
    const matchCornerJunctionToMiddle = worldConfig.outerCornerJunctionMatchMiddle !== false;
    const configuredJunctionOpening = Number(worldConfig.outerCornerJunctionOpening);
    const junctionOpening = this.clamp(
      matchCornerJunctionToMiddle
        ? layout.middleOpen
        : (configuredJunctionOpening || Math.max(layout.cornerOpen * 0.55, layout.thickness * 3.2)),
      4,
      halfSize * 0.62
    );
    const halfJunctionOpening = junctionOpening / 2;

    const subtractIntervals = (baseStart, baseEnd, cuts) => {
      if (!Number.isFinite(baseStart) || !Number.isFinite(baseEnd) || baseEnd - baseStart <= 0.2) {
        return [];
      }
      const normalizedCuts = cuts
        .map(cut => ({
          start: this.clamp(Number(cut.start) || 0, baseStart, baseEnd),
          end: this.clamp(Number(cut.end) || 0, baseStart, baseEnd)
        }))
        .filter(cut => cut.end - cut.start > 0.05)
        .sort((a, b) => a.start - b.start);

      const segments = [];
      let cursor = baseStart;
      for (const cut of normalizedCuts) {
        if (cut.start > cursor) {
          segments.push({ start: cursor, end: cut.start });
        }
        cursor = Math.max(cursor, cut.end);
      }
      if (cursor < baseEnd) {
        segments.push({ start: cursor, end: baseEnd });
      }
      return segments.filter(segment => segment.end - segment.start > 0.2);
    };

    const horizontalCuts = [
      { start: -layout.halfMiddleOpen, end: layout.halfMiddleOpen },
      { start: -layout.xWallAbs - halfJunctionOpening, end: -layout.xWallAbs + halfJunctionOpening },
      { start: layout.xWallAbs - halfJunctionOpening, end: layout.xWallAbs + halfJunctionOpening }
    ];
    const verticalCuts = [
      { start: -layout.halfMiddleOpen, end: layout.halfMiddleOpen },
      { start: -layout.zWallAbs - halfJunctionOpening, end: -layout.zWallAbs + halfJunctionOpening },
      { start: layout.zWallAbs - halfJunctionOpening, end: layout.zWallAbs + halfJunctionOpening }
    ];

    const addHorizontalSide = (z) => {
      const segments = subtractIntervals(layout.spanMin, layout.spanMax, horizontalCuts);
      for (const segment of segments) {
        walls.push({
          x: (segment.start + segment.end) / 2,
          z,
          width: segment.end - segment.start,
          depth: layout.thickness,
          height: layout.height,
          type: 'outer-straight'
        });
      }
    };

    const addVerticalSide = (x) => {
      const segments = subtractIntervals(layout.spanMin, layout.spanMax, verticalCuts);
      for (const segment of segments) {
        walls.push({
          x,
          z: (segment.start + segment.end) / 2,
          width: layout.thickness,
          depth: segment.end - segment.start,
          height: layout.height,
          type: 'outer-straight'
        });
      }
    };

    addHorizontalSide(-layout.zWallAbs);
    addHorizontalSide(layout.zWallAbs);
    addVerticalSide(-layout.xWallAbs);
    addVerticalSide(layout.xWallAbs);

    return walls;
  }

  generateWorldLayout() {
    const worldConfig = config.world || {};
    const configuredHalfSize = Number(config.arena.halfSize) || 80;
    const edgeMargin = Math.max(6, Number(worldConfig.edgeMargin) || 8);
    const autoScaleBuildings = worldConfig.autoScaleBuildings !== false;
    const baseHalfSize = Math.max(20, Number(worldConfig.buildingScaleBaseline) || 80);
    const baseBuildingCount = Math.max(4, Number(worldConfig.buildingsCount) || 8);
    const maxBuildings = Math.max(baseBuildingCount, Number(worldConfig.maxBuildings) || 140);
    const areaScale = this.clamp((configuredHalfSize * configuredHalfSize) / (baseHalfSize * baseHalfSize), 0.25, 16);
    const requestedBuildings = autoScaleBuildings
      ? Math.max(4, Math.min(maxBuildings, Math.round(baseBuildingCount * areaScale)))
      : baseBuildingCount;
    const streetWidth = this.clamp(Number(worldConfig.streetWidth) || 10, 7, 18);
    const minBlockSize = this.clamp(Number(worldConfig.minBlockSize) || 18, 12, 40);
    const perimeterFreeBandCells = this.clamp(Number(worldConfig.perimeterFreeBandCells) || 1, 0.3, 3.2);
    const configuredInset = Number(worldConfig.outerStraightWallsInset);
    const reserveFromCells = (minBlockSize + streetWidth * 0.5) * perimeterFreeBandCells;
    const reserveFromInset = Number.isFinite(configuredInset) ? configuredInset : 0;
    const basePerimeterReserve = Math.max(0, reserveFromCells, reserveFromInset);
    const outerWallBuildingGap = this.clamp(Number(worldConfig.outerWallBuildingGap) || 2.4, 1.2, 14);

    let halfSize = configuredHalfSize + basePerimeterReserve;
    let effectiveEdgeMargin = edgeMargin + basePerimeterReserve;

    let blocksX = Math.max(2, Math.round(Math.sqrt(requestedBuildings)));
    let blocksZ = Math.max(2, Math.ceil(requestedBuildings / blocksX));

    const getBlockSizes = () => {
      const usable = halfSize * 2 - effectiveEdgeMargin * 2;
      const blockWidth = (usable - (blocksX + 1) * streetWidth) / blocksX;
      const blockDepth = (usable - (blocksZ + 1) * streetWidth) / blocksZ;
      return { usable, blockWidth, blockDepth };
    };

    let sizing = getBlockSizes();
    while ((sizing.blockWidth < minBlockSize || sizing.blockDepth < minBlockSize) && (blocksX > 2 || blocksZ > 2)) {
      if (sizing.blockWidth < sizing.blockDepth && blocksX > 2) {
        blocksX -= 1;
      } else if (blocksZ > 2) {
        blocksZ -= 1;
      } else {
        blocksX -= 1;
      }
      sizing = getBlockSizes();
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const layoutCheck = this.getOuterWallLayout(halfSize, worldConfig, {
        blockWidth: Math.max(minBlockSize, sizing.blockWidth),
        blockDepth: Math.max(minBlockSize, sizing.blockDepth),
        streetWidth
      });
      if (!layoutCheck.enabled) {
        break;
      }

      const cityHalf = sizing.usable / 2;
      const wallAbs = Math.min(layoutCheck.xWallAbs, layoutCheck.zWallAbs);
      const requiredExpansion = cityHalf + outerWallBuildingGap - wallAbs;
      if (requiredExpansion <= 0) {
        break;
      }

      const expansion = requiredExpansion + 1;
      halfSize += expansion;
      effectiveEdgeMargin += expansion;
      sizing = getBlockSizes();
    }

    const usableSize = sizing.usable;
    const blockWidth = Math.max(minBlockSize, sizing.blockWidth);
    const blockDepth = Math.max(minBlockSize, sizing.blockDepth);
    const cityMinX = -usableSize / 2;
    const cityMinZ = -usableSize / 2;
    const cityMaxX = cityMinX + usableSize;
    const cityMaxZ = cityMinZ + usableSize;

    const walls = [];
    const buildings = [];

    const verticalStreetCenters = [];
    const horizontalStreetCenters = [];
    for (let gx = 0; gx <= blocksX; gx += 1) {
      const x = cityMinX + gx * (blockWidth + streetWidth) + streetWidth / 2;
      verticalStreetCenters.push(x);
    }
    for (let gz = 0; gz <= blocksZ; gz += 1) {
      const z = cityMinZ + gz * (blockDepth + streetWidth) + streetWidth / 2;
      horizontalStreetCenters.push(z);
    }

    const buildingCells = [];
    for (let gz = 0; gz < blocksZ; gz += 1) {
      for (let gx = 0; gx < blocksX; gx += 1) {
        buildingCells.push({ gx, gz });
      }
    }

    const targetBuildings = Math.min(requestedBuildings, buildingCells.length);

    const largeBuildingDoorThreshold = this.clamp(Number(worldConfig.largeBuildingDoorThreshold) || 30, 16, 80);
    const largeBuildingDoorsPerSide = Math.max(1, Math.min(4, Math.round(Number(worldConfig.largeBuildingDoorsPerSide) || 2)));
    const maxDoorSides = Math.max(1, Math.min(4, Math.round(Number(worldConfig.maxDoorSides) || 4)));
    const baseEmptyChance = this.clamp(Number(worldConfig.emptyLotChance) || 0.1, 0, 0.75);
    const centerEmptyBoost = this.clamp(Number(worldConfig.centerEmptyBoost) || 0.55, 0, 0.95);
    const centerClearRadiusCells = this.clamp(Number(worldConfig.centerClearRadiusCells) || 0.85, 0.2, 2.4);
    const guaranteedOpenSpaceMinHalfSize = Math.max(20, Number(worldConfig.guaranteedOpenSpaceMinHalfSize) || 140);
    const guaranteedOpenSpaceRadiusCells = this.clamp(Number(worldConfig.guaranteedOpenSpaceRadiusCells) || 1.2, 0.2, 3.2);
    const effectiveCenterClearRadiusCells = halfSize >= guaranteedOpenSpaceMinHalfSize
      ? Math.max(centerClearRadiusCells, guaranteedOpenSpaceRadiusCells)
      : centerClearRadiusCells;
    const merge2Chance = this.clamp(Number(worldConfig.merge2Chance) || 0.34, 0, 1);
    const merge3Chance = this.clamp(Number(worldConfig.merge3Chance) || 0.22, 0, 1);
    const merge4Chance = this.clamp(Number(worldConfig.merge4Chance) || 0.16, 0, 1);
    const centerGX = (blocksX - 1) / 2;
    const centerGZ = (blocksZ - 1) / 2;

    const cellKey = (gx, gz) => `${gx},${gz}`;
    const parseKey = (value) => {
      const [gxRaw, gzRaw] = String(value).split(',');
      return { gx: Number(gxRaw), gz: Number(gzRaw) };
    };
    const isInsideGrid = (gx, gz) => gx >= 0 && gx < blocksX && gz >= 0 && gz < blocksZ;
    const normCenterDistance = (gx, gz) => {
      const dx = Math.abs(gx - centerGX) / Math.max(1, blocksX / 2);
      const dz = Math.abs(gz - centerGZ) / Math.max(1, blocksZ / 2);
      return this.clamp(Math.sqrt(dx * dx + dz * dz) / Math.SQRT2, 0, 1);
    };

    const availableCellKeys = new Set();
    const centerClearedKeys = new Set();
    for (const cell of buildingCells) {
      const centerDist = Math.hypot(cell.gx - centerGX, cell.gz - centerGZ);
      if (centerDist <= effectiveCenterClearRadiusCells) {
        centerClearedKeys.add(cellKey(cell.gx, cell.gz));
        continue;
      }

      const middleInfluence = 1 - normCenterDistance(cell.gx, cell.gz);
      const skipChance = this.clamp(baseEmptyChance + middleInfluence * centerEmptyBoost, 0, 0.97);
      if (Math.random() > skipChance) {
        availableCellKeys.add(cellKey(cell.gx, cell.gz));
      }
    }

    if (availableCellKeys.size > targetBuildings) {
      const sorted = Array.from(availableCellKeys)
        .map(key => {
          const parsed = parseKey(key);
          return {
            key,
            priority: (1 - normCenterDistance(parsed.gx, parsed.gz)) + Math.random() * 0.15
          };
        })
        .sort((a, b) => b.priority - a.priority);
      const removeCount = availableCellKeys.size - targetBuildings;
      for (let i = 0; i < removeCount; i += 1) {
        availableCellKeys.delete(sorted[i].key);
      }
    }

    const minBuildingCells = Math.max(4, Math.min(targetBuildings, Math.floor(targetBuildings * 0.45)));
    if (availableCellKeys.size < minBuildingCells) {
      const candidates = buildingCells
        .filter(cell => !centerClearedKeys.has(cellKey(cell.gx, cell.gz)) && !availableCellKeys.has(cellKey(cell.gx, cell.gz)))
        .map(cell => ({
          key: cellKey(cell.gx, cell.gz),
          score: normCenterDistance(cell.gx, cell.gz) + Math.random() * 0.1
        }))
        .sort((a, b) => b.score - a.score);
      for (const candidate of candidates) {
        if (availableCellKeys.size >= minBuildingCells) {
          break;
        }
        availableCellKeys.add(candidate.key);
      }
    }

    const claimed = new Set();
    const isFree = (gx, gz) => {
      const key = cellKey(gx, gz);
      return isInsideGrid(gx, gz) && availableCellKeys.has(key) && !claimed.has(key);
    };
    const uniquePattern = (cells) => cells
      .slice()
      .map(cell => cellKey(cell.gx, cell.gz))
      .sort()
      .join('|');

    const pickMergedCells = (root) => {
      const { gx, gz } = root;

      const squareSets = [];
      for (const ax of [gx - 1, gx]) {
        for (const az of [gz - 1, gz]) {
          const square = [
            { gx: ax, gz: az },
            { gx: ax + 1, gz: az },
            { gx: ax, gz: az + 1 },
            { gx: ax + 1, gz: az + 1 }
          ];
          const includesRoot = square.some(cell => cell.gx === gx && cell.gz === gz);
          if (!includesRoot) {
            continue;
          }
          const allInside = square.every(cell => isInsideGrid(cell.gx, cell.gz));
          if (!allInside) {
            continue;
          }
          squareSets.push(square);
        }
      }

      const big4Options = [];
      const l3Options = [];
      const dedupeL = new Set();

      for (const square of squareSets) {
        if (square.every(cell => isFree(cell.gx, cell.gz))) {
          big4Options.push(square);
        }

        for (let missingIndex = 0; missingIndex < square.length; missingIndex += 1) {
          const option = square.filter((_, index) => index !== missingIndex);
          const hasRoot = option.some(cell => cell.gx === gx && cell.gz === gz);
          if (!hasRoot) {
            continue;
          }
          if (!option.every(cell => isFree(cell.gx, cell.gz))) {
            continue;
          }
          const signature = uniquePattern(option);
          if (!dedupeL.has(signature)) {
            dedupeL.add(signature);
            l3Options.push(option);
          }
        }
      }

      const pairCandidates = [
        [{ gx, gz }, { gx: gx + 1, gz }],
        [{ gx, gz }, { gx: gx - 1, gz }],
        [{ gx, gz }, { gx, gz: gz + 1 }],
        [{ gx, gz }, { gx, gz: gz - 1 }]
      ].filter(option => option.every(cell => isFree(cell.gx, cell.gz)));

      if (big4Options.length > 0 && Math.random() < merge4Chance) {
        return big4Options[Math.floor(Math.random() * big4Options.length)];
      }
      if (l3Options.length > 0 && Math.random() < merge3Chance) {
        return l3Options[Math.floor(Math.random() * l3Options.length)];
      }
      if (pairCandidates.length > 0 && Math.random() < merge2Chance) {
        return pairCandidates[Math.floor(Math.random() * pairCandidates.length)];
      }

      return [{ gx, gz }];
    };

    const shuffledAvailableRoots = Array.from(availableCellKeys)
      .map(value => ({ ...parseKey(value), order: Math.random() }))
      .sort((a, b) => a.order - b.order);

    const mergedGroups = [];
    for (const root of shuffledAvailableRoots) {
      const rootKey = cellKey(root.gx, root.gz);
      if (claimed.has(rootKey) || !availableCellKeys.has(rootKey)) {
        continue;
      }

      const merged = pickMergedCells(root);
      mergedGroups.push(merged);
      for (const cell of merged) {
        claimed.add(cellKey(cell.gx, cell.gz));
      }
    }

    const shapeToFootprints = (cells) => {
      if (cells.length !== 3) {
        const gxValues = cells.map(cell => cell.gx);
        const gzValues = cells.map(cell => cell.gz);
        return [{
          minGX: Math.min(...gxValues),
          maxGX: Math.max(...gxValues),
          minGZ: Math.min(...gzValues),
          maxGZ: Math.max(...gzValues)
        }];
      }

      const gxCounts = new Map();
      const gzCounts = new Map();
      for (const cell of cells) {
        gxCounts.set(cell.gx, (gxCounts.get(cell.gx) || 0) + 1);
        gzCounts.set(cell.gz, (gzCounts.get(cell.gz) || 0) + 1);
      }
      const pivot = cells.find(cell => (gxCounts.get(cell.gx) || 0) >= 2 && (gzCounts.get(cell.gz) || 0) >= 2);
      if (!pivot) {
        const gxValues = cells.map(cell => cell.gx);
        const gzValues = cells.map(cell => cell.gz);
        return [{
          minGX: Math.min(...gxValues),
          maxGX: Math.max(...gxValues),
          minGZ: Math.min(...gzValues),
          maxGZ: Math.max(...gzValues)
        }];
      }

      const horizontalPair = cells.filter(cell => cell.gz === pivot.gz);
      const verticalPair = cells.filter(cell => cell.gx === pivot.gx);
      const useHorizontalPair = horizontalPair.length >= 2 && (verticalPair.length < 2 || Math.random() < 0.5);
      const pair = useHorizontalPair ? horizontalPair : verticalPair;
      const pairKeys = new Set(pair.map(cell => cellKey(cell.gx, cell.gz)));
      const remaining = cells.filter(cell => !pairKeys.has(cellKey(cell.gx, cell.gz)));
      const pairGX = pair.map(cell => cell.gx);
      const pairGZ = pair.map(cell => cell.gz);

      const footprints = [{
        minGX: Math.min(...pairGX),
        maxGX: Math.max(...pairGX),
        minGZ: Math.min(...pairGZ),
        maxGZ: Math.max(...pairGZ)
      }];

      if (remaining.length > 0) {
        footprints.push({
          minGX: remaining[0].gx,
          maxGX: remaining[0].gx,
          minGZ: remaining[0].gz,
          maxGZ: remaining[0].gz
        });
      }

      return footprints;
    };

    const pickDoorSides = (count) => {
      const sides = ['north', 'south', 'east', 'west']
        .map(side => ({ side, order: Math.random() }))
        .sort((a, b) => a.order - b.order)
        .map(item => item.side);
      return sides.slice(0, Math.max(1, Math.min(maxDoorSides, count)));
    };

    let buildingIndex = 0;
    for (const group of mergedGroups) {
      const footprints = shapeToFootprints(group);
      for (let partIndex = 0; partIndex < footprints.length; partIndex += 1) {
        const footprint = footprints[partIndex];
        const spanGX = footprint.maxGX - footprint.minGX + 1;
        const spanGZ = footprint.maxGZ - footprint.minGZ + 1;
        const blockCenterX = cityMinX
          + streetWidth
          + footprint.minGX * (blockWidth + streetWidth)
          + (spanGX * blockWidth + (spanGX - 1) * streetWidth) / 2;
        const blockCenterZ = cityMinZ
          + streetWidth
          + footprint.minGZ * (blockDepth + streetWidth)
          + (spanGZ * blockDepth + (spanGZ - 1) * streetWidth) / 2;
        const maxLotWidth = spanGX * blockWidth + (spanGX - 1) * streetWidth;
        const maxLotDepth = spanGZ * blockDepth + (spanGZ - 1) * streetWidth;
        const fillMin = footprints.length > 1 || group.length > 1 ? 0.84 : 0.68;
        const fillMax = footprints.length > 1 || group.length > 1 ? 0.95 : 0.85;
        const width = this.clamp(maxLotWidth * this.randomInRange(fillMin, fillMax), 12, Math.max(13, maxLotWidth - 2.2));
        const depth = this.clamp(maxLotDepth * this.randomInRange(fillMin, fillMax), 12, Math.max(13, maxLotDepth - 2.2));
      const wallThickness = this.randomInRange(1.2, 2.0);
      const wallHeight = this.randomInRange(7.4, 9.2);
      const sideLengths = {
        north: width,
        south: width,
        east: depth,
        west: depth
      };
      const buildingArea = width * depth;
      const isLargeBuilding = Math.max(width, depth) >= largeBuildingDoorThreshold
        || buildingArea >= largeBuildingDoorThreshold * largeBuildingDoorThreshold * 0.9;
      const desiredDoorSides = isLargeBuilding
        ? (Math.random() < 0.5 ? 2 : 3)
        : (Math.random() < 0.72 ? 1 : 2);
      const selectedDoorSides = pickDoorSides(desiredDoorSides);
      const doorSides = [];
      for (const side of selectedDoorSides) {
        const sideLength = sideLengths[side] || Math.min(width, depth);
        const canUseMultiple = isLargeBuilding && sideLength >= largeBuildingDoorThreshold * 0.88;
        const perSideCount = canUseMultiple
          ? (Math.random() < 0.65 ? 2 : largeBuildingDoorsPerSide)
          : 1;
        for (let doorIndex = 0; doorIndex < perSideCount; doorIndex += 1) {
          doorSides.push(side);
        }
      }
      if (doorSides.length === 0) {
        doorSides.push(selectedDoorSides[0] || 'south');
      }
      const doorWidth = this.clamp(this.randomInRange(4.5, 6.5), 3.2, Math.min(width, depth) - 3);

      const building = {
        id: `b-${buildingIndex}-${partIndex}`,
        x: blockCenterX,
        z: blockCenterZ,
        width,
        depth,
        wallThickness,
        wallHeight,
        doorWidth,
        doorSide: doorSides[0],
        doorSides,
        wallSegments: [],
        openings: []
      };

      const layout = this.getBuildingWallLayout(building);
      building.wallSegments = layout.segments;
      building.openings = layout.openings;
      buildings.push(building);
      }
      buildingIndex += 1;

    }

    const boundaryThickness = 2.2;
    const boundaryHeight = 8;
    const boundarySpan = halfSize * 2;
    walls.push(
      { x: 0, z: -halfSize, width: boundarySpan, depth: boundaryThickness, height: boundaryHeight, type: 'boundary' },
      { x: 0, z: halfSize, width: boundarySpan, depth: boundaryThickness, height: boundaryHeight, type: 'boundary' },
      { x: -halfSize, z: 0, width: boundaryThickness, depth: boundarySpan, height: boundaryHeight, type: 'boundary' },
      { x: halfSize, z: 0, width: boundaryThickness, depth: boundarySpan, height: boundaryHeight, type: 'boundary' }
    );

    const streetWalls = [];
    this.buildStreetWalls(horizontalStreetCenters, cityMinX + streetWidth, cityMinX + usableSize - streetWidth, streetWidth, 'x').forEach(wall => streetWalls.push(wall));
    this.buildStreetWalls(verticalStreetCenters, cityMinZ + streetWidth, cityMinZ + usableSize - streetWidth, streetWidth, 'z').forEach(wall => streetWalls.push(wall));
    const centerClearRadius = effectiveCenterClearRadiusCells * Math.max(blockWidth, blockDepth);
    const crossWallExclusionZones = [];
    const crossOnlyExclusionZones = [];
    const outerLayout = this.getOuterWallLayout(halfSize, worldConfig, {
      blockWidth,
      blockDepth,
      streetWidth
    });

    if (outerLayout.enabled) {
      const exclusionPadding = this.clamp(Number(worldConfig.crossWallExclusionPadding) || Math.max(streetWidth * 0.45, 2.2), 1.2, 12);
      const lineHalfWidth = outerLayout.thickness / 2 + exclusionPadding;
      const xWallAbs = outerLayout.xWallAbs;
      const zWallAbs = outerLayout.zWallAbs;
      const sideMin = outerLayout.spanMin;
      const sideMax = outerLayout.spanMax;
      const middleHalf = outerLayout.halfMiddleOpen;

      crossWallExclusionZones.push(
        {
          minX: sideMin,
          maxX: sideMax,
          minZ: -zWallAbs - lineHalfWidth,
          maxZ: -zWallAbs + lineHalfWidth
        },
        {
          minX: sideMin,
          maxX: sideMax,
          minZ: zWallAbs - lineHalfWidth,
          maxZ: zWallAbs + lineHalfWidth
        },
        {
          minX: -xWallAbs - lineHalfWidth,
          maxX: -xWallAbs + lineHalfWidth,
          minZ: sideMin,
          maxZ: sideMax
        },
        {
          minX: xWallAbs - lineHalfWidth,
          maxX: xWallAbs + lineHalfWidth,
          minZ: sideMin,
          maxZ: sideMax
        }
      );

      // Keep middle gates open with extra breathing room.
      crossWallExclusionZones.push(
        {
          minX: -middleHalf - exclusionPadding,
          maxX: middleHalf + exclusionPadding,
          minZ: -zWallAbs - lineHalfWidth,
          maxZ: -zWallAbs + lineHalfWidth
        },
        {
          minX: -middleHalf - exclusionPadding,
          maxX: middleHalf + exclusionPadding,
          minZ: zWallAbs - lineHalfWidth,
          maxZ: zWallAbs + lineHalfWidth
        },
        {
          minX: -xWallAbs - lineHalfWidth,
          maxX: -xWallAbs + lineHalfWidth,
          minZ: -middleHalf - exclusionPadding,
          maxZ: middleHalf + exclusionPadding
        },
        {
          minX: xWallAbs - lineHalfWidth,
          maxX: xWallAbs + lineHalfWidth,
          minZ: -middleHalf - exclusionPadding,
          maxZ: middleHalf + exclusionPadding
        }
      );

      // Keep corner gates open as requested.
      const cornerGate = outerLayout.cornerOpen + exclusionPadding;
      crossWallExclusionZones.push(
        { minX: -halfSize, maxX: -halfSize + cornerGate, minZ: -halfSize, maxZ: -halfSize + cornerGate },
        { minX: halfSize - cornerGate, maxX: halfSize, minZ: -halfSize, maxZ: -halfSize + cornerGate },
        { minX: -halfSize, maxX: -halfSize + cornerGate, minZ: halfSize - cornerGate, maxZ: halfSize },
        { minX: halfSize - cornerGate, maxX: halfSize, minZ: halfSize - cornerGate, maxZ: halfSize }
      );

      // Keep outer-wall corner junctions clear; these were spawning corner crosses.
      const matchCornerJunctionToMiddle = worldConfig.outerCornerJunctionMatchMiddle !== false;
      const configuredJunctionOpening = Number(worldConfig.outerCornerJunctionOpening);
      const cornerJunctionOpening = this.clamp(
        matchCornerJunctionToMiddle
          ? outerLayout.middleOpen
          : (configuredJunctionOpening || Math.max(outerLayout.cornerOpen * 0.55, outerLayout.thickness * 3.2)),
        4,
        halfSize * 0.62
      );
      const cornerJunctionClearance = Math.max(
        lineHalfWidth * 1.2,
        cornerJunctionOpening * 0.6,
        streetWidth * 0.9
      );
      crossWallExclusionZones.push(
        {
          minX: -xWallAbs - cornerJunctionClearance,
          maxX: -xWallAbs + cornerJunctionClearance,
          minZ: -zWallAbs - cornerJunctionClearance,
          maxZ: -zWallAbs + cornerJunctionClearance
        },
        {
          minX: xWallAbs - cornerJunctionClearance,
          maxX: xWallAbs + cornerJunctionClearance,
          minZ: -zWallAbs - cornerJunctionClearance,
          maxZ: -zWallAbs + cornerJunctionClearance
        },
        {
          minX: -xWallAbs - cornerJunctionClearance,
          maxX: -xWallAbs + cornerJunctionClearance,
          minZ: zWallAbs - cornerJunctionClearance,
          maxZ: zWallAbs + cornerJunctionClearance
        },
        {
          minX: xWallAbs - cornerJunctionClearance,
          maxX: xWallAbs + cornerJunctionClearance,
          minZ: zWallAbs - cornerJunctionClearance,
          maxZ: zWallAbs + cornerJunctionClearance
        }
      );

      const noCrossOuterSpaces = this.clamp(Number(worldConfig.outerCrossNoSpawnSpaces) || 2, 0, 6);
      if (noCrossOuterSpaces > 0) {
        const gridStepX = Math.max(1, blockWidth + streetWidth);
        const gridStepZ = Math.max(1, blockDepth + streetWidth);
        const noCrossBufferX = noCrossOuterSpaces * gridStepX;
        const noCrossBufferZ = noCrossOuterSpaces * gridStepZ;
        const sideSpanMin = sideMin - lineHalfWidth;
        const sideSpanMax = sideMax + lineHalfWidth;

        crossOnlyExclusionZones.push(
          {
            minX: -xWallAbs - lineHalfWidth,
            maxX: -xWallAbs + noCrossBufferX,
            minZ: sideSpanMin,
            maxZ: sideSpanMax
          },
          {
            minX: xWallAbs - noCrossBufferX,
            maxX: xWallAbs + lineHalfWidth,
            minZ: sideSpanMin,
            maxZ: sideSpanMax
          },
          {
            minX: sideSpanMin,
            maxX: sideSpanMax,
            minZ: -zWallAbs - lineHalfWidth,
            maxZ: -zWallAbs + noCrossBufferZ
          },
          {
            minX: sideSpanMin,
            maxX: sideSpanMax,
            minZ: zWallAbs - noCrossBufferZ,
            maxZ: zWallAbs + lineHalfWidth
          }
        );
      }
    }

    // Keep central free area clean of cross walls.
    crossWallExclusionZones.push({
      minX: -centerClearRadius,
      maxX: centerClearRadius,
      minZ: -centerClearRadius,
      maxZ: centerClearRadius
    });

    const filteredStreetWalls = streetWalls.filter(wall => !this.doesWallIntersectZones(wall, crossWallExclusionZones));

    const crossedWalls = this.buildCrossPatternWalls(
      verticalStreetCenters,
      horizontalStreetCenters,
      streetWidth,
      worldConfig,
      (cityMinX + cityMaxX) / 2,
      (cityMinZ + cityMaxZ) / 2,
      centerClearRadius,
      [...crossWallExclusionZones, ...crossOnlyExclusionZones]
    );
    const outerStraightWalls = this.buildOuterStraightWalls(halfSize, worldConfig, {
      blockWidth,
      blockDepth,
      streetWidth
    });
    walls.push(...outerStraightWalls);

    const wallsCount = Math.max(0, Number(worldConfig.wallsCount) || 0);
    const streetWallsShuffled = filteredStreetWalls
      .map(wall => ({ wall, order: Math.random() }))
      .sort((a, b) => a.order - b.order)
      .map(entry => entry.wall);
    const patternWalls = [...crossedWalls, ...streetWallsShuffled];
    const cappedPatternCount = Math.max(0, wallsCount - outerStraightWalls.length);
    for (const wall of patternWalls.slice(0, cappedPatternCount)) {
      walls.push(wall);
    }

    return {
      generatedAt: Date.now(),
      bounds: {
        minX: -halfSize,
        maxX: halfSize,
        minZ: -halfSize,
        maxZ: halfSize
      },
      streets: {
        streetWidth,
        blocksX,
        blocksZ,
        verticalCenters: verticalStreetCenters,
        horizontalCenters: horizontalStreetCenters
      },
      walls,
      buildings
    };
  }

  getWorldLayout() {
    return this.worldLayout;
  }

  getArenaHalfSize() {
    return this.arenaHalfSize || (Number(config.arena.halfSize) || 80);
  }

  buildWorldCollision(worldLayout) {
    const solidBoxes = [];
    const bulletBoxes = [];
    const playerOnlyBoxes = [];
    const secondFloors = [];
    const ramps = [];

    (worldLayout.walls || []).forEach(wall => {
      const aabb = this.makeBoxAabb(wall.x, wall.height / 2, wall.z, wall.width, wall.height, wall.depth);
      solidBoxes.push(aabb);
      bulletBoxes.push(aabb);
    });

    (worldLayout.buildings || []).forEach(building => {
      (building.wallSegments || this.getBuildingWallSegments(building)).forEach(segment => {
        const centerY = Number.isFinite(segment.y) ? segment.y : segment.height / 2;
        const aabb = this.makeBoxAabb(segment.x, centerY, segment.z, segment.width, segment.height, segment.depth);
        solidBoxes.push(aabb);
        bulletBoxes.push(aabb);
      });

      const openings = building.openings || [];
      const halfW = building.width / 2;
      const halfD = building.depth / 2;
      const blockerDepth = Math.max(0.6, (building.wallThickness || 1) * 0.9);

      for (const opening of openings) {
        if (opening.type !== 'window') {
          continue;
        }

        const blockerHeight = this.clamp((Number(opening.bottom) || 0) + 0.22, 1.25, 2.6);
        const span = Math.max(0.9, opening.end - opening.start);
        let blocker = null;

        if (opening.side === 'north') {
          blocker = this.makeBoxAabb(
            building.x + (opening.start + opening.end) / 2,
            blockerHeight / 2,
            building.z - halfD,
            span,
            blockerHeight,
            blockerDepth
          );
        } else if (opening.side === 'south') {
          blocker = this.makeBoxAabb(
            building.x + (opening.start + opening.end) / 2,
            blockerHeight / 2,
            building.z + halfD,
            span,
            blockerHeight,
            blockerDepth
          );
        } else if (opening.side === 'west') {
          blocker = this.makeBoxAabb(
            building.x - halfW,
            blockerHeight / 2,
            building.z + (opening.start + opening.end) / 2,
            blockerDepth,
            blockerHeight,
            span
          );
        } else if (opening.side === 'east') {
          blocker = this.makeBoxAabb(
            building.x + halfW,
            blockerHeight / 2,
            building.z + (opening.start + opening.end) / 2,
            blockerDepth,
            blockerHeight,
            span
          );
        }

        if (blocker) {
          playerOnlyBoxes.push(blocker);
        }
      }
    });

    (worldLayout.secondFloors || []).forEach(floor => {
      secondFloors.push(this.makeFlatRect(floor.x, floor.z, floor.width, floor.depth, floor.y));
      const floorAabb = this.makeBoxAabb(
        floor.x,
        floor.y - floor.thickness / 2,
        floor.z,
        floor.width,
        floor.thickness,
        floor.depth
      );
      bulletBoxes.push(floorAabb);
    });

    (worldLayout.upperWalls || []).forEach(segment => {
      const aabb = this.makeBoxAabb(segment.x, segment.y, segment.z, segment.width, segment.height, segment.depth);
      solidBoxes.push(aabb);
      bulletBoxes.push(aabb);
    });

    (worldLayout.ramps || []).forEach(ramp => {
      ramps.push({
        x: ramp.x,
        z: ramp.z,
        width: ramp.width,
        length: ramp.length,
        direction: this.normalizeDirection(ramp.direction),
        startY: Number.isFinite(ramp.startY) ? ramp.startY : Number(config.arena.spawnY) || 1,
        endY: Number.isFinite(ramp.endY)
          ? ramp.endY
          : (Number.isFinite(ramp.startY) ? ramp.startY : Number(config.arena.spawnY) || 1) + (Number(ramp.height) || 0)
      });
    });

    return {
      solidBoxes,
      bulletBoxes,
      playerOnlyBoxes,
      secondFloors,
      ramps
    };
  }

  worldToRampLocal(x, z, ramp) {
    const dx = x - ramp.x;
    const dz = z - ramp.z;
    if (ramp.direction === 0) {
      return { x: dx, z: dz };
    }
    if (ramp.direction === 90) {
      return { x: dz, z: -dx };
    }
    if (ramp.direction === 180) {
      return { x: -dx, z: -dz };
    }
    return { x: -dz, z: dx };
  }

  getTerrainHeightAt(x, z, currentY) {
    const baseY = Number(config.arena.spawnY) || 1;
    let targetY = baseY;
    let rampHeight = null;

    for (const ramp of this.worldCollision.ramps) {
      const local = this.worldToRampLocal(x, z, ramp);
      if (Math.abs(local.x) <= ramp.length / 2 && Math.abs(local.z) <= ramp.width / 2) {
        const t = this.clamp((local.x + ramp.length / 2) / ramp.length, 0, 1);
        const y = ramp.startY + (ramp.endY - ramp.startY) * t;
        if (rampHeight === null || y > rampHeight) {
          rampHeight = y;
        }
      }
    }

    if (rampHeight !== null) {
      targetY = Math.max(targetY, rampHeight);
    }

    const canUseUpperFloor = (Number(currentY) || baseY) > baseY + 0.75 || rampHeight !== null;
    for (const floor of this.worldCollision.secondFloors) {
      if (x >= floor.minX && x <= floor.maxX && z >= floor.minZ && z <= floor.maxZ && canUseUpperFloor) {
        targetY = Math.max(targetY, floor.y);
      }
    }

    return targetY;
  }

  intersectsCircleAabb2d(x, z, radius, box) {
    const closestX = this.clamp(x, box.minX, box.maxX);
    const closestZ = this.clamp(z, box.minZ, box.maxZ);
    const dx = x - closestX;
    const dz = z - closestZ;
    return dx * dx + dz * dz <= radius * radius;
  }

  isPlayerBlocked(x, y, z, radius = this.playerRadius, height = this.playerHeight) {
    const playerMinY = y;
    const playerMaxY = y + height;

    const collisionBoxes = [
      ...(this.worldCollision.solidBoxes || []),
      ...(this.worldCollision.playerOnlyBoxes || [])
    ];

    for (const box of collisionBoxes) {
      const overlapsVertical = playerMaxY > box.minY && playerMinY < box.maxY;
      if (!overlapsVertical) {
        continue;
      }
      if (this.intersectsCircleAabb2d(x, z, radius, box)) {
        return true;
      }
    }
    return false;
  }

  isBulletBlocked(position) {
    for (const box of this.worldCollision.bulletBoxes) {
      if (
        position.x >= box.minX &&
        position.x <= box.maxX &&
        position.y >= box.minY &&
        position.y <= box.maxY &&
        position.z >= box.minZ &&
        position.z <= box.maxZ
      ) {
        return true;
      }
    }
    return false;
  }

  resolvePlayerMovement(currentPosition, targetPosition) {
    const halfSize = this.getArenaHalfSize();
    const currentX = Number(currentPosition.x) || 0;
    const currentZ = Number(currentPosition.z) || 0;
    const currentY = Number(currentPosition.y) || (Number(config.arena.spawnY) || 1);
    const desiredX = this.clamp(Number(targetPosition.x) || currentX, -halfSize + 1, halfSize - 1);
    const desiredZ = this.clamp(Number(targetPosition.z) || currentZ, -halfSize + 1, halfSize - 1);

    let resolvedX = currentX;
    let resolvedZ = currentZ;

    const xStepY = this.getTerrainHeightAt(desiredX, currentZ, currentY);
    if (!this.isPlayerBlocked(desiredX, xStepY, currentZ)) {
      resolvedX = desiredX;
    }

    const zStepY = this.getTerrainHeightAt(resolvedX, desiredZ, currentY);
    if (!this.isPlayerBlocked(resolvedX, zStepY, desiredZ)) {
      resolvedZ = desiredZ;
    }

    let resolvedY = this.getTerrainHeightAt(resolvedX, resolvedZ, currentY);
    if (this.isPlayerBlocked(resolvedX, resolvedY, resolvedZ)) {
      resolvedX = currentX;
      resolvedZ = currentZ;
      resolvedY = this.getTerrainHeightAt(currentX, currentZ, currentY);
    }

    return {
      x: resolvedX,
      y: resolvedY,
      z: resolvedZ
    };
  }

  getValidSpawnPosition() {
    const halfSize = this.getArenaHalfSize();
    const spawnY = Number(config.arena.spawnY) || 1;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const x = this.randomInRange(-halfSize + 3, halfSize - 3);
      const z = this.randomInRange(-halfSize + 3, halfSize - 3);
      const y = this.getTerrainHeightAt(x, z, spawnY);
      if (!this.isPlayerBlocked(x, y, z)) {
        return { x, y, z };
      }
    }
    return { x: 0, y: spawnY, z: 0 };
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

  parseConfiguredColor(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^#?[0-9a-fA-F]{6}$/.test(trimmed)) {
        const normalized = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
        return parseInt(normalized, 16);
      }
      if (/^0x[0-9a-fA-F]{6}$/.test(trimmed)) {
        return parseInt(trimmed, 16);
      }
    }
    return null;
  }

  getColorForBotType(botType) {
    const configured = this.parseConfiguredColor(this.botTypeColors[botType]);
    if (configured !== null) {
      return configured;
    }

    const fallback = {
      dumb: 0x6E7B8B,
      simple: 0x00CCFF,
      seeking: 0x22C55E,
      teleporting: 0xA855F7,
      danger: 0xF97316,
      monsters: 0xEF4444
    };
    return fallback[botType] || this.getRandomPlayerColor();
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

  initializeSimpleBots() {
    const counts = this.getBotTypeCounts();

    for (const type of this.botTypeOrder) {
      const count = counts[type] || 0;
      for (let i = 0; i < count; i += 1) {
        const playerId = `bot-${type}-${i + 1}`;
        const botName = `${type}${i + 1}`;
        this.addPlayer(playerId, botName, { isBot: true, botType: type });
        this.botIds.add(playerId);
        this.botState.set(playerId, {
          botType: type,
          nextWanderChangeAt: 0,
          wanderDirection: { x: 1, z: 0 },
          lastTeleportAt: 0
        });
      }
    }
  }

  getBotTypeCounts() {
    const botConfig = config.bots || {};
    const countsConfig = botConfig.counts || {};
    const counts = {
      dumb: Math.max(0, Number(countsConfig.dumb) || 0),
      simple: Math.max(0, Number(countsConfig.simple) || 0),
      seeking: Math.max(0, Number(countsConfig.seeking) || 0),
      teleporting: Math.max(0, Number(countsConfig.teleporting) || 0),
      danger: Math.max(0, Number(countsConfig.danger) || 0),
      monsters: Math.max(0, Number(countsConfig.monsters) || 0)
    };

    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    if (total === 0 && this.simpleBotCount > 0) {
      counts.simple = this.simpleBotCount;
    }

    return counts;
  }

  getBotSettings(botType) {
    const defaults = {
      dumb: { moveSpeed: 0.14, shootDistance: 28, shootCooldownMs: 420, dodgeDistance: 10 },
      simple: { moveSpeed: 0.23, shootDistance: 40, shootCooldownMs: 100, dodgeDistance: 14 },
      seeking: { moveSpeed: 0.28, shootDistance: 48, shootCooldownMs: 90, dodgeDistance: 16, seekCoverDistance: 6 },
      teleporting: { moveSpeed: 0.2, shootDistance: 52, shootCooldownMs: 100, dodgeDistance: 16, teleportCooldownMs: 550, teleportDistance: 6.4, teleportAwayDistance: 12 },
      danger: { moveSpeed: 0.38, shootDistance: 60, shootCooldownMs: 75, dodgeDistance: 18, bulletSpeedMultiplier: 1.8, bulletDamageMultiplier: 1.5 },
      monsters: { moveSpeed: 0.45, shootDistance: 65, shootCooldownMs: 60, dodgeDistance: 20, bulletSpeedMultiplier: 2.4, bulletDamageMultiplier: 2 }
    };

    const base = defaults[botType] || defaults.simple;
    const overrides = ((config.bots || {}).settings || {})[botType] || {};
    return {
      ...base,
      ...overrides
    };
  }

  ensureBotState(playerId) {
    let state = this.botState.get(playerId);
    if (!state) {
      const player = this.players.get(playerId);
      state = {
        botType: (player && player.botType) || 'simple',
        nextWanderChangeAt: 0,
        wanderDirection: { x: 1, z: 0 },
        lastTeleportAt: 0
      };
      this.botState.set(playerId, state);
    }
    return state;
  }

  findNearestTarget(bot, maxDistance, requireLineOfSight = false) {
    let nearest = null;
    let nearestDistance = maxDistance;

    for (const [playerId, player] of this.players) {
      if (playerId === bot.id || player.deathTime) {
        continue;
      }

      const dx = player.position.x - bot.position.x;
      const dz = player.position.z - bot.position.z;
      const planarDistance = Math.sqrt(dx * dx + dz * dz);
      if (planarDistance > nearestDistance) {
        continue;
      }

      if (requireLineOfSight) {
        const botEye = {
          x: bot.position.x,
          y: bot.position.y + 1.25,
          z: bot.position.z
        };
        const targetCenter = {
          x: player.position.x,
          y: player.position.y + 1.0,
          z: player.position.z
        };
        if (!this.hasLineOfSight(botEye, targetCenter)) {
          continue;
        }
      }

      nearest = player;
      nearestDistance = planarDistance;
    }

    return nearest;
  }

  findLowestHealthTarget(bot, maxDistance, requireLineOfSight = false) {
    let best = null;
    let bestHealth = Number.POSITIVE_INFINITY;
    let bestDistance = maxDistance;

    for (const [playerId, player] of this.players) {
      if (playerId === bot.id || player.deathTime) {
        continue;
      }

      const dx = player.position.x - bot.position.x;
      const dz = player.position.z - bot.position.z;
      const planarDistance = Math.sqrt(dx * dx + dz * dz);
      if (planarDistance > maxDistance) {
        continue;
      }

      if (requireLineOfSight) {
        const botEye = {
          x: bot.position.x,
          y: bot.position.y + 1.25,
          z: bot.position.z
        };
        const targetCenter = {
          x: player.position.x,
          y: player.position.y + 1.0,
          z: player.position.z
        };
        if (!this.hasLineOfSight(botEye, targetCenter)) {
          continue;
        }
      }

      if (player.health < bestHealth || (player.health === bestHealth && planarDistance < bestDistance)) {
        best = player;
        bestHealth = player.health;
        bestDistance = planarDistance;
      }
    }

    return best;
  }

  moveBotByIntent(bot, moveX, moveZ, moveSpeed) {
    const moveLength = Math.sqrt(moveX * moveX + moveZ * moveZ) || 1;
    const nextPosition = {
      x: bot.position.x + (moveX / moveLength) * moveSpeed,
      y: bot.position.y,
      z: bot.position.z + (moveZ / moveLength) * moveSpeed
    };
    bot.position = this.resolvePlayerMovement(bot.position, nextPosition);
  }

  tryBotShoot(bot, target, shootDistance, now, shootCooldownMs, settings = {}) {
    if (!target) {
      return;
    }

    const aimX = target.position.x - bot.position.x;
    const aimY = (target.position.y + 1.0) - (bot.position.y + 1.0);
    const aimZ = target.position.z - bot.position.z;
    const aimLength = Math.sqrt(aimX * aimX + aimY * aimY + aimZ * aimZ) || 1;
    const direction = {
      x: aimX / aimLength,
      y: aimY / aimLength,
      z: aimZ / aimLength
    };

    const yaw = Math.atan2(-direction.x, -direction.z);
    const pitch = Math.asin(this.clamp(direction.y, -1, 1));
    bot.rotation = { x: pitch, y: yaw, z: 0 };

    const distanceToTarget = Math.sqrt(aimX * aimX + aimZ * aimZ);
    if (distanceToTarget <= shootDistance && now - bot.lastShotTime >= shootCooldownMs) {
      bot.lastShotTime = now;
      const speedMultiplier = Math.max(0.25, Number(settings.bulletSpeedMultiplier) || 1);
      const damageMultiplier = Math.max(0.25, Number(settings.bulletDamageMultiplier) || 1);
      this.addBullet(bot.id, {
        x: bot.position.x,
        y: bot.position.y + 0.6,
        z: bot.position.z
      }, direction, {
        speedMultiplier,
        damageMultiplier
      });
    }
  }

  tryBotTeleport(bot, target, botState, now, settings) {
    if (!target) {
      return false;
    }

    const cooldownMs = Math.max(100, Number(settings.teleportCooldownMs) || 700);
    if (now - botState.lastTeleportAt < cooldownMs) {
      return false;
    }

    const targetYaw = Number(target.rotation && target.rotation.y) || 0;
    const forwardX = -Math.sin(targetYaw);
    const forwardZ = -Math.cos(targetYaw);
    const rightX = -forwardZ;
    const rightZ = forwardX;
    const teleportDistance = Math.max(3, Number(settings.teleportDistance) || 6.2);
    const candidates = [
      {
        x: target.position.x - forwardX * teleportDistance,
        y: target.position.y,
        z: target.position.z - forwardZ * teleportDistance
      },
      {
        x: target.position.x - forwardX * (teleportDistance + 1.4) + rightX * 1.6,
        y: target.position.y,
        z: target.position.z - forwardZ * (teleportDistance + 1.4) + rightZ * 1.6
      },
      {
        x: target.position.x - forwardX * (teleportDistance + 1.4) - rightX * 1.6,
        y: target.position.y,
        z: target.position.z - forwardZ * (teleportDistance + 1.4) - rightZ * 1.6
      }
    ];

    for (const candidate of candidates) {
      const targetY = this.getTerrainHeightAt(candidate.x, candidate.z, bot.position.y);
      if (this.isPlayerBlocked(candidate.x, targetY, candidate.z)) {
        continue;
      }

      bot.position = { x: candidate.x, y: targetY, z: candidate.z };
      botState.lastTeleportAt = now;
      return true;
    }

    return false;
  }

  hasLineOfSight(fromPosition, toPosition) {
    const dx = toPosition.x - fromPosition.x;
    const dy = toPosition.y - fromPosition.y;
    const dz = toPosition.z - fromPosition.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const steps = Math.max(2, Math.ceil(distance / 1.2));

    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const sample = {
        x: fromPosition.x + dx * t,
        y: fromPosition.y + dy * t,
        z: fromPosition.z + dz * t
      };
      if (this.isBulletBlocked(sample)) {
        return false;
      }
    }

    return true;
  }

  findNearestVisibleTarget(bot, maxDistance) {
    let nearest = null;
    let nearestDistance = maxDistance;

    for (const [playerId, player] of this.players) {
      if (playerId === bot.id || player.deathTime) {
        continue;
      }

      const dx = player.position.x - bot.position.x;
      const dz = player.position.z - bot.position.z;
      const planarDistance = Math.sqrt(dx * dx + dz * dz);
      if (planarDistance > nearestDistance) {
        continue;
      }

      const botEye = {
        x: bot.position.x,
        y: bot.position.y + 1.25,
        z: bot.position.z
      };
      const targetCenter = {
        x: player.position.x,
        y: player.position.y + 1.0,
        z: player.position.z
      };

      if (!this.hasLineOfSight(botEye, targetCenter)) {
        continue;
      }

      nearest = player;
      nearestDistance = planarDistance;
    }

    return nearest;
  }

  findIncomingBulletThreat(bot, detectionDistance) {
    let highestThreat = null;

    for (const bullet of this.bullets) {
      if (bullet.playerId === bot.id) {
        continue;
      }

      const relX = bot.position.x - bullet.position.x;
      const relZ = bot.position.z - bullet.position.z;
      const distance = Math.sqrt(relX * relX + relZ * relZ);
      if (distance > detectionDistance) {
        continue;
      }

      const dirX = bullet.direction.x;
      const dirZ = bullet.direction.z;
      const dirLength = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
      const normDirX = dirX / dirLength;
      const normDirZ = dirZ / dirLength;

      const forward = relX * normDirX + relZ * normDirZ;
      if (forward <= 0 || forward > 9) {
        continue;
      }

      const lateral = Math.abs(relX * (-normDirZ) + relZ * normDirX);
      if (lateral > 2.4) {
        continue;
      }

      const threatScore = (10 - forward) + (2.4 - lateral);
      if (!highestThreat || threatScore > highestThreat.threatScore) {
        highestThreat = {
          bullet,
          threatScore,
          normDirX,
          normDirZ,
          relX,
          relZ
        };
      }
    }

    return highestThreat;
  }

  getThreatDodgeVector(threat) {
    if (!threat) {
      return null;
    }

    const rightX = -threat.normDirZ;
    const rightZ = threat.normDirX;
    const sideSign = (threat.relX * rightX + threat.relZ * rightZ) >= 0 ? 1 : -1;
    return {
      x: rightX * sideSign,
      z: rightZ * sideSign
    };
  }

  getCoverSeekVector(bot, threat, coverDistance = 6) {
    if (!threat || !threat.bullet) {
      return null;
    }

    const shooter = this.players.get(threat.bullet.playerId);
    const fallback = this.getThreatDodgeVector(threat);
    if (!shooter) {
      return fallback;
    }

    const candidateDirs = [];
    if (fallback) {
      candidateDirs.push(fallback, { x: -fallback.x, z: -fallback.z });
    }
    candidateDirs.push(
      { x: -threat.normDirX, z: -threat.normDirZ },
      { x: threat.normDirX, z: threat.normDirZ }
    );

    const shooterEye = {
      x: shooter.position.x,
      y: shooter.position.y + 1.2,
      z: shooter.position.z
    };

    let bestVector = fallback;
    let bestScore = -Infinity;

    for (const dir of candidateDirs) {
      const length = Math.sqrt(dir.x * dir.x + dir.z * dir.z) || 1;
      const nx = dir.x / length;
      const nz = dir.z / length;
      const candidateX = bot.position.x + nx * coverDistance;
      const candidateZ = bot.position.z + nz * coverDistance;
      const candidateY = this.getTerrainHeightAt(candidateX, candidateZ, bot.position.y);

      if (this.isPlayerBlocked(candidateX, candidateY, candidateZ)) {
        continue;
      }

      const candidateEye = { x: candidateX, y: candidateY + 1.1, z: candidateZ };
      const breaksLine = !this.hasLineOfSight(shooterEye, candidateEye);
      const distFromShooter = Math.sqrt(
        (candidateX - shooter.position.x) * (candidateX - shooter.position.x) +
        (candidateZ - shooter.position.z) * (candidateZ - shooter.position.z)
      );

      const score = (breaksLine ? 6 : 0) + distFromShooter * 0.12;
      if (score > bestScore) {
        bestScore = score;
        bestVector = { x: nx, z: nz };
      }
    }

    return bestVector;
  }

  tryBotTeleportAway(bot, threat, botState, now, settings) {
    if (!threat) {
      return false;
    }

    const cooldownMs = Math.max(120, Number(settings.teleportCooldownMs) || 550);
    if (now - botState.lastTeleportAt < cooldownMs) {
      return false;
    }

    const awayDistance = Math.max(8, Number(settings.teleportAwayDistance) || 12);
    const dodge = this.getThreatDodgeVector(threat) || { x: 1, z: 0 };
    const opposite = { x: -threat.normDirX, z: -threat.normDirZ };
    const candidates = [
      {
        x: bot.position.x + dodge.x * awayDistance,
        y: bot.position.y,
        z: bot.position.z + dodge.z * awayDistance
      },
      {
        x: bot.position.x - dodge.x * awayDistance,
        y: bot.position.y,
        z: bot.position.z - dodge.z * awayDistance
      },
      {
        x: bot.position.x + opposite.x * (awayDistance + 2),
        y: bot.position.y,
        z: bot.position.z + opposite.z * (awayDistance + 2)
      }
    ];

    for (const candidate of candidates) {
      const targetY = this.getTerrainHeightAt(candidate.x, candidate.z, bot.position.y);
      if (this.isPlayerBlocked(candidate.x, targetY, candidate.z)) {
        continue;
      }

      bot.position = { x: candidate.x, y: targetY, z: candidate.z };
      botState.lastTeleportAt = now;
      return true;
    }

    return false;
  }

  updateSimpleBots() {
    if (this.botIds.size === 0) {
      return;
    }

    const now = Date.now();
    const baseShootCooldownMs = Math.max(25, Number(config.combat.shootCooldownMs) || 100);

    for (const botId of this.botIds) {
      const bot = this.players.get(botId);
      if (!bot || bot.deathTime) {
        continue;
      }

      const botState = this.ensureBotState(botId);
      const botType = botState.botType || bot.botType || 'simple';
      const settings = this.getBotSettings(botType);
      const threat = this.findIncomingBulletThreat(bot, Number(settings.dodgeDistance) || 14);
      const visibleTarget = this.findNearestVisibleTarget(bot, 60);
      const nearestTarget = this.findNearestTarget(bot, 70, false);
      const lowHealthTarget = this.findLowestHealthTarget(bot, 70, false);
      const shootCooldownMs = Math.max(25, Number(settings.shootCooldownMs) || baseShootCooldownMs);

      let moveX = 0;
      let moveZ = 0;
      let shootTarget = visibleTarget;

      if (botType === 'dumb') {
        shootTarget = visibleTarget;
        const easyTarget = visibleTarget || nearestTarget;
        if (easyTarget) {
          const toTargetX = easyTarget.position.x - bot.position.x;
          const toTargetZ = easyTarget.position.z - bot.position.z;
          const toTargetLength = Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ) || 1;
          moveX = toTargetX / toTargetLength;
          moveZ = toTargetZ / toTargetLength;
        } else {
          const phase = (bot.id.length % 5) * 0.45;
          moveX = Math.cos(now * 0.00075 + phase);
          moveZ = Math.sin(now * 0.00075 + phase);
        }
      } else if (botType === 'seeking') {
        shootTarget = nearestTarget;
        if (threat) {
          const coverVector = this.getCoverSeekVector(bot, threat, Number(settings.seekCoverDistance) || 6);
          if (coverVector) {
            moveX = coverVector.x;
            moveZ = coverVector.z;
          }
        }
        if ((Math.abs(moveX) <= 0.001 && Math.abs(moveZ) <= 0.001) && shootTarget) {
          const toTargetX = shootTarget.position.x - bot.position.x;
          const toTargetZ = shootTarget.position.z - bot.position.z;
          const toTargetLength = Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ) || 1;
          moveX = toTargetX / toTargetLength;
          moveZ = toTargetZ / toTargetLength;
        }
      } else if (botType === 'teleporting') {
        shootTarget = nearestTarget || visibleTarget;
        const teleportedAway = this.tryBotTeleportAway(bot, threat, botState, now, settings);
        if (!teleportedAway && !this.tryBotTeleport(bot, shootTarget, botState, now, settings)) {
          if (shootTarget) {
            const toTargetX = shootTarget.position.x - bot.position.x;
            const toTargetZ = shootTarget.position.z - bot.position.z;
            const toTargetLength = Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ) || 1;
            const strafeX = -toTargetZ / toTargetLength;
            const strafeZ = toTargetX / toTargetLength;
            moveX = toTargetX / toTargetLength + strafeX * 0.5;
            moveZ = toTargetZ / toTargetLength + strafeZ * 0.5;
          }
        }
      } else if (botType === 'danger') {
        shootTarget = nearestTarget || lowHealthTarget || visibleTarget;
        if (threat) {
          const coverVector = this.getCoverSeekVector(bot, threat, Number(settings.seekCoverDistance) || 6);
          if (coverVector) {
            moveX = coverVector.x;
            moveZ = coverVector.z;
          }
        } else if (shootTarget) {
          const toTargetX = shootTarget.position.x - bot.position.x;
          const toTargetZ = shootTarget.position.z - bot.position.z;
          const toTargetLength = Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ) || 1;
          const strafeX = -toTargetZ / toTargetLength;
          const strafeZ = toTargetX / toTargetLength;
          moveX = toTargetX / toTargetLength + strafeX * 0.45;
          moveZ = toTargetZ / toTargetLength + strafeZ * 0.45;
        }
      } else if (botType === 'monsters') {
        shootTarget = nearestTarget || lowHealthTarget || visibleTarget;
        if (shootTarget) {
          const toTargetX = shootTarget.position.x - bot.position.x;
          const toTargetZ = shootTarget.position.z - bot.position.z;
          const toTargetLength = Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ) || 1;
          moveX = toTargetX / toTargetLength;
          moveZ = toTargetZ / toTargetLength;
          if (threat) {
            const dodge = this.getThreatDodgeVector(threat);
            if (dodge) {
              moveX += dodge.x * 0.25;
              moveZ += dodge.z * 0.25;
            }
          }
        }
      }

      if (botType === 'simple' && threat) {
        const rightX = -threat.normDirZ;
        const rightZ = threat.normDirX;
        const sideSign = (threat.relX * rightX + threat.relZ * rightZ) >= 0 ? 1 : -1;
        moveX = rightX * sideSign;
        moveZ = rightZ * sideSign;
      } else if (botType === 'simple' && visibleTarget) {
        const toTargetX = visibleTarget.position.x - bot.position.x;
        const toTargetZ = visibleTarget.position.z - bot.position.z;
        const toTargetLength = Math.sqrt(toTargetX * toTargetX + toTargetZ * toTargetZ) || 1;
        const towardsX = toTargetX / toTargetLength;
        const towardsZ = toTargetZ / toTargetLength;

        const strafeX = -towardsZ;
        const strafeZ = towardsX;
        const strafeAmount = Math.sin(now * 0.004 + Number(botId.length)) * 0.55;

        if (toTargetLength > 16) {
          moveX = towardsX + strafeX * strafeAmount;
          moveZ = towardsZ + strafeZ * strafeAmount;
        } else {
          moveX = strafeX * Math.sign(strafeAmount || 1);
          moveZ = strafeZ * Math.sign(strafeAmount || 1);
        }
      } else if (botType === 'simple') {
        if (now >= botState.nextWanderChangeAt) {
          const angle = Math.random() * Math.PI * 2;
          botState.wanderDirection = {
            x: Math.cos(angle),
            z: Math.sin(angle)
          };
          botState.nextWanderChangeAt = now + 1200 + Math.floor(Math.random() * 1500);
        }
        moveX = botState.wanderDirection.x;
        moveZ = botState.wanderDirection.z;
      }

      if (Math.abs(moveX) > 0.001 || Math.abs(moveZ) > 0.001) {
        this.moveBotByIntent(bot, moveX, moveZ, Number(settings.moveSpeed) || 0.23);
      }

      this.tryBotShoot(
        bot,
        shootTarget,
        Number(settings.shootDistance) || 38,
        now,
        shootCooldownMs,
        settings
      );

      bot.lastUpdate = now;
    }
  }

  addPlayer(playerId, name, options = {}) {
    const spawnPosition = this.getValidSpawnPosition();
    const isBot = Boolean(options.isBot);
    const botType = options.botType || null;
    const playerColor = isBot && botType
      ? this.getColorForBotType(botType)
      : this.getRandomPlayerColor();
    const player = {
      id: playerId,
      name: name && name.trim().length > 0 ? name.trim() : this.getUniqueName(),
      position: spawnPosition,
      rotation: { x: 0, y: 0, z: 0 },
      color: playerColor,
      health: config.player.maxHealth,
      score: 0,
      isBot: isBot,
      botType: botType,
      lastUpdate: Date.now(),
      deathTime: null, // Track when player died for respawn delay
      lastKillerName: null,
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
    if (player) {
      if (player.deathTime) {
        return;
      }

      player.position = this.resolvePlayerMovement(player.position, position || player.position);
      player.rotation = rotation || player.rotation;
      if (Number.isFinite(inputSequence)) {
        player.lastInputSequence = inputSequence;
      }
      player.lastUpdate = Date.now();
    }
  }

  addBullet(playerId, position, direction, options = {}) {
    const speedMultiplier = Math.max(0.25, Number(options.speedMultiplier) || 1);
    const damageMultiplier = Math.max(0.25, Number(options.damageMultiplier) || 1);
    const bullet = {
      id: `${playerId}-${this.bulletId++}`,
      playerId: playerId,
      position: { ...position },
      direction: { ...direction },
      speed: config.combat.bulletSpeed * speedMultiplier,
      damage: config.combat.bulletDamage * damageMultiplier,
      age: 0,
      maxAge: 300 // 300 ticks before disappearing
    };
    this.bullets.push(bullet);
    return bullet;
  }

  getCollisionCellCoords(x, z) {
    const cellSize = this.collisionGridCellSize;
    return {
      x: Math.floor((Number(x) || 0) / cellSize),
      z: Math.floor((Number(z) || 0) / cellSize)
    };
  }

  getCollisionCellKey(cellX, cellZ) {
    return `${cellX},${cellZ}`;
  }

  buildAlivePlayersGrid() {
    const grid = new Map();
    const alivePlayers = [];

    for (const [playerId, player] of this.players) {
      if (player.deathTime) {
        continue;
      }

      const coords = this.getCollisionCellCoords(player.position.x, player.position.z);
      const key = this.getCollisionCellKey(coords.x, coords.z);
      let bucket = grid.get(key);
      if (!bucket) {
        bucket = [];
        grid.set(key, bucket);
      }

      bucket.push({ playerId, player });
      alivePlayers.push({ playerId, player });
    }

    return { grid, alivePlayers };
  }

  getNearbyAlivePlayers(position, alivePlayersGrid, fallbackAlivePlayers) {
    const coords = this.getCollisionCellCoords(position.x, position.z);
    const candidates = [];

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const key = this.getCollisionCellKey(coords.x + dx, coords.z + dz);
        const bucket = alivePlayersGrid.get(key);
        if (bucket && bucket.length > 0) {
          candidates.push(...bucket);
        }
      }
    }

    return candidates.length > 0 ? candidates : fallbackAlivePlayers;
  }

  createSnapshotPlayer(player) {
    return {
      id: player.id,
      name: player.name,
      position: {
        x: this.roundSnapshotNumber(player.position.x),
        y: this.roundSnapshotNumber(player.position.y),
        z: this.roundSnapshotNumber(player.position.z)
      },
      rotation: {
        x: this.roundSnapshotNumber(player.rotation.x),
        y: this.roundSnapshotNumber(player.rotation.y),
        z: this.roundSnapshotNumber(player.rotation.z)
      },
      color: player.color,
      health: player.health,
      score: player.score,
      isBot: Boolean(player.isBot),
      botType: player.botType,
      lastUpdate: player.lastUpdate,
      deathTime: player.deathTime,
      lastKillerName: player.lastKillerName,
      lastInputSequence: player.lastInputSequence
    };
  }

  createSnapshotBullet(bullet) {
    return {
      id: bullet.id,
      playerId: bullet.playerId,
      position: {
        x: this.roundSnapshotNumber(bullet.position.x),
        y: this.roundSnapshotNumber(bullet.position.y),
        z: this.roundSnapshotNumber(bullet.position.z)
      },
      direction: {
        x: this.roundSnapshotNumber(bullet.direction.x),
        y: this.roundSnapshotNumber(bullet.direction.y),
        z: this.roundSnapshotNumber(bullet.direction.z)
      },
      speed: bullet.speed,
      age: bullet.age,
      maxAge: bullet.maxAge
    };
  }

  updateBullets() {
    const now = Date.now();
    const nextBullets = [];
    const { grid: alivePlayersGrid, alivePlayers } = this.buildAlivePlayersGrid();

    for (const bullet of this.bullets) {
      bullet.position.x += bullet.direction.x * bullet.speed;
      bullet.position.y += bullet.direction.y * bullet.speed;
      bullet.position.z += bullet.direction.z * bullet.speed;
      bullet.age++;

      if (this.isBulletBlocked(bullet.position)) {
        continue;
      }

      let didHitPlayer = false;
      const candidates = this.getNearbyAlivePlayers(bullet.position, alivePlayersGrid, alivePlayers);
      for (const candidate of candidates) {
        const playerId = candidate.playerId;
        const player = candidate.player;
        if (bullet.playerId !== playerId) {
          const dx = player.position.x - bullet.position.x;
          const dy = player.position.y - bullet.position.y;
          const dz = player.position.z - bullet.position.z;
          const distanceSq = dx * dx + dy * dy + dz * dz;

          if (distanceSq < this.bulletHitDistanceSq) {
            // Hit detected
            player.health -= Number.isFinite(bullet.damage) ? bullet.damage : config.combat.bulletDamage;
            player.lastUpdate = now;
            if (this.verboseRealtimeLogs) {
              console.log(`💥 COLLISION: ${player.name} health now ${player.health}`);
            }
            
            if (player.health <= 0) {
              const kill = this.killPlayer(playerId, bullet.playerId);
              if (kill && this.verboseRealtimeLogs) {
                console.log(`💀 DEATH: ${player.name} died, waiting for respawn window`);
              }
            }
            didHitPlayer = true;
            break;
          }
        }
      }

      if (!didHitPlayer && bullet.age < bullet.maxAge) {
        nextBullets.push(bullet);
      }
    }

    this.bullets = nextBullets;
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

    player.position = this.getValidSpawnPosition();
    player.health = config.player.maxHealth;
    player.deathTime = null;
    player.lastKillerName = null;
    player.lastUpdate = Date.now();
    console.log(`♻️  RESPAWN: ${player.name} respawned at (${player.position.x.toFixed(1)}, ${player.position.z.toFixed(1)})`);
    return true;
  }

  // Check if players should respawn (delay 3 frames after death for death screen animation)
  checkForRespawns() {
    if (!config.respawn || !config.respawn.autoRespawn) {
      return;
    }

    const now = Date.now();
    const respawnDelay = Math.max(0, Number(config.respawn.autoRespawnTime || 0) * 1000);
    
    for (const [playerId, player] of this.players) {
      if (player.deathTime && (now - player.deathTime) >= respawnDelay) {
        // Respawn the player
        player.position = this.getValidSpawnPosition();
        player.health = config.player.maxHealth;
        player.deathTime = null;
        player.lastKillerName = null;
        player.lastUpdate = Date.now();
        console.log(`♻️  RESPAWN: ${player.name} respawned at (${player.position.x.toFixed(1)}, ${player.position.z.toFixed(1)})`);
      }
    }
  }

  getGameState(options = {}) {
    const killsLimit = Number.isFinite(options.killsLimit) ? Math.max(0, options.killsLimit) : null;
    const bulletsLimit = Number.isFinite(options.bulletsLimit)
      ? Math.max(0, options.bulletsLimit)
      : (this.maxBulletsPerState || null);
    const includeWorld = Boolean(options.includeWorld);
    const kills = killsLimit === null ? this.allKills : this.allKills.slice(-killsLimit);
    const allPlayers = Array.from(this.players.values());
    const selectedBullets = bulletsLimit === null ? this.bullets : this.bullets.slice(-bulletsLimit);
    const players = allPlayers.map(player => this.createSnapshotPlayer(player));
    const bullets = selectedBullets.map(bullet => this.createSnapshotBullet(bullet));
    const state = {
      players: players,
      bullets: bullets,
      kills: kills,
      timestamp: Date.now()
    };

    if (includeWorld) {
      state.worldLayout = this.worldLayout;
    }
    
    return state;
  }

  // Kill log rotation handles cleanup
}

module.exports = GameState;
