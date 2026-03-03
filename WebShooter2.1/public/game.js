// Minimal WebShooter 2.1 Game
class MinimalGame {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.ws = null;

    this.playerId = null;
    this.playerName = '';
    this.localPlayer = {
      position: { x: 0, y: 1, z: 0 },
      rotation: { x: 0, y: 0 },
      health: 100
    };

    this.remotePlayers = new Map();
    this.remoteMeshes = new Map();
    this.bullets = new Map();

    // Network & input tracking
    this.nextInputSequence = 1;
    this.pendingInputs = [];
    this.lastSentPosition = { x: 0, y: 1, z: 0 };
    this.lastSentRotation = { x: 0, y: 0 };

    // Input
    this.keys = {};
    this.lastShootTime = 0;

    // Movement
    this.lastUpdateTime = Date.now();
    this.moveSpeed = 50;
    this.layoutConfig = window.WEBSHOOTER_LAYOUT || {};
    this.gridCoreHalfSize = Number.isFinite(this.layoutConfig.arenaHalfSize)
      ? this.layoutConfig.arenaHalfSize
      : 420;
    this.wallGapSize = 2;
    this.wallThickness = 2;
    this.wallHalfSize = this.gridCoreHalfSize + this.wallGapSize + (this.wallThickness / 2);
    this.gridOuterHalfSize = this.wallHalfSize - (this.wallThickness / 2);
    this.playerCollisionRadius = 0.6;
    this.buildingLayout = [];
    this.coverWallLayout = [];
    this.blockingMeshes = [];
    this.impactRipples = [];
    this.bulletImpactsSeen = new Set();
    this.minimapCanvas = null;
    this.minimapCtx = null;

