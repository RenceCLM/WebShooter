// Game Engine - FOCUSED ON KILLS AND DEATH SCREEN
class GameEngine {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.bullets = new Map();
    this.lastShotTime = 0;
    this.shootCooldown = 100;
    this.lastUpdateTime = Date.now();
    this.serverBullets = [];
    this.showAllKills = false;
    this.showAllPlayers = false;
    this.showAllBullets = false;
    this.leaderboardVisible = false;
    this.controlsVisible = !input.isMobile;
    this.lastImmersiveAttempt = 0;
    this.worldLayout = null;
    this.worldBuilt = false;
    this.worldGroup = null;
    this.worldCollision = {
      solidBoxes: [],
      playerOnlyBoxes: [],
      secondFloors: [],
      ramps: []
    };
    this.playerRadius = 1.0;
    this.playerHeight = 1.8;
    
    // Death/Kill - CRITICAL
    this.isDead = false;
    this.seenKills = new Set();
    this.deathScreenShown = false;
    this.pendingKillerName = null;
    this.respawnListener = null;
    this.localDeathTimeMs = null;
    
    // Player name
    this.playerName = null;
    this.verboseRealtimeLogs = false;
    this.nextInputSequence = 1;
    this.pendingInputs = [];
    this.serverConfig = {
      arenaHalfSize: 80,
      shootCooldownMs: 100,
      maxHealth: 100,
      lookSensitivity: 0.002,
      autoRespawn: true,
      autoRespawnTime: 3
    };
  }

  async init() {
    console.log('\n========== GAME INIT START ==========');
    
    // Connect to server
    await network.connect();
    console.log('✅ Connected to server');

    this.setupScene();
    this.setupNetworkHandlers();
    this.setupDebugHotkeys();
    this.setupLeaderboardHotkeys();
    this.setupControlsHotkeys();
    this.setupMobileMenu();
    this.applyControlsVisibility();
    this.setupMobileExperience();

    playerManager.setScene(this.scene);
    playerManager.setCamera(this.camera);
    console.log('✅ Game ready');
    console.log('========== GAME INIT DONE ==========\n');

    this.gameLoop();
    window.addEventListener('resize', () => this.onWindowResize());
  }

  applyControlsVisibility() {
    const controls = document.getElementById('instructions');
    if (!controls) {
      return;
    }
    controls.style.display = this.controlsVisible ? 'block' : 'none';
  }

  setupMobileExperience() {
    if (!input.isMobile) {
      return;
    }

    document.body.classList.add('mobile');
    this.controlsVisible = false;
    this.applyControlsVisibility();

    const tryImmersive = () => {
      this.requestMobileFullscreenLandscape();
    };

    this.requestMobileFullscreenLandscape();
    window.addEventListener('touchstart', tryImmersive, { passive: true });
    window.addEventListener('click', tryImmersive);
    window.addEventListener('orientationchange', tryImmersive);
  }

  async requestMobileFullscreenLandscape() {
    if (!input.isMobile) {
      return;
    }

    const now = Date.now();
    if (now - this.lastImmersiveAttempt < 500) {
      return;
    }
    this.lastImmersiveAttempt = now;

    const root = document.documentElement;
    if (!document.fullscreenElement && typeof root.requestFullscreen === 'function') {
      try {
        await root.requestFullscreen();
      } catch (error) {
        // Ignore gesture-related rejections and retry on next interaction
      }
    }

    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      try {
        await screen.orientation.lock('landscape');
      } catch (error) {
        // Ignore unsupported/permission failures
      }
    }
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e27);
    this.scene.fog = new THREE.Fog(0x0a0e27, 200, 500);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 1.6, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowShadowMap;
    document.getElementById('gameContainer').appendChild(this.renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    this.scene.add(directionalLight);

    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a3e });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const gridHelper = new THREE.GridHelper(200, 20, 0xFF8800, 0x0a0e27);
    this.scene.add(gridHelper);

    this.worldGroup = new THREE.Group();
    this.worldGroup.name = 'procedural-world';
    this.scene.add(this.worldGroup);

    const skyGeometry = new THREE.SphereGeometry(300, 32, 32);
    const skyMaterial = new THREE.MeshBasicMaterial({ color: 0x050810, side: THREE.BackSide });
    const skybox = new THREE.Mesh(skyGeometry, skyMaterial);
    this.scene.add(skybox);

    const crosshairDiv = document.createElement('div');
    crosshairDiv.id = 'crosshair';
    document.body.appendChild(crosshairDiv);

    const cooldownWrap = document.createElement('div');
    cooldownWrap.id = 'shootCooldown';
    const cooldownFill = document.createElement('div');
    cooldownFill.id = 'shootCooldownFill';
    cooldownWrap.appendChild(cooldownFill);
    document.body.appendChild(cooldownWrap);
  }

  setupNetworkHandlers() {
    console.log('📡 Setting up network handlers...');

    network.on('hello', () => {
      network.sendJoin();
    });

    network.on('joinResponse', (message) => {
      if (message && message.name) {
        this.playerName = message.name;
      }
      if (message && message.config) {
        this.serverConfig = {
          ...this.serverConfig,
          ...message.config
        };
        this.shootCooldown = message.config.shootCooldownMs;
        if (typeof message.config.lookSensitivity === 'number') {
          input.setLookSensitivity(message.config.lookSensitivity);
        }
      }

      if (message && message.worldLayout) {
        const nextLayout = message.worldLayout;
        const shouldRebuild = !this.worldLayout || this.worldLayout.generatedAt !== nextLayout.generatedAt;
        if (shouldRebuild) {
          this.worldLayout = nextLayout;
          this.buildWorldGeometry();
        }
      }
    });

    network.on('gameState', (message) => {
      const state = message.state;
      const players = state.players || [];
      const bullets = state.bullets || [];
      const kills = state.kills || [];
      const serverTime = Number.isFinite(message.serverTime) ? message.serverTime : Date.now();
      this.lastStatePlayers = players;
      this.lastKills = kills;
      
      // Store bullets
      this.serverBullets = bullets;

      // Resolve local player ID from name if needed
      if (!network.playerId && this.playerName) {
        const me = players.find(p => p.name === this.playerName);
        if (me) {
          network.playerId = me.id;
          if (!playerManager.localPlayer) {
            playerManager.createLocalPlayer(me.id, me.position, me.name);
          }
          playerManager.localPlayer.color = me.color;
        }
      }

      // Update players
      const remoteIds = new Set();
      let myPlayer = null;

      for (const player of players) {
        if (player.id === network.playerId) {
          myPlayer = player;
          // Check death state
          if (player.health <= 0) {
            if (!this.isDead) {
              console.log(`💀 WE DIED (health: ${player.health})`);
              this.isDead = true;
              this.localDeathTimeMs = Number.isFinite(player.deathTime) ? player.deathTime : Date.now();
              const killerName = this.pendingKillerName || player.lastKillerName || 'Unknown';
              if (!this.deathScreenShown) {
                this.displayDeathScreen(killerName);
              }
            } else if (Number.isFinite(player.deathTime)) {
              this.localDeathTimeMs = player.deathTime;
            }
          } else {
            if (this.isDead) {
              console.log(`♻️  WE RESPAWNED (health: ${player.health})`);
              this.isDead = false;
              this.localDeathTimeMs = null;
              this.pendingKillerName = null;
              this.hideDeathScreen();
            } else if (this.deathScreenShown) {
              this.hideDeathScreen();
            }
          }

          if (playerManager.localPlayer) {
            playerManager.localPlayer.health = player.health;
            playerManager.localPlayer.score = player.score;
            playerManager.localPlayer.color = player.color;

            this.reconcileLocalPlayer(player);
          }
        } else {
          remoteIds.add(player.id);
          if (!playerManager.remotePlayers.has(player.id)) {
            playerManager.addRemotePlayer(player.id, player.name, player.position);
          }
          playerManager.updateRemotePlayer(
            player.id,
            player.name,
            player.color,
            player.position,
            player.rotation,
            player.health,
            player.score,
            serverTime
          );
        }
      }

      // Remove disconnected
      for (const [id] of playerManager.remotePlayers) {
        if (!remoteIds.has(id)) {
          playerManager.removeRemotePlayer(id);
        }
      }

      // PROCESS KILLS
      if (kills.length > 0) {
        for (const kill of kills) {
          const killKey = `${kill.killerId}|${kill.victimId}|${kill.timestamp}`;
          
          if (this.seenKills.has(killKey)) {
            continue;
          }

          this.seenKills.add(killKey);
          if (this.verboseRealtimeLogs) {
            console.log(`✅ NEW KILL DETECTED: ${kill.killer} → ${kill.victim}`);
          }

          // Show kill notification for EVERYONE
          this.displayKillFeed(kill.killer, kill.victim);

          // Check if WE were killed
          if (kill.victimId === network.playerId && myPlayer && myPlayer.health <= 0) {
            console.log(`\n🎬🎬🎬 SHOWING DEATH SCREEN 🎬🎬🎬`);
            this.pendingKillerName = kill.killer;
            if (!this.deathScreenShown) {
              this.displayDeathScreen(kill.killer);
            }
          }
        }
      }
    });

  }

  setupDebugHotkeys() {
    window.addEventListener('keydown', (e) => {
      if (!input.debugMode || e.repeat) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'k') {
        this.showAllKills = !this.showAllKills;
      } else if (key === 'p') {
        this.showAllPlayers = !this.showAllPlayers;
      } else if (key === 'b') {
        this.showAllBullets = !this.showAllBullets;
      }
    });
  }

  setupLeaderboardHotkeys() {
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || e.repeat) {
        return;
      }
      e.preventDefault();
      this.leaderboardVisible = true;
      this.updateLeaderboard();
    });

    window.addEventListener('keyup', (e) => {
      if (e.key !== 'Tab') {
        return;
      }
      e.preventDefault();
      this.leaderboardVisible = false;
      const board = document.getElementById('leaderboard');
      if (board) {
        board.classList.remove('show');
      }
    });
  }

  setupControlsHotkeys() {
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'F1' || e.repeat) {
        return;
      }
      e.preventDefault();
      this.controlsVisible = !this.controlsVisible;
      this.applyControlsVisibility();
    });
  }

  setupMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    if (!menu) {
      return;
    }

    const syncMenuState = () => {
      if (!input.isMobile) {
        document.body.classList.remove('menu-open');
        return;
      }
      document.body.classList.toggle('menu-open', menu.open);
    };

    menu.addEventListener('toggle', syncMenuState);
    syncMenuState();

    menu.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const toggleId = target.getAttribute('data-toggle');
      if (!toggleId) {
        return;
      }
      event.preventDefault();

      if (toggleId === 'leaderboard') {
        this.leaderboardVisible = !this.leaderboardVisible;
        const board = document.getElementById('leaderboard');
        if (!this.leaderboardVisible && board) {
          board.classList.remove('show');
        }
        return;
      }

      if (toggleId === 'debugOverlay') {
        input.debugMode = !input.debugMode;
        if (!input.debugMode) {
          const debug = document.getElementById('debugOverlay');
          if (debug) {
            debug.classList.remove('show');
          }
        }
        return;
      }

      const element = document.getElementById(toggleId);
      if (element) {
        const isHidden = element.style.display === 'none';
        element.style.display = isHidden ? 'block' : 'none';
        if (toggleId === 'instructions') {
          this.controlsVisible = isHidden;
        }
      }
    });
  }

  buildLeaderboardStats() {
    const players = this.lastStatePlayers || [];
    const kills = this.lastKills || [];
    const stats = new Map();

    for (const player of players) {
      stats.set(player.id, {
        id: player.id,
        name: player.name,
        kills: 0,
        deaths: 0
      });
    }

    for (const kill of kills) {
      if (kill.killerId) {
        if (!stats.has(kill.killerId)) {
          stats.set(kill.killerId, {
            id: kill.killerId,
            name: kill.killer,
            kills: 0,
            deaths: 0
          });
        }
        stats.get(kill.killerId).kills += 1;
      }

      if (kill.victimId) {
        if (!stats.has(kill.victimId)) {
          stats.set(kill.victimId, {
            id: kill.victimId,
            name: kill.victim,
            kills: 0,
            deaths: 0
          });
        }
        stats.get(kill.victimId).deaths += 1;
      }
    }

    const entries = Array.from(stats.values());
    entries.sort((a, b) => {
      if (b.kills !== a.kills) return b.kills - a.kills;
      if (a.deaths !== b.deaths) return a.deaths - b.deaths;
      return a.name.localeCompare(b.name);
    });

    return entries;
  }

  updateLeaderboard() {
    if (!this.leaderboardVisible) {
      return;
    }

    const board = document.getElementById('leaderboard');
    if (!board) {
      return;
    }

    const entries = this.buildLeaderboardStats();
    let html = '';

    if (input.isMobile) {
      board.classList.add('mobile-vertical');

      html += '<div class="leaderboard-title">Scoreboard<span>Show/Hide in Menu</span></div>';
      html += '<div class="leaderboard-mobile-list">';
      if (entries.length === 0) {
        html += '<div class="leaderboard-mobile-empty">No kills yet</div>';
      } else {
        entries.forEach((entry, index) => {
          html += '<div class="leaderboard-mobile-item">' +
            `<div class="leaderboard-mobile-rank">#${index + 1}</div>` +
            `<div class="leaderboard-mobile-name">${entry.name}</div>` +
            `<div class="leaderboard-mobile-kd">K ${entry.kills} • D ${entry.deaths}</div>` +
            '</div>';
        });
      }
      html += '</div>';
    } else {
      board.classList.remove('mobile-vertical');

      html += '<div class="leaderboard-title">Kills / Deaths<span>Hold TAB to view</span></div>';
      html += '<table class="leaderboard-table">';
      html += '<thead><tr><th class="leaderboard-rank">#</th><th>Player</th><th class="leaderboard-kd">K</th><th class="leaderboard-kd">D</th></tr></thead>';
      html += '<tbody>';
      if (entries.length === 0) {
        html += '<tr><td colspan="4">No kills yet</td></tr>';
      } else {
        entries.forEach((entry, index) => {
          html += '<tr>' +
            `<td class="leaderboard-rank">${index + 1}</td>` +
            `<td>${entry.name}</td>` +
            `<td class="leaderboard-kd">${entry.kills}</td>` +
            `<td class="leaderboard-kd">${entry.deaths}</td>` +
            '</tr>';
        });
      }
      html += '</tbody></table>';
    }

    board.innerHTML = html;
    board.classList.add('show');
  }


  displayDeathScreen(killerName) {
    console.log(`� Player eliminated by ${killerName}`);

    const screen = document.getElementById('gameOverScreen');
    const nameEl = document.getElementById('gameOverKillerName');
    const hud = document.getElementById('hud');
    const gameContainer = document.getElementById('gameContainer');

    if (!screen || !nameEl) {
      console.error('❌ Game over screen HTML elements not found!');
      return;
    }

    // Hide the local player's body while dead
    if (playerManager.localPlayer && playerManager.localPlayer.mesh) {
      playerManager.localPlayer.mesh.visible = false;
    }
    if (playerManager.localPlayer && playerManager.localPlayer.healthBar) {
      playerManager.localPlayer.healthBar.visible = false;
    }
    if (playerManager.localPlayer && playerManager.localPlayer.nameLabel) {
      playerManager.localPlayer.nameLabel.visible = false;
    }

    this.hideDeathScreen();

    // Show game over screen
    nameEl.textContent = killerName;
    screen.classList.add('show');
    screen.style.display = 'flex';
    this.deathScreenShown = true;
    
    // Hide game elements
    if (hud) hud.style.display = 'none';
    if (gameContainer) gameContainer.style.display = 'none';

    this.updateDeathScreenHint();

    console.log(`✅ Death screen shown`);

    if (this.serverConfig.autoRespawn) {
      return;
    }

    // One-time respawn listener
    this.respawnListener = () => {
      if (!this.isDead) {
        this.hideDeathScreen();
        return;
      }

      console.log(`🔄 Respawning...`);
      
      if (playerManager.localPlayer && playerManager.localPlayer.mesh) {
        playerManager.localPlayer.mesh.visible = true;
      }
      if (playerManager.localPlayer && playerManager.localPlayer.healthBar) {
        playerManager.localPlayer.healthBar.visible = true;
      }
      if (playerManager.localPlayer && playerManager.localPlayer.nameLabel) {
        playerManager.localPlayer.nameLabel.visible = true;
      }

      network.sendRespawn();
      this.isDead = false;
      this.localDeathTimeMs = null;
      this.pendingKillerName = null;
      this.hideDeathScreen();
    };

    document.addEventListener('keydown', this.respawnListener);
    document.addEventListener('mousedown', this.respawnListener);
  }

  hideDeathScreen() {
    const screen = document.getElementById('gameOverScreen');
    const hud = document.getElementById('hud');
    const gameContainer = document.getElementById('gameContainer');

    if (screen) {
      screen.classList.remove('show');
      screen.style.display = 'none';
    }
    if (hud) {
      hud.style.display = 'block';
    }
    if (gameContainer) {
      gameContainer.style.display = 'block';
    }

    if (playerManager.localPlayer && playerManager.localPlayer.mesh) {
      playerManager.localPlayer.mesh.visible = true;
    }
    if (playerManager.localPlayer && playerManager.localPlayer.healthBar) {
      playerManager.localPlayer.healthBar.visible = true;
    }
    if (playerManager.localPlayer && playerManager.localPlayer.nameLabel) {
      playerManager.localPlayer.nameLabel.visible = true;
    }

    this.deathScreenShown = false;

    if (this.respawnListener) {
      document.removeEventListener('keydown', this.respawnListener);
      document.removeEventListener('mousedown', this.respawnListener);
      this.respawnListener = null;
    }
  }

  getAutoRespawnDelayMs() {
    const seconds = Number(this.serverConfig.autoRespawnTime);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return 0;
    }
    return seconds * 1000;
  }

  updateDeathScreenHint() {
    const hintEl = document.getElementById('gameOverHint');
    if (!hintEl || !this.deathScreenShown) {
      return;
    }

    if (!this.serverConfig.autoRespawn) {
      hintEl.textContent = 'Press ANY KEY to respawn';
      return;
    }

    const delayMs = this.getAutoRespawnDelayMs();
    const deathAt = Number.isFinite(this.localDeathTimeMs) ? this.localDeathTimeMs : Date.now();
    const remainingMs = Math.max(0, delayMs - (Date.now() - deathAt));
    const secondsLeft = Math.ceil(remainingMs / 1000);

    if (secondsLeft > 0) {
      hintEl.textContent = `Respawning automatically in ${secondsLeft}s`;
    } else {
      hintEl.textContent = 'Respawning...';
    }
  }

  displayKillFeed(killer, victim) {
    const notif = document.createElement('div');
    notif.className = 'kill-notification';
    notif.innerHTML = `<span class="killer-name">${killer}</span> killed <span class="victim-name">${victim}</span> <span class="points">+10</span>`;

    document.body.appendChild(notif);

    setTimeout(() => {
      notif.classList.add('fadeOut');
      setTimeout(() => {
        notif.remove();
      }, 500);
    }, 3000);
  }

  clearWorldGeometry() {
    if (!this.worldGroup) {
      return;
    }

    while (this.worldGroup.children.length > 0) {
      const child = this.worldGroup.children[0];
      if (!child) {
        continue;
      }
      this.worldGroup.remove(child);
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (Array.isArray(child.material)) {
        child.material.forEach(material => material.dispose());
      } else if (child.material) {
        child.material.dispose();
      }
    }

    this.worldBuilt = false;
  }

  createWorldBox(width, height, depth, color) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.2,
      roughness: 0.75
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  normalizeDirection(direction) {
    const value = Number(direction) || 0;
    return ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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

  addWallMesh(wall) {
    if (!this.worldGroup) {
      return;
    }

    const alongX = wall.axis === 'x';
    const width = Number.isFinite(wall.width) ? wall.width : (alongX ? wall.length : wall.thickness);
    const depth = Number.isFinite(wall.depth) ? wall.depth : (alongX ? wall.thickness : wall.length);
    const mesh = this.createWorldBox(width, wall.height, depth, 0x334D66);
    mesh.position.set(wall.x, wall.height / 2, wall.z);
    this.worldGroup.add(mesh);
  }

  addBuildingMeshes(building) {
    if (!this.worldGroup) {
      return;
    }

    if (Array.isArray(building.wallSegments) && building.wallSegments.length > 0) {
      building.wallSegments.forEach(segment => {
        const segmentMesh = this.createWorldBox(segment.width, segment.height, segment.depth, 0x3B3350);
        const segmentY = Number.isFinite(segment.y) ? segment.y : segment.height / 2;
        segmentMesh.position.set(segment.x, segmentY, segment.z);
        this.worldGroup.add(segmentMesh);
      });
      return;
    }

    const half = building.size / 2;
    const thickness = building.wallThickness;
    const height = building.wallHeight;
    const doorWidth = Math.max(2, Math.min(building.size - 2, building.doorWidth));
    const leftOrBottomSegment = Math.max(1, (building.size - doorWidth) / 2);
    const wallColor = 0x3B3350;

    const addSegment = (x, z, width, depth) => {
      const segment = this.createWorldBox(width, height, depth, wallColor);
      segment.position.set(x, height / 2, z);
      this.worldGroup.add(segment);
    };

    const northZ = building.z - half;
    const southZ = building.z + half;
    const westX = building.x - half;
    const eastX = building.x + half;

    if (building.doorSide === 'north') {
      addSegment(building.x - (doorWidth + leftOrBottomSegment) / 2, northZ, leftOrBottomSegment, thickness);
      addSegment(building.x + (doorWidth + leftOrBottomSegment) / 2, northZ, leftOrBottomSegment, thickness);
    } else {
      addSegment(building.x, northZ, building.size, thickness);
    }

    if (building.doorSide === 'south') {
      addSegment(building.x - (doorWidth + leftOrBottomSegment) / 2, southZ, leftOrBottomSegment, thickness);
      addSegment(building.x + (doorWidth + leftOrBottomSegment) / 2, southZ, leftOrBottomSegment, thickness);
    } else {
      addSegment(building.x, southZ, building.size, thickness);
    }

    if (building.doorSide === 'west') {
      addSegment(westX, building.z - (doorWidth + leftOrBottomSegment) / 2, thickness, leftOrBottomSegment);
      addSegment(westX, building.z + (doorWidth + leftOrBottomSegment) / 2, thickness, leftOrBottomSegment);
    } else {
      addSegment(westX, building.z, thickness, building.size);
    }

    if (building.doorSide === 'east') {
      addSegment(eastX, building.z - (doorWidth + leftOrBottomSegment) / 2, thickness, leftOrBottomSegment);
      addSegment(eastX, building.z + (doorWidth + leftOrBottomSegment) / 2, thickness, leftOrBottomSegment);
    } else {
      addSegment(eastX, building.z, thickness, building.size);
    }
  }

  addRampMesh(ramp) {
    if (!this.worldGroup) {
      return;
    }

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(ramp.length, 0);
    shape.lineTo(ramp.length, ramp.height);
    shape.lineTo(0, 0);

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: ramp.width,
      bevelEnabled: false,
      steps: 1
    });

    geometry.translate(-ramp.length / 2, 0, -ramp.width / 2);

    const material = new THREE.MeshStandardMaterial({
      color: 0x5A4A35,
      metalness: 0.12,
      roughness: 0.82
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(ramp.x, Number(ramp.startY) || 0, ramp.z);
    mesh.rotation.y = THREE.MathUtils.degToRad(ramp.direction || 0);
    this.worldGroup.add(mesh);
  }

  addSecondFloorMesh(floor) {
    if (!this.worldGroup) {
      return;
    }

    const thickness = Number(floor.thickness) || 0.8;
    const slab = this.createWorldBox(floor.width, thickness, floor.depth, 0x56616A);
    slab.position.set(floor.x, floor.y - thickness / 2, floor.z);
    this.worldGroup.add(slab);
  }

  addUpperWallMesh(segment) {
    if (!this.worldGroup) {
      return;
    }

    const mesh = this.createWorldBox(segment.width, segment.height, segment.depth, 0x7A5AA8);
    mesh.position.set(segment.x, segment.y, segment.z);
    this.worldGroup.add(mesh);
  }

  buildWorldCollisionData() {
    if (!this.worldLayout) {
      this.worldCollision = {
        solidBoxes: [],
        playerOnlyBoxes: [],
        secondFloors: [],
        ramps: []
      };
      return;
    }

    const solidBoxes = [];
    const playerOnlyBoxes = [];
    const secondFloors = [];
    const ramps = [];

    (this.worldLayout.walls || []).forEach(wall => {
      const width = Number.isFinite(wall.width)
        ? wall.width
        : (wall.axis === 'x' ? wall.length : wall.thickness);
      const depth = Number.isFinite(wall.depth)
        ? wall.depth
        : (wall.axis === 'x' ? wall.thickness : wall.length);
      solidBoxes.push(this.makeBoxAabb(wall.x, wall.height / 2, wall.z, width, wall.height, depth));
    });

    (this.worldLayout.buildings || []).forEach(building => {
      const segments = building.wallSegments || [];
      segments.forEach(segment => {
        const segmentY = Number.isFinite(segment.y) ? segment.y : segment.height / 2;
        solidBoxes.push(this.makeBoxAabb(segment.x, segmentY, segment.z, segment.width, segment.height, segment.depth));
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

    (this.worldLayout.secondFloors || []).forEach(floor => {
      secondFloors.push(this.makeFlatRect(floor.x, floor.z, floor.width, floor.depth, floor.y));
    });

    (this.worldLayout.upperWalls || []).forEach(segment => {
      solidBoxes.push(this.makeBoxAabb(segment.x, segment.y, segment.z, segment.width, segment.height, segment.depth));
    });

    (this.worldLayout.ramps || []).forEach(ramp => {
      ramps.push({
        x: ramp.x,
        z: ramp.z,
        width: ramp.width,
        length: ramp.length,
        direction: this.normalizeDirection(ramp.direction),
        startY: Number.isFinite(ramp.startY) ? ramp.startY : 1,
        endY: Number.isFinite(ramp.endY)
          ? ramp.endY
          : (Number.isFinite(ramp.startY) ? ramp.startY : 1) + (Number(ramp.height) || 0)
      });
    });

    this.worldCollision = {
      solidBoxes,
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
    const baseY = 1;
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

  isMovementBlocked(x, y, z) {
    const minY = y;
    const maxY = y + this.playerHeight;
    const collisionBoxes = [
      ...(this.worldCollision.solidBoxes || []),
      ...(this.worldCollision.playerOnlyBoxes || [])
    ];

    for (const box of collisionBoxes) {
      const overlapsVertical = maxY > box.minY && minY < box.maxY;
      if (!overlapsVertical) {
        continue;
      }
      if (this.intersectsCircleAabb2d(x, z, this.playerRadius, box)) {
        return true;
      }
    }
    return false;
  }

  resolveLocalMovement(currentPosition, desiredPosition) {
    const maxBounds = this.serverConfig.arenaHalfSize;
    const currentX = Number(currentPosition.x) || 0;
    const currentZ = Number(currentPosition.z) || 0;
    const currentY = Number(currentPosition.y) || 1;
    const targetX = this.clamp(Number(desiredPosition.x) || currentX, -maxBounds + 1, maxBounds - 1);
    const targetZ = this.clamp(Number(desiredPosition.z) || currentZ, -maxBounds + 1, maxBounds - 1);

    let resolvedX = currentX;
    let resolvedZ = currentZ;

    const xStepY = this.getTerrainHeightAt(targetX, currentZ, currentY);
    if (!this.isMovementBlocked(targetX, xStepY, currentZ)) {
      resolvedX = targetX;
    }

    const zStepY = this.getTerrainHeightAt(resolvedX, targetZ, currentY);
    if (!this.isMovementBlocked(resolvedX, zStepY, targetZ)) {
      resolvedZ = targetZ;
    }

    let resolvedY = this.getTerrainHeightAt(resolvedX, resolvedZ, currentY);
    if (this.isMovementBlocked(resolvedX, resolvedY, resolvedZ)) {
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

  buildWorldGeometry() {
    if (!this.worldLayout || !this.worldGroup) {
      return;
    }

    this.clearWorldGeometry();

    const walls = this.worldLayout.walls || [];
    const buildings = this.worldLayout.buildings || [];
    const ramps = this.worldLayout.ramps || [];
    const secondFloors = this.worldLayout.secondFloors || [];
    const upperWalls = this.worldLayout.upperWalls || [];

    walls.forEach(wall => this.addWallMesh(wall));
    buildings.forEach(building => this.addBuildingMeshes(building));
    secondFloors.forEach(floor => this.addSecondFloorMesh(floor));
    upperWalls.forEach(segment => this.addUpperWallMesh(segment));
    ramps.forEach(ramp => this.addRampMesh(ramp));

    this.buildWorldCollisionData();

    this.worldBuilt = true;
  }

  syncBullets() {
    const serverIds = new Set(this.serverBullets.map(b => b.id));

    for (const [id, obj] of this.bullets) {
      if (!serverIds.has(id)) {
        this.scene.remove(obj.mesh);
        if (obj.light) this.scene.remove(obj.light);
        this.bullets.delete(id);
      }
    }

    for (const bulletData of this.serverBullets) {
      if (!this.bullets.has(bulletData.id)) {
        this.createBullet(bulletData);
      } else {
        const obj = this.bullets.get(bulletData.id);
        obj.mesh.position.set(bulletData.position.x, bulletData.position.y, bulletData.position.z);
      }
    }
  }

  createBullet(bulletData) {
    const geometry = new THREE.SphereGeometry(0.3, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color: 0xFF8800,
      emissive: 0xFF6600,
      emissiveIntensity: 1.2,
      metalness: 0.9,
      roughness: 0.1,
      toneMapped: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(bulletData.position.x, bulletData.position.y, bulletData.position.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const light = new THREE.PointLight(0xFF8800, 2, 15);
    mesh.add(light);

    this.scene.add(mesh);
    this.bullets.set(bulletData.id, { mesh, light });
  }

  updateHUD() {
    const player = playerManager.localPlayer;
    if (!player) return;

    const cooldownFill = document.getElementById('shootCooldownFill');
    if (cooldownFill) {
      const now = Date.now();
      const ratio = Math.min(1, Math.max(0, (now - this.lastShotTime) / this.shootCooldown));
      cooldownFill.style.width = `${Math.round(ratio * 100)}%`;
      cooldownFill.classList.toggle('ready', ratio >= 1);
    }

    const nameEl = document.getElementById('playerName');
    if (nameEl) nameEl.textContent = player.name;

    const posEl = document.getElementById('position');
    if (posEl) posEl.textContent = `X: ${player.position.x.toFixed(1)} Y: ${player.position.y.toFixed(1)} Z: ${player.position.z.toFixed(1)}`;

    const healthEl = document.getElementById('health');
    if (healthEl) healthEl.textContent = `${Math.max(0, player.health) | 0}`;

    const scoreEl = document.getElementById('score');
    if (scoreEl) scoreEl.textContent = `${player.score | 0}`;

    const countEl = document.getElementById('playerCount');
    if (countEl) countEl.textContent = `${playerManager.getTotalPlayerCount()}`;
  }

  update() {
    const player = playerManager.localPlayer;
    if (!player || !this.camera) return;

    // Block movement if dead
    if (this.isDead) return;

    const now = Date.now();
    const deltaTime = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;

    const moveDir = input.getMovementDirection();
    const speed = 50 * deltaTime;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);

    const targetPosition = {
      x: player.position.x + (forward.x * moveDir.z + right.x * moveDir.x) * speed,
      z: player.position.z + (forward.z * moveDir.z + right.z * moveDir.x) * speed
    };

    const resolvedPosition = this.resolveLocalMovement(player.position, targetPosition);
    player.position.x = resolvedPosition.x;
    player.position.y = resolvedPosition.y;
    player.position.z = resolvedPosition.z;

    this.camera.position.x = player.position.x;
    this.camera.position.y = player.position.y + 0.6;
    this.camera.position.z = player.position.z;

    const mouseRot = input.getMouseRotation();
    const rotated = mouseRot.x !== 0 || mouseRot.y !== 0;
    player.rotation.x -= mouseRot.x;
    player.rotation.y -= mouseRot.y;
    player.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.rotation.x));

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = player.rotation.y;
    this.camera.rotation.x = player.rotation.x;

    input.resetMouseDelta();

    const wantsShoot = input.isShooting() && now - this.lastShotTime > this.shootCooldown;
    const shouldSendMove = input.isMoving() || input.isShooting() || rotated;

    if (shouldSendMove) {
      const inputSequence = this.nextInputSequence++;
      network.sendMove(player.position, player.rotation, inputSequence);
      this.pendingInputs.push({
        sequence: inputSequence,
        position: { ...player.position },
        rotation: { ...player.rotation },
        timestamp: now
      });

      if (this.pendingInputs.length > 120) {
        this.pendingInputs.splice(0, this.pendingInputs.length - 120);
      }
    }

    if (wantsShoot) {
      this.shoot();
      this.lastShotTime = now;
    }
  }

  shoot() {
    network.sendShoot();
  }

  reconcileLocalPlayer(serverPlayer) {
    const localPlayer = playerManager.localPlayer;
    if (!localPlayer) {
      return;
    }

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
      this.pendingInputs = this.pendingInputs.filter(pending => pending.sequence > acknowledgedSequence);
    }

    const targetPosition = { ...localPlayer.position };
    const targetRotation = { ...localPlayer.rotation };

    if (acknowledgedInput) {
      const baseErrorX = serverPlayer.position.x - acknowledgedInput.position.x;
      const baseErrorY = serverPlayer.position.y - acknowledgedInput.position.y;
      const baseErrorZ = serverPlayer.position.z - acknowledgedInput.position.z;
      targetPosition.x += baseErrorX;
      targetPosition.y += baseErrorY;
      targetPosition.z += baseErrorZ;

      const baseErrorRotX = serverPlayer.rotation.x - acknowledgedInput.rotation.x;
      const baseErrorRotY = serverPlayer.rotation.y - acknowledgedInput.rotation.y;
      targetRotation.x += baseErrorRotX;
      targetRotation.y += baseErrorRotY;
    } else {
      targetPosition.x = serverPlayer.position.x;
      targetPosition.y = serverPlayer.position.y;
      targetPosition.z = serverPlayer.position.z;
      targetRotation.x = serverPlayer.rotation.x;
      targetRotation.y = serverPlayer.rotation.y;
    }

    const dx = targetPosition.x - localPlayer.position.x;
    const dy = targetPosition.y - localPlayer.position.y;
    const dz = targetPosition.z - localPlayer.position.z;
    const distanceError = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distanceError > 8) {
      localPlayer.position.x = targetPosition.x;
      localPlayer.position.y = targetPosition.y;
      localPlayer.position.z = targetPosition.z;
    } else if (distanceError > 0.02) {
      const correctionAlpha = 0.35;
      localPlayer.position.x += dx * correctionAlpha;
      localPlayer.position.y += dy * correctionAlpha;
      localPlayer.position.z += dz * correctionAlpha;
    }

    const rotationCorrectionAlpha = 0.35;
    localPlayer.rotation.x += (targetRotation.x - localPlayer.rotation.x) * rotationCorrectionAlpha;
    localPlayer.rotation.y += (targetRotation.y - localPlayer.rotation.y) * rotationCorrectionAlpha;
  }

  onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  updateDebugOverlay() {
    const debug = document.getElementById('debugOverlay');
    debug.classList.add('show');

    const players = (this.lastStatePlayers || []).filter(Boolean);
    const bullets = this.serverBullets || [];
    const kills = this.lastKills || [];
    const maxPlayers = 3;
    const maxBullets = 3;
    const maxKills = 5;
    const shortId = value => {
      if (!value) return 'null';
      const text = String(value);
      return text.length <= 6 ? text : text.slice(0, 6);
    };
    const fmtNum = (value, digits = 1) => Number(value).toFixed(digits);

    let html = '<h3>🐛 DEBUG (F3)</h3>';

    html += '<div class="debug-section debug-section-header">' +
      '<strong>Players (gameState):</strong>' +
      '<span class="debug-hint">Show all: P</span>' +
      '</div>';
    const playerLimit = this.showAllPlayers ? players.length : maxPlayers;
    players.slice(0, playerLimit).forEach(p => {
      html += `<div class="debug-item">` +
        `<div class="debug-row"><span class="debug-key">id</span><span class="debug-value">${shortId(p.id)}</span>` +
        `<span class="debug-key">name</span><span class="debug-value">${p.name}</span>` +
        `<span class="debug-key">color</span>` +
        `<span class="debug-color-swatch" style="background:${p.color}"></span>` +
        `<span class="debug-color-hex">${p.color}</span></div>` +
        `<div class="debug-row"><span class="debug-key">pos</span>` +
        `<span class="debug-value">(${fmtNum(p.position.x)},${fmtNum(p.position.y)},${fmtNum(p.position.z)})</span>` +
        `<span class="debug-key">rot</span>` +
        `<span class="debug-value">(${fmtNum(p.rotation.x, 2)},${fmtNum(p.rotation.y, 2)},${fmtNum(p.rotation.z, 2)})</span></div>` +
        `<div class="debug-row"><span class="debug-key">health</span><span class="debug-value">${p.health}</span>` +
        `<span class="debug-key">score</span><span class="debug-value">${p.score}</span>` +
        `<span class="debug-key">deathTime</span><span class="debug-value">${p.deathTime || 'null'}</span></div>` +
        `<div class="debug-row"><span class="debug-key">lastKiller</span><span class="debug-value">${p.lastKillerName || 'null'}</span>` +
        `<span class="debug-key">lastUpdate</span><span class="debug-value">${p.lastUpdate}</span></div>` +
        `</div>`;
    });
    if (!this.showAllPlayers && players.length > maxPlayers) {
      html += `<div class="debug-item">...and ${players.length - maxPlayers} more</div>`;
    }

    html += '<div class="debug-section debug-section-header">' +
      '<strong>Bullets (gameState):</strong>' +
      '<span class="debug-hint">Show all: B</span>' +
      '</div>';
    const bulletLimit = this.showAllBullets ? bullets.length : maxBullets;
    bullets.slice(0, bulletLimit).forEach(b => {
      html += `<div class="debug-bullet">` +
        `<div class="debug-row"><span class="debug-key">id</span><span class="debug-value">${shortId(b.id)}</span>` +
        `<span class="debug-key">player</span><span class="debug-value">${shortId(b.playerId)}</span>` +
        `<span class="debug-key">speed</span><span class="debug-value">${b.speed}</span></div>` +
        `<div class="debug-row"><span class="debug-key">pos</span>` +
        `<span class="debug-value">(${fmtNum(b.position.x)},${fmtNum(b.position.y)},${fmtNum(b.position.z)})</span>` +
        `<span class="debug-key">dir</span>` +
        `<span class="debug-value">(${fmtNum(b.direction.x, 2)},${fmtNum(b.direction.y, 2)},${fmtNum(b.direction.z, 2)})</span></div>` +
        `<div class="debug-row"><span class="debug-key">age</span><span class="debug-value">${b.age}</span>` +
        `<span class="debug-key">maxAge</span><span class="debug-value">${b.maxAge}</span></div>` +
        `</div>`;
    });
    if (!this.showAllBullets && bullets.length > maxBullets) {
      html += `<div class="debug-bullet">...and ${bullets.length - maxBullets} more</div>`;
    }

    const world = this.worldLayout || {};
    const walls = world.walls || [];
    const buildings = world.buildings || [];
    const floors = world.secondFloors || [];
    const upperWalls = world.upperWalls || [];

    html += '<div class="debug-section debug-section-header">' +
      '<strong>World:</strong>' +
      '<span class="debug-hint">Buildings shown in purple in debug map</span>' +
      '</div>';

    html += `<div class="debug-item"><div class="debug-row">` +
      `<span class="debug-key">walls</span><span class="debug-value">${walls.length}</span>` +
      `<span class="debug-key">buildings</span><span class="debug-value">${buildings.length}</span>` +
      `<span class="debug-key">floors</span><span class="debug-value">${floors.length}</span>` +
      `<span class="debug-key">upper</span><span class="debug-value">${upperWalls.length}</span>` +
      `</div></div>`;

    walls.slice(0, 2).forEach((wall, index) => {
      const width = Number.isFinite(wall.width) ? wall.width : (wall.axis === 'x' ? wall.length : wall.thickness);
      const depth = Number.isFinite(wall.depth) ? wall.depth : (wall.axis === 'x' ? wall.thickness : wall.length);
      html += `<div class="debug-item"><div class="debug-row">` +
        `<span class="debug-key">wall${index + 1}</span>` +
        `<span class="debug-value">(${fmtNum(wall.x)},${fmtNum(wall.z)}) ${fmtNum(width)}x${fmtNum(depth)} h${fmtNum(wall.height)}</span>` +
        `</div></div>`;
    });

    html += '<div class="debug-section debug-section-header">' +
      '<strong>Kills:</strong>' +
      '<span class="debug-hint">Show all: K</span>' +
      '</div>';
    const sortedKills = kills.slice().sort((a, b) => b.timestamp - a.timestamp);
    const killLimit = this.showAllKills ? sortedKills.length : maxKills;
    html += `<div class="debug-kills-list${this.showAllKills ? ' show-all' : ''}">`;
    sortedKills.slice(0, killLimit).forEach(k => {
      const time = new Date(k.timestamp).toLocaleTimeString();
      html += `<div class="debug-kill"><span class="debug-key">${time}</span>` +
        `<span class="debug-value">${k.killer} → ${k.victim}</span></div>`;
    });
    if (!this.showAllKills && sortedKills.length > maxKills) {
      html += `<div class="debug-kill">...and ${sortedKills.length - maxKills} more</div>`;
    }
    html += '</div>';

    debug.innerHTML = html;
  }

  gameLoop() {
    requestAnimationFrame(() => this.gameLoop());

    this.update();
    this.updateDeathScreenHint();
    playerManager.updateRemoteInterpolation();
    this.syncBullets();
    this.updateHUD();
    playerManager.updateBillboards();

    if (input.debugMode) {
      this.updateDebugOverlay();
    } else {
      const debug = document.getElementById('debugOverlay');
      if (debug) {
        debug.classList.remove('show');
      }
    }

    this.updateLeaderboard();

    this.renderer.render(this.scene, this.camera);
  }
}

const game = new GameEngine();
game.init().catch(error => {
  console.error('❌ Init failed:', error);
  alert(`Failed! ${error.message}`);
});