    this.init();
  }

  init() {
    this.setupThreeJS();
    this.setupNetwork();
    this.setupInput();
    this.setupMiniMap();
    this.gameLoop();
  }

  setupThreeJS() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a15);
    this.scene.fog = new THREE.Fog(0x0a0a15, this.gridCoreHalfSize * 1.2, this.gridCoreHalfSize * 2.5);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      this.gridCoreHalfSize * 4
    );
    this.camera.position.set(0, 1.6, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    document.getElementById('gameContainer').appendChild(this.renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
    directionalLight.position.set(50, 50, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(directionalLight);

    // Portal lights
    const portalLightBlue = new THREE.PointLight(0x00D9FF, 0.5);
    portalLightBlue.position.set(50, 20, 50);
    this.scene.add(portalLightBlue);

    const portalLightOrange = new THREE.PointLight(0xFF6600, 0.3);
    portalLightOrange.position.set(-50, 20, -50);
    this.scene.add(portalLightOrange);

    // Ground with grid texture
    const groundSize = this.gridOuterHalfSize * 2;
    const groundCanvas = this.createGridTexture(
      groundSize,
      10,
      '#00D9FF',
      '#1a2a3a',
      0.3,
      this.gridCoreHalfSize
    );
    const groundTexture = new THREE.CanvasTexture(groundCanvas);
    groundTexture.magFilter = THREE.NearestFilter;
    groundTexture.minFilter = THREE.NearestFilter;

    const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
    const groundMaterial = new THREE.MeshLambertMaterial({ map: groundTexture, side: THREE.DoubleSide });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Create arena elements
    this.createGridOverlay();
    this.createWalls();
    this.createCoverWalls();
    this.createBuildings();

    window.addEventListener('resize', () => this.onWindowResize());
  }

  createGridTexture(size, gridSize, gridColor, bgColor, opacity, coreHalfSize = size / 2) {
    const canvas = document.createElement('canvas');
    canvas.width = 2000;
    canvas.height = 2000;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid lines at proper world-space intervals
    // World space: -size/2 to +size/2
    // Canvas space: 0 to canvas.width
    const pixelsPerUnit = canvas.width / size;
    const halfSize = size / 2;
    
    // Calculate starting world coordinate (snap to grid)
    let startWorld = Math.ceil((-halfSize) / gridSize) * gridSize;
    
      // Draw main grid lines (solid + transparent design)
      ctx.globalAlpha = opacity;
      ctx.lineWidth = 5;
      ctx.strokeStyle = gridColor;
    
    for (let worldCoord = startWorld; worldCoord <= halfSize; worldCoord += gridSize) {
      // Convert world coordinate to canvas coordinate
      const canvasPos = ((worldCoord + halfSize) / size) * canvas.width + 0.5;
      
      // Vertical line
      ctx.beginPath();
      ctx.moveTo(canvasPos, 0);
      ctx.lineTo(canvasPos, canvas.height);
      ctx.stroke();
      
      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, canvasPos);
      ctx.lineTo(canvas.width, canvasPos);
      ctx.stroke();
    }
    
      // Draw semi-transparent offset lines for design effect
      ctx.globalAlpha = opacity * 0.3;
      ctx.lineWidth = 5;
    
      for (let worldCoord = startWorld; worldCoord <= halfSize; worldCoord += gridSize) {
        const canvasPos = ((worldCoord + halfSize) / size) * canvas.width + 0.5;
      
        // Vertical line
        ctx.beginPath();
        ctx.moveTo(canvasPos, 0);
        ctx.lineTo(canvasPos, canvas.height);
        ctx.stroke();
      
        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(0, canvasPos);
        ctx.lineTo(canvas.width, canvasPos);
        ctx.stroke();
      }
    
      // Draw origin lines (X=0 and Z=0) in green
      const originPos = (halfSize / size) * canvas.width + 0.5;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#7df17d'; // Bright green
    
      // X=0 line (vertical)
      ctx.beginPath();
      ctx.moveTo(originPos, 0);
      ctx.lineTo(originPos, canvas.height);
      ctx.stroke();
    
      // Z=0 line (horizontal)
      ctx.beginPath();
      ctx.moveTo(0, originPos);
      ctx.lineTo(canvas.width, originPos);
      ctx.stroke();
    
      // Draw semi-transparent green offset lines for design effect
      ctx.globalAlpha = 0.8 * 0.3;
      ctx.lineWidth = 5;
    
      // X=0 line (vertical) - offset
      ctx.beginPath();
      ctx.moveTo(originPos, 0);
      ctx.lineTo(originPos, canvas.height);
      ctx.stroke();
    
      // Z=0 line (horizontal) - offset
      ctx.beginPath();
      ctx.moveTo(0, originPos);
      ctx.lineTo(canvas.width, originPos);
      ctx.stroke();

    const outerHalfSize = size / 2;
    const scale = canvas.width / size;
    const edgeStartPx = (outerHalfSize - coreHalfSize) * scale;
    const edgeEndPx = (outerHalfSize + coreHalfSize) * scale;

    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#1B3A52';
    ctx.fillRect(0, 0, canvas.width, edgeStartPx);
    ctx.fillRect(0, edgeEndPx, canvas.width, canvas.height - edgeEndPx);
    ctx.fillRect(0, edgeStartPx, edgeStartPx, edgeEndPx - edgeStartPx);
    ctx.fillRect(edgeEndPx, edgeStartPx, canvas.width - edgeEndPx, edgeEndPx - edgeStartPx);

    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = '#FF8800';
    ctx.lineWidth = 3;
    ctx.strokeRect(edgeStartPx, edgeStartPx, edgeEndPx - edgeStartPx, edgeEndPx - edgeStartPx);

    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#00B8E8';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
    ctx.restore();

    return canvas;
  }

  createGridOverlay() {
    const step = 20;
    const range = this.gridOuterHalfSize;
    const coreRange = this.gridCoreHalfSize;
    
    for (let i = -range; i <= range; i += step) {
      const lineGeomZ = new THREE.BufferGeometry();
      lineGeomZ.setAttribute('position', new THREE.BufferAttribute(
        new Float32Array([-range, 0.01, i, range, 0.01, i]), 3
      ));
      const isOuterBand = Math.abs(i) > coreRange;
      const lineMaterialZ = new THREE.LineBasicMaterial({
        color: isOuterBand ? (i % 40 === 0 ? 0x00B8E8 : 0x1D4A63) : (i % 40 === 0 ? 0x00D9FF : 0x004466),
        transparent: true,
        opacity: isOuterBand ? (i % 40 === 0 ? 0.5 : 0.25) : (i % 40 === 0 ? 0.6 : 0.2)
      });
      this.scene.add(new THREE.Line(lineGeomZ, lineMaterialZ));

      const lineGeomX = new THREE.BufferGeometry();
      lineGeomX.setAttribute('position', new THREE.BufferAttribute(
        new Float32Array([i, 0.01, -range, i, 0.01, range]), 3
      ));
      const lineMaterialX = new THREE.LineBasicMaterial({
        color: isOuterBand ? (i % 40 === 0 ? 0x00B8E8 : 0x1D4A63) : (i % 40 === 0 ? 0x00D9FF : 0x004466),
        transparent: true,
        opacity: isOuterBand ? (i % 40 === 0 ? 0.5 : 0.25) : (i % 40 === 0 ? 0.6 : 0.2)
      });
      this.scene.add(new THREE.Line(lineGeomX, lineMaterialX));

      if (i % 40 === 0 && i !== 0 && Math.abs(i) <= coreRange) {
        this.createGridNumber(i, i);
        this.createGridNumber(-i, -i);
      }
    }

    // Origin crosshair lines (X=0 and Z=0) - rendered as thin planes for visibility
    const originMaterial = new THREE.MeshBasicMaterial({
      color: 0x7df17d,
      emissive: 0x7df17d,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    });

    // Z=0 line (runs along X axis)
    const zeroZGeometry = new THREE.PlaneGeometry(range * 2, 0.4);
    const zeroZMesh = new THREE.Mesh(zeroZGeometry, originMaterial);
    zeroZMesh.position.set(0, 0.02, 0);
    zeroZMesh.rotation.x = -Math.PI / 2;
    this.scene.add(zeroZMesh);

    // X=0 line (runs along Z axis)
    const zeroXGeometry = new THREE.PlaneGeometry(0.4, range * 2);
    const zeroXMesh = new THREE.Mesh(zeroXGeometry, originMaterial);
    zeroXMesh.position.set(0, 0.02, 0);
    zeroXMesh.rotation.x = -Math.PI / 2;
    this.scene.add(zeroXMesh);

    const addBorder = (halfSize, color, opacity) => {
      const borderSegments = [
        [-halfSize, 0.02, -halfSize, halfSize, 0.02, -halfSize],
        [-halfSize, 0.02, halfSize, halfSize, 0.02, halfSize],
        [-halfSize, 0.02, -halfSize, -halfSize, 0.02, halfSize],
        [halfSize, 0.02, -halfSize, halfSize, 0.02, halfSize]
      ];

      borderSegments.forEach((points) => {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
        const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
        this.scene.add(new THREE.Line(geom, mat));
      });
    };

    addBorder(coreRange, 0xFF8800, 0.9);
    addBorder(range, 0x00B8E8, 0.75);
  }

  createGridNumber(x, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0, 217, 255, 0.3)';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.abs(x).toString(), 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    const geometry = new THREE.PlaneGeometry(3, 3);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, 0.1, z);
    mesh.rotation.x = -Math.PI / 2;
    this.scene.add(mesh);
  }

  createWalls() {
    const wallHeight = 60;
    const wallThickness = this.wallThickness;
    const arenaSize = this.wallHalfSize;
    const wallLength = (this.gridOuterHalfSize * 2) + this.wallThickness;

    const wallMaterial = new THREE.MeshPhongMaterial({
      color: 0x1a3a4a,
      emissive: 0x004466,
      transparent: false,
      side: THREE.DoubleSide
    });

    const wallConfigs = [
      { pos: [0, 0, -arenaSize], rot: [0, 0, 0] },
      { pos: [0, 0, arenaSize], rot: [0, 0, 0] },
      { pos: [-arenaSize, 0, 0], rot: [0, Math.PI / 2, 0] },
      { pos: [arenaSize, 0, 0], rot: [0, Math.PI / 2, 0] }
    ];

    wallConfigs.forEach((config) => {
      const wallGeometry = new THREE.BoxGeometry(wallLength, wallHeight, wallThickness);
      const wall = new THREE.Mesh(wallGeometry, wallMaterial);
      wall.position.set(...config.pos);
      wall.rotation.set(...config.rot);
      wall.position.y = wallHeight / 2;
      wall.castShadow = true;
      wall.receiveShadow = true;
      wall.userData.blocksBullets = true;
      this.scene.add(wall);
      this.blockingMeshes.push(wall);
    });
  }

  createCoverWalls() {
    const coverMaterial = new THREE.MeshPhongMaterial({
      color: 0x183446,
      emissive: 0x0a2434,
      transparent: false
    });

    this.coverWallLayout = Array.isArray(this.layoutConfig.coverWalls)
      ? this.layoutConfig.coverWalls
      : this.getDefaultCoverWalls();

    this.coverWallLayout.forEach((spec) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(spec.width, spec.height, spec.depth),
        coverMaterial
      );
      mesh.position.set(spec.x, spec.height / 2, spec.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.blocksBullets = true;
      this.scene.add(mesh);
      this.blockingMeshes.push(mesh);
    });
  }

  getDefaultCoverWalls() {
    return [
      { x: -180, z: 0, width: 12, depth: 200, height: 14 },
      { x: 180, z: 0, width: 12, depth: 200, height: 14 },
      { x: 0, z: -180, width: 200, depth: 12, height: 14 },
      { x: 0, z: 180, width: 200, depth: 12, height: 14 },
      { x: -90, z: -90, width: 80, depth: 10, height: 10 },
      { x: 90, z: -90, width: 80, depth: 10, height: 10 },
      { x: -90, z: 90, width: 80, depth: 10, height: 10 },
      { x: 90, z: 90, width: 80, depth: 10, height: 10 }
    ];
  }

  getDefaultBuildings() {
    return [
      { x: -280, z: -270, width: 96, depth: 76, height: 10.6, doorSide: 'east', windowCount: 2 },
      { x: 280, z: -270, width: 96, depth: 76, height: 10.6, doorSide: 'west', windowCount: 2 },
      { x: -280, z: 270, width: 96, depth: 76, height: 10.6, doorSide: 'east', windowCount: 2 },
      { x: 280, z: 270, width: 96, depth: 76, height: 10.6, doorSide: 'west', windowCount: 2 },
      { x: -130, z: -280, width: 88, depth: 72, height: 10.2, doorSide: 'south', windowCount: 3 },
      { x: 130, z: -280, width: 88, depth: 72, height: 10.2, doorSide: 'south', windowCount: 3 },
      { x: -130, z: 280, width: 88, depth: 72, height: 10.2, doorSide: 'north', windowCount: 3 },
      { x: 130, z: 280, width: 88, depth: 72, height: 10.2, doorSide: 'north', windowCount: 3 },
      { x: -280, z: -130, width: 72, depth: 88, height: 10, doorSide: 'east', windowCount: 2 },
      { x: -280, z: 130, width: 72, depth: 88, height: 10, doorSide: 'east', windowCount: 2 },
      { x: 280, z: -130, width: 72, depth: 88, height: 10, doorSide: 'west', windowCount: 2 },
      { x: 280, z: 130, width: 72, depth: 88, height: 10, doorSide: 'west', windowCount: 2 }
    ];
  }

  getOpeningsForSide(building, side, length, doorWidth, doorHeight, windowWidth, windowBottom, windowHeight) {
    const configuredDoorSides = Array.isArray(building.doorSides)
      ? building.doorSides
      : [building.doorSide || 'south'];
    const explicitWindowOffsets = building.windowOffsetsBySide?.[side];
    const explicitDoorOffsets = building.doorOffsetsBySide?.[side];

    if (Array.isArray(explicitWindowOffsets) || Array.isArray(explicitDoorOffsets)) {
      const halfLength = length / 2;
      const clampedDoorOffsets = Array.isArray(explicitDoorOffsets)
        ? explicitDoorOffsets
            .map((offset) => Math.max(-halfLength + doorWidth / 2, Math.min(halfLength - doorWidth / 2, offset)))
        : [];

      const openings = clampedDoorOffsets.map((centerOffset) => ({
        centerOffset,
        width: doorWidth,
        bottom: 0,
        height: doorHeight,
        type: 'door'
      }));

      const clampedWindowOffsets = Array.isArray(explicitWindowOffsets)
        ? explicitWindowOffsets
            .map((offset) => Math.max(-halfLength + windowWidth / 2, Math.min(halfLength - windowWidth / 2, offset)))
        : [];

      const doorRanges = clampedDoorOffsets.map((offset) => ({
        start: offset - doorWidth / 2 - 1,
        end: offset + doorWidth / 2 + 1
      }));

      clampedWindowOffsets.forEach((centerOffset) => {
        const windowStart = centerOffset - windowWidth / 2;
        const windowEnd = centerOffset + windowWidth / 2;
        const overlapsDoor = doorRanges.some((range) => windowStart < range.end && windowEnd > range.start);
        if (!overlapsDoor) {
          openings.push({
            centerOffset,
            width: windowWidth,
            bottom: windowBottom,
            height: windowHeight,
            type: 'window'
          });
        }
      });

      return openings;
    }

    const hasDoor = configuredDoorSides.includes(side);

    const desiredCount = Math.max(
      1,
      Number.isFinite(building.windowCountBySide?.[side])
        ? building.windowCountBySide[side]
        : (Number.isFinite(building.windowCount)
          ? building.windowCount
          : (Number.isFinite(this.layoutConfig.defaultWindowCount) ? this.layoutConfig.defaultWindowCount : 2))
    );

    const reservedForDoor = hasDoor ? (doorWidth + 6) : 0;
    const maxWindowSpan = Math.max(8, length - 8 - reservedForDoor);
    const maxCount = Math.max(1, Math.floor(maxWindowSpan / Math.max(windowWidth + 4, 1)));
    const count = Math.min(desiredCount, maxCount);

    const candidateCount = hasDoor ? count + 6 : count;
    const step = length / (candidateCount + 1);
    const doorStart = -doorWidth / 2 - 1;
    const doorEnd = doorWidth / 2 + 1;
    const openings = [];

    for (let index = 0; index < candidateCount && openings.length < count; index++) {
      const centerOffset = -length / 2 + step * (index + 1);

      if (hasDoor) {
        const windowStart = centerOffset - windowWidth / 2;
        const windowEnd = centerOffset + windowWidth / 2;
        const overlapsDoor = windowStart < doorEnd && windowEnd > doorStart;
        if (overlapsDoor) continue;
      }

      openings.push({
        centerOffset,
        width: windowWidth,
        bottom: windowBottom,
        height: windowHeight,
        type: 'window'
      });
    }

    if (hasDoor) {
      openings.push({ centerOffset: 0, width: doorWidth, bottom: 0, height: doorHeight, type: 'door' });
    }

    return openings;
  }

  addWallWithOpenings(center, horizontal, length, thickness, height, openings, material, baseY = 0) {
    const halfLength = length / 2;

    const createSegment = (startOffset, endOffset, bottom, segmentHeight) => {
      const segmentLen = endOffset - startOffset;
      if (segmentLen <= 0 || segmentHeight <= 0) return;

      const geometry = horizontal
        ? new THREE.BoxGeometry(segmentLen, segmentHeight, thickness)
        : new THREE.BoxGeometry(thickness, segmentHeight, segmentLen);
      const mesh = new THREE.Mesh(geometry, material);
      const centerOffset = (startOffset + endOffset) / 2;

      if (horizontal) {
        mesh.position.set(center.x + centerOffset, baseY + bottom + segmentHeight / 2, center.z);
      } else {
        mesh.position.set(center.x, baseY + bottom + segmentHeight / 2, center.z + centerOffset);
      }

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.blocksBullets = true;
      this.scene.add(mesh);
      this.blockingMeshes.push(mesh);
    };

    const sortedOpenings = [...openings]
      .map((opening) => {
        const start = Math.max(-halfLength, opening.centerOffset - opening.width / 2);
        const end = Math.min(halfLength, opening.centerOffset + opening.width / 2);
        return { ...opening, start, end };
      })
      .sort((a, b) => a.start - b.start);

    let cursor = -halfLength;
    sortedOpenings.forEach((opening) => {
      createSegment(cursor, opening.start, 0, height);
      createSegment(opening.start, opening.end, 0, opening.bottom);
      const topHeight = height - (opening.bottom + opening.height);
      createSegment(opening.start, opening.end, opening.bottom + opening.height, topHeight);
      cursor = Math.max(cursor, opening.end);
    });
    createSegment(cursor, halfLength, 0, height);
  }

  createBuilding(config) {
    const {
      x,
      z,
      width,
      depth,
      height,
      doorSide = 'south'
    } = config;

    const normalizedDoorSides = Array.isArray(config.doorSides) && config.doorSides.length
      ? config.doorSides
      : [doorSide];

    const building = { ...config, doorSide, doorSides: normalizedDoorSides };

    const wallMaterial = new THREE.MeshPhongMaterial({
      color: 0x1f3444,
      emissive: 0x0c2230,
      shininess: 40,
      transparent: false
    });

    const roofMaterial = new THREE.MeshPhongMaterial({
      color: 0x2a4c62,
      emissive: 0x103246,
      shininess: 50
    });

    const wallThickness = 1.6;
    const doorWidth = 10;
    const doorHeight = 7;
    const windowWidth = 14;
    const windowBottom = 1.2;
    const windowHeight = 4.2;
    const baseY = -0.3;

    const columnMaterial = new THREE.MeshPhongMaterial({
      color: 0x25455a,
      emissive: 0x112a39,
      shininess: 35,
      transparent: false
    });

    const halfW = width / 2;
    const halfD = depth / 2;
    const columnSize = wallThickness + 0.5;
    const columnY = baseY + (height / 2);
    const columnPositions = [
      { x: x - halfW, z: z - halfD },
      { x: x + halfW, z: z - halfD },
      { x: x - halfW, z: z + halfD },
      { x: x + halfW, z: z + halfD }
    ];

    columnPositions.forEach((pos) => {
      const column = new THREE.Mesh(
        new THREE.BoxGeometry(columnSize, height, columnSize),
        columnMaterial
      );
      column.position.set(pos.x, columnY, pos.z);
      column.castShadow = true;
      column.receiveShadow = true;
      column.userData.blocksBullets = true;
      this.scene.add(column);
      this.blockingMeshes.push(column);
    });

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.6, 0.6, depth + 0.6),
      roofMaterial
    );
    roof.position.set(x, baseY + height + 0.3, z);
    roof.castShadow = true;
    roof.receiveShadow = true;
    roof.userData.blocksBullets = true;
    this.scene.add(roof);
    this.blockingMeshes.push(roof);

    const sides = [
      { side: 'north', center: { x, z: z - depth / 2 }, horizontal: true, length: width },
      { side: 'south', center: { x, z: z + depth / 2 }, horizontal: true, length: width },
      { side: 'west', center: { x: x - width / 2, z }, horizontal: false, length: depth },
      { side: 'east', center: { x: x + width / 2, z }, horizontal: false, length: depth }
    ];

    sides.forEach(({ side, center, horizontal, length }) => {
      const openings = this.getOpeningsForSide(
        building,
        side,
        length,
        doorWidth,
        doorHeight,
        windowWidth,
        windowBottom,
        windowHeight
      );
      this.addWallWithOpenings(
        center,
        horizontal,
        length,
        wallThickness,
        height,
        openings,
        wallMaterial,
        baseY
      );
    });
  }

  createBuildings() {
    this.buildingLayout = Array.isArray(this.layoutConfig.buildings)
      ? this.layoutConfig.buildings
      : this.getDefaultBuildings();

    this.buildingLayout.forEach((building) => this.createBuilding(building));
  }

  setupMiniMap() {
    this.minimapCanvas = document.getElementById('miniMap');
    if (!this.minimapCanvas) return;
    this.minimapCtx = this.minimapCanvas.getContext('2d');
  }

  worldToMiniMap(x, z, size) {
    const range = this.gridCoreHalfSize;
    const mapX = ((x + range) / (range * 2)) * size;
    const mapY = ((range - z) / (range * 2)) * size;
    return { x: mapX, y: mapY };
  }

  drawMiniMap() {
    if (!this.minimapCtx || !this.minimapCanvas) return;

    const ctx = this.minimapCtx;
    const size = this.minimapCanvas.width;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(5, 20, 32, 0.88)';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(0, 184, 232, 0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);

    ctx.strokeStyle = 'rgba(0, 217, 255, 0.2)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const p = (size / 6) * i;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255, 136, 0, 0.9)';
    this.buildingLayout.forEach((building) => {
      const topLeft = this.worldToMiniMap(building.x - building.width / 2, building.z + building.depth / 2, size);
      const bottomRight = this.worldToMiniMap(building.x + building.width / 2, building.z - building.depth / 2, size);
      ctx.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    });

    ctx.fillStyle = 'rgba(0, 200, 255, 0.75)';
    this.coverWallLayout.forEach((wall) => {
      const topLeft = this.worldToMiniMap(wall.x - wall.width / 2, wall.z + wall.depth / 2, size);
      const bottomRight = this.worldToMiniMap(wall.x + wall.width / 2, wall.z - wall.depth / 2, size);
      ctx.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    });

    const openingCenterWorld = (building, side, centerOffset) => {
      if (side === 'north') return { x: building.x + centerOffset, z: building.z - building.depth / 2 };
      if (side === 'south') return { x: building.x + centerOffset, z: building.z + building.depth / 2 };
      if (side === 'west') return { x: building.x - building.width / 2, z: building.z + centerOffset };
      return { x: building.x + building.width / 2, z: building.z + centerOffset };
    };

    const drawOpeningMarker = (building, side, opening) => {
      const center = openingCenterWorld(building, side, opening.centerOffset);
      const markerHalf = opening.type === 'door' ? 10 : 7;
      let a;
      let b;
      if (side === 'north' || side === 'south') {
        a = this.worldToMiniMap(center.x - markerHalf, center.z, size);
        b = this.worldToMiniMap(center.x + markerHalf, center.z, size);
      } else {
        a = this.worldToMiniMap(center.x, center.z - markerHalf, size);
        b = this.worldToMiniMap(center.x, center.z + markerHalf, size);
      }
      ctx.strokeStyle = opening.type === 'door' ? '#00FF88' : '#7dd3ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };

    this.buildingLayout.forEach((building) => {
      const doorWidth = 10;
      const doorHeight = 7;
      const windowWidth = 14;
      const windowBottom = 1.2;
      const windowHeight = 4.2;
      const sideMeta = [
        { side: 'north', length: building.width },
        { side: 'south', length: building.width },
        { side: 'west', length: building.depth },
        { side: 'east', length: building.depth }
      ];

      sideMeta.forEach(({ side, length }) => {
        const openings = this.getOpeningsForSide(
          building,
          side,
          length,
          doorWidth,
          doorHeight,
          windowWidth,
          windowBottom,
          windowHeight
        );
        openings.forEach((opening) => drawOpeningMarker(building, side, opening));
      });
    });

    // Draw bullets
    const playerHeight = 2.2; // Approximate player model height
    for (const [bulletId, bulletMesh] of this.bullets) {
      const bulletPt = this.worldToMiniMap(bulletMesh.position.x, bulletMesh.position.z, size);
      // Gray out bullets above player height
      if (bulletMesh.position.y > playerHeight) {
        ctx.fillStyle = 'rgba(100, 100, 100, 0.5)';
      } else {
        ctx.fillStyle = '#00D9FF';
      }
      ctx.beginPath();
      ctx.arc(bulletPt.x, bulletPt.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const remotePlayer of this.remotePlayers.values()) {
      const pt = this.worldToMiniMap(remotePlayer.position.x, remotePlayer.position.z, size);
      
      // Draw direction triangle for remote players
      const dirLen = 8;
      const angle = remotePlayer.rotation.y;
      const tipX = pt.x - Math.sin(angle) * dirLen;
      const tipY = pt.y + Math.cos(angle) * dirLen;
      const baseWidth = 3;
      const baseAngle1 = angle - Math.PI / 2;
      const baseAngle2 = angle + Math.PI / 2;
      const base1X = pt.x - Math.sin(baseAngle1) * baseWidth;
      const base1Y = pt.y + Math.cos(baseAngle1) * baseWidth;
      const base2X = pt.x - Math.sin(baseAngle2) * baseWidth;
      const base2Y = pt.y + Math.cos(baseAngle2) * baseWidth;
      
      ctx.fillStyle = '#FF6600';
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(base1X, base1Y);
      ctx.lineTo(base2X, base2Y);
      ctx.closePath();
      ctx.fill();
    }

    const localPt = this.worldToMiniMap(this.localPlayer.position.x, this.localPlayer.position.z, size);
    
    // Draw direction triangle
    const dirLen = 9;
    const angle = this.localPlayer.rotation.y;
    const tipX = localPt.x - Math.sin(angle) * dirLen;
    const tipY = localPt.y + Math.cos(angle) * dirLen;
    const baseWidth = 3.5;
    const baseAngle1 = angle - Math.PI / 2;
    const baseAngle2 = angle + Math.PI / 2;
    const base1X = localPt.x - Math.sin(baseAngle1) * baseWidth;
    const base1Y = localPt.y + Math.cos(baseAngle1) * baseWidth;
    const base2X = localPt.x - Math.sin(baseAngle2) * baseWidth;
    const base2Y = localPt.y + Math.cos(baseAngle2) * baseWidth;
    
    ctx.fillStyle = '#00FF88';
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(base1X, base1Y);
    ctx.lineTo(base2X, base2Y);
    ctx.closePath();
    ctx.fill();
  }

  setupNetwork() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('Connected to server');
      this.ws.send(JSON.stringify({ type: 'join' }));
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Parse error:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('Disconnected from server');
    };
  }

  handleMessage(message) {
    if (message.type === 'hello') {
      // Connection established
    } else if (message.type === 'joinResponse') {
      this.playerId = message.playerId;
      this.playerName = message.playerName;
      console.log(`Joined as ${this.playerName}`);
    } else if (message.type === 'gameState') {
      const state = message.state;

      // Update remote players
      const remoteIds = new Set();
      for (const player of state.players) {
        if (player.id === this.playerId) {
          this.reconcileLocalPlayer(player);
        } else {
          remoteIds.add(player.id);
          this.updateRemotePlayer(player);
        }
      }

      // Remove disconnected players
      for (const [id] of this.remotePlayers) {
        if (!remoteIds.has(id)) {
          this.removeRemotePlayer(id);
        }
      }

      // Update bullets
      this.updateBullets(state.bullets);
    }
  }

  reconcileLocalPlayer(serverPlayer) {
    if (!serverPlayer) return;

    const acknowledgedSequence = Number.isFinite(serverPlayer.lastInputSequence)
      ? serverPlayer.lastInputSequence
      : null;

    let acknowledgedInput = null;
    if (acknowledgedSequence !== null && this.pendingInputs.length > 0) {
      for (const pending of this.pendingInputs) {
        if (pending.sequence === acknowledgedSequence) {
          acknowledgedInput = pending;
          break;
        }
      }
      this.pendingInputs = this.pendingInputs.filter(
        (p) => p.sequence > acknowledgedSequence
      );
    }

    let targetPos = { ...this.localPlayer.position };
    let targetRot = { ...this.localPlayer.rotation };

    if (acknowledgedInput) {
      targetPos.x += serverPlayer.position.x - acknowledgedInput.position.x;
      targetPos.y += serverPlayer.position.y - acknowledgedInput.position.y;
      targetPos.z += serverPlayer.position.z - acknowledgedInput.position.z;
      targetRot.x += serverPlayer.rotation.x - acknowledgedInput.rotation.x;
      targetRot.y += serverPlayer.rotation.y - acknowledgedInput.rotation.y;
    } else {
      targetPos = { ...serverPlayer.position };
      targetRot = { ...serverPlayer.rotation };
    }

    const dx = targetPos.x - this.localPlayer.position.x;
    const dy = targetPos.y - this.localPlayer.position.y;
    const dz = targetPos.z - this.localPlayer.position.z;
    const distError = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distError > 8) {
      this.localPlayer.position = targetPos;
    } else if (distError > 0.02) {
      const alpha = 0.35;
      this.localPlayer.position.x += dx * alpha;
      this.localPlayer.position.y += dy * alpha;
      this.localPlayer.position.z += dz * alpha;
    }

    const rotAlpha = 0.35;
    this.localPlayer.rotation.x += (targetRot.x - this.localPlayer.rotation.x) * rotAlpha;
    this.localPlayer.rotation.y += (targetRot.y - this.localPlayer.rotation.y) * rotAlpha;

    this.localPlayer.health = serverPlayer.health;
  }

  updateRemotePlayer(serverPlayer) {
    if (!this.remotePlayers.has(serverPlayer.id)) {
      if (serverPlayer.health <= 0) return;

      const geometry = new THREE.ConeGeometry(0.8, 2.5, 8);
      const material = new THREE.MeshPhongMaterial({ color: 0xFF6600, emissive: 0xFF3300, shininess: 100 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      this.remotePlayers.set(serverPlayer.id, {
        position: { ...serverPlayer.position },
        rotation: { ...serverPlayer.rotation },
        health: serverPlayer.health
      });
      this.remoteMeshes.set(serverPlayer.id, mesh);
    }

    const player = this.remotePlayers.get(serverPlayer.id);
    if (!player) return;

    player.position = { ...serverPlayer.position };
    player.rotation = { ...serverPlayer.rotation };
    player.health = serverPlayer.health;

    const mesh = this.remoteMeshes.get(serverPlayer.id);
    if (mesh) {
      mesh.position.set(
        serverPlayer.position.x,
        serverPlayer.position.y + 0.6,
        serverPlayer.position.z
      );
      
      // Apply rotation so cone tip points where player is looking
      mesh.rotation.order = 'YXZ';
      mesh.rotation.y = serverPlayer.rotation.y;
      mesh.rotation.x = serverPlayer.rotation.x - Math.PI / 2;
      mesh.rotation.z = 0;
    }

    if (serverPlayer.health <= 0) {
      this.removeRemotePlayer(serverPlayer.id);
    }
  }

  removeRemotePlayer(playerId) {
    const mesh = this.remoteMeshes.get(playerId);
    if (mesh) {
      this.scene.remove(mesh);
    }
    this.remotePlayers.delete(playerId);
    this.remoteMeshes.delete(playerId);
  }

  updateBullets(serverBullets) {
    const serverIds = new Set();
    for (const bullet of serverBullets) {
      serverIds.add(bullet.id);
      if (!this.bullets.has(bullet.id)) {
        const geometry = new THREE.SphereGeometry(0.15, 8, 8);
        const material = new THREE.MeshPhongMaterial({
          color: 0x00D9FF,
          emissive: 0x00D9FF
        });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.castShadow = true;
        sphere.position.set(bullet.position.x, bullet.position.y, bullet.position.z);
        this.scene.add(sphere);
        this.bullets.set(bullet.id, sphere);

        if (bullet.state === 'hit' && bullet.impactPosition) {
          sphere.position.set(bullet.impactPosition.x, bullet.impactPosition.y, bullet.impactPosition.z);
          if (!this.bulletImpactsSeen.has(bullet.id)) {
            this.spawnImpactRippleAtData(bullet.impactPosition, bullet.impactNormal);
            this.bulletImpactsSeen.add(bullet.id);
          }
        }
        continue;
      }

      const mesh = this.bullets.get(bullet.id);
      if (mesh) {
        if (bullet.state === 'hit' && bullet.impactPosition) {
          mesh.position.set(bullet.impactPosition.x, bullet.impactPosition.y, bullet.impactPosition.z);
          if (!this.bulletImpactsSeen.has(bullet.id)) {
            this.spawnImpactRippleAtData(bullet.impactPosition, bullet.impactNormal);
            this.bulletImpactsSeen.add(bullet.id);
          }
        } else {
          mesh.position.set(bullet.position.x, bullet.position.y, bullet.position.z);
        }
      }
    }

    for (const [id] of this.bullets) {
      if (!serverIds.has(id)) {
        const mesh = this.bullets.get(id);
        if (mesh) this.scene.remove(mesh);
        this.bullets.delete(id);
        this.bulletImpactsSeen.delete(id);
      }
    }
  }

  spawnImpactRippleAtData(impactPosition, impactNormal) {
    if (!impactPosition) return;

    const rippleMaterial = new THREE.MeshBasicMaterial({
      color: 0x00d9ff,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ripple = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.36, 28), rippleMaterial);
    ripple.position.set(impactPosition.x, impactPosition.y, impactPosition.z);

    const normal = impactNormal
      ? new THREE.Vector3(impactNormal.x, impactNormal.y, impactNormal.z)
      : new THREE.Vector3(0, 1, 0);
    if (normal.lengthSq() < 0.0001) normal.set(0, 1, 0);
    normal.normalize();
    ripple.lookAt(ripple.position.clone().add(normal));
    ripple.position.add(normal.multiplyScalar(0.03));

    this.scene.add(ripple);
    this.impactRipples.push({
      mesh: ripple,
      material: rippleMaterial,
      bornAt: performance.now(),
      lifetimeMs: 420
    });
  }

  setupInput() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === document.body) {
        this.localPlayer.rotation.y -= e.movementX * 0.003;
        this.localPlayer.rotation.x -= e.movementY * 0.003;
        this.localPlayer.rotation.x = Math.max(
          -Math.PI / 2,
          Math.min(Math.PI / 2, this.localPlayer.rotation.x)
        );
      }
    });

    document.addEventListener('click', () => {
      document.body.requestPointerLock?.();
    });

    document.addEventListener('mousedown', () => {
      this.isShooting = true;
    });

    document.addEventListener('mouseup', () => {
      this.isShooting = false;
    });

    // Teleport button
    const teleportBtn = document.getElementById('teleportBtn');
    const teleportXInput = document.getElementById('teleportX');
    const teleportZInput = document.getElementById('teleportZ');

    const teleport = () => {
      const x = parseFloat(teleportXInput.value);
      const z = parseFloat(teleportZInput.value);

      if (Number.isFinite(x) && Number.isFinite(z)) {
        const clampLimit = this.gridCoreHalfSize;
        this.localPlayer.position.x = Math.max(-clampLimit, Math.min(clampLimit, x));
        this.localPlayer.position.z = Math.max(-clampLimit, Math.min(clampLimit, z));
      }
    };

    teleportXInput.min = String(-this.gridCoreHalfSize);
    teleportXInput.max = String(this.gridCoreHalfSize);
    teleportZInput.min = String(-this.gridCoreHalfSize);
    teleportZInput.max = String(this.gridCoreHalfSize);

    teleportBtn.addEventListener('click', teleport);

    // Allow Enter key to teleport
    [teleportXInput, teleportZInput].forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          teleport();
        }
      });
    });

    // Press "1" to teleport
    document.addEventListener('keydown', (e) => {
      if (e.key === '1') {
        teleport();
      }
    });
  }

  update() {
    const now = Date.now();
    const deltaTime = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;
    this.updateImpactRipples(performance.now());

    // Movement
    const direction = new THREE.Vector3();
    if (this.keys['w']) direction.z += 1;
    if (this.keys['s']) direction.z -= 1;
    if (this.keys['a']) direction.x -= 1;
    if (this.keys['d']) direction.x += 1;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      this.camera.quaternion
    );
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);

    const speed = this.moveSpeed * deltaTime;
    this.localPlayer.position.x += (forward.x * direction.z + right.x * direction.x) * speed;
    this.localPlayer.position.z += (forward.z * direction.z + right.z * direction.x) * speed;

    // Clamp to exact arena coordinates (-100 to 100)
    const clampLimit = this.gridCoreHalfSize;
    this.localPlayer.position.x = Math.max(-clampLimit, Math.min(clampLimit, this.localPlayer.position.x));
    this.localPlayer.position.z = Math.max(-clampLimit, Math.min(clampLimit, this.localPlayer.position.z));

    // Update camera
    this.camera.position.x = this.localPlayer.position.x;
    this.camera.position.y = this.localPlayer.position.y + 0.6;
    this.camera.position.z = this.localPlayer.position.z;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.localPlayer.rotation.y;
    this.camera.rotation.x = this.localPlayer.rotation.x;

    // Send movement (EVENT-DRIVEN like main)
    const posChanged =
      Math.abs(this.localPlayer.position.x - this.lastSentPosition.x) > 0.01 ||
      Math.abs(this.localPlayer.position.z - this.lastSentPosition.z) > 0.01;
    const rotChanged =
      Math.abs(this.localPlayer.rotation.x - this.lastSentRotation.x) > 0.01 ||
      Math.abs(this.localPlayer.rotation.y - this.lastSentRotation.y) > 0.01;

    if (posChanged || rotChanged) {
      const inputSequence = this.nextInputSequence++;
      this.sendMove(inputSequence);
      this.pendingInputs.push({
        sequence: inputSequence,
        position: { ...this.localPlayer.position },
        rotation: { ...this.localPlayer.rotation },
        timestamp: now
      });
      if (this.pendingInputs.length > 120) {
        this.pendingInputs.splice(0, this.pendingInputs.length - 120);
      }
    }

    // Shooting
    if (this.isShooting && now - this.lastShootTime > 100) {
      this.shoot();
      this.lastShootTime = now;
    }

    // Update HUD
    this.updateHUD();
  }

  sendMove(inputSequence) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.lastSentPosition = { ...this.localPlayer.position };
      this.lastSentRotation = { ...this.localPlayer.rotation };

      this.ws.send(
        JSON.stringify({
          type: 'move',
          position: this.localPlayer.position,
          rotation: this.localPlayer.rotation,
          inputSequence: inputSequence
        })
      );
    }
  }

  shoot() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'shoot' }));
    }
  }

  updateImpactRipples(nowMs) {
    for (let i = this.impactRipples.length - 1; i >= 0; i--) {
      const ripple = this.impactRipples[i];
      const age = nowMs - ripple.bornAt;
      const progress = age / ripple.lifetimeMs;

      if (progress >= 1) {
        this.scene.remove(ripple.mesh);
        ripple.mesh.geometry.dispose();
        ripple.material.dispose();
        this.impactRipples.splice(i, 1);
        continue;
      }

      const scale = 1 + progress * 10;
      ripple.mesh.scale.set(scale, scale, scale);
      ripple.material.opacity = 1 * (1 - progress);
    }
  }

  updateHUD() {
    document.getElementById('health').textContent = Math.max(0, this.localPlayer.health | 0);
    document.getElementById('position').textContent = `${this.localPlayer.position.x.toFixed(1)}, ${this.localPlayer.position.y.toFixed(1)}, ${this.localPlayer.position.z.toFixed(1)}`;
    document.getElementById('playerCount').textContent = this.remotePlayers.size + 1;
    this.drawMiniMap();
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  gameLoop() {
    requestAnimationFrame(() => this.gameLoop());
    this.update();
    this.renderer.render(this.scene, this.camera);
  }
}

const game = new MinimalGame();
