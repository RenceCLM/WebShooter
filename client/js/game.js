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
    this.controlsVisible = true;
    
    // Death/Kill - CRITICAL
    this.isDead = false;
    this.seenKills = new Set();
    this.deathScreenShown = false;
    this.pendingKillerName = null;
    
    // Player name
    this.playerName = null;
    this.serverConfig = {
      arenaHalfSize: 80,
      shootCooldownMs: 100,
      maxHealth: 100
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

    playerManager.setScene(this.scene);
    playerManager.setCamera(this.camera);
    console.log('✅ Game ready');
    console.log('========== GAME INIT DONE ==========\n');

    this.gameLoop();
    window.addEventListener('resize', () => this.onWindowResize());
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
        this.serverConfig = message.config;
        this.shootCooldown = message.config.shootCooldownMs;
      }
    });

    network.on('gameState', (message) => {
      const state = message.state;
      const players = state.players || [];
      const bullets = state.bullets || [];
      const kills = state.kills || [];
      this.lastStatePlayers = players;
      this.lastKills = kills;

      // Log every gameState
      console.log(`\n[gameState] Players: ${players.length}, Bullets: ${bullets.length}, Kills: ${kills.length}`);
      
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
              const killerName = this.pendingKillerName || player.lastKillerName || 'Unknown';
              if (!this.deathScreenShown) {
                this.displayDeathScreen(killerName);
              }
            }
          } else {
            if (this.isDead) {
              console.log(`♻️  WE RESPAWNED (health: ${player.health})`);
              this.isDead = false;
              this.deathScreenShown = false;
              this.pendingKillerName = null;
            }
          }

          if (playerManager.localPlayer) {
            playerManager.localPlayer.position = player.position;
            playerManager.localPlayer.health = player.health;
            playerManager.localPlayer.score = player.score;
            playerManager.localPlayer.color = player.color;
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
            player.score
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
        console.log('\n🔴🔴🔴 KILLS RECEIVED 🔴🔴🔴');
        console.log(JSON.stringify(kills, null, 2));

        for (const kill of kills) {
          const killKey = `${kill.killerId}|${kill.victimId}|${kill.timestamp}`;
          
          if (this.seenKills.has(killKey)) {
            console.log(`   ⏭️  Already saw this kill: ${killKey}`);
            continue;
          }

          this.seenKills.add(killKey);
          console.log(`\n✅ NEW KILL DETECTED: ${kill.killer} → ${kill.victim}`);
          console.log(`   Killer ID: ${kill.killerId}`);
          console.log(`   Victim ID: ${kill.victimId}`);
          console.log(`   My ID:     ${network.playerId}`);

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
      const controls = document.getElementById('instructions');
      if (controls) {
        controls.style.display = this.controlsVisible ? 'block' : 'none';
      }
    });
  }

  setupMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    if (!menu) {
      return;
    }

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
    let html = '<div class="leaderboard-title">Kills / Deaths<span>Hold TAB to view</span></div>';
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

    // Show game over screen
    nameEl.textContent = killerName;
    screen.classList.add('show');
    screen.style.display = 'flex';
    this.deathScreenShown = true;
    
    // Hide game elements
    if (hud) hud.style.display = 'none';
    if (gameContainer) gameContainer.style.display = 'none';

    console.log(`✅ Death screen shown - waiting for respawn key`);

    // One-time respawn listener
    const respawn = () => {
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
      
      screen.classList.remove('show');
      screen.style.display = 'none';
      if (hud) hud.style.display = 'block';
      if (gameContainer) gameContainer.style.display = 'block';
      this.isDead = false;
      this.deathScreenShown = false;
      this.pendingKillerName = null;
      document.removeEventListener('keydown', respawn);
      document.removeEventListener('mousedown', respawn);
    };

    document.addEventListener('keydown', respawn);
    document.addEventListener('mousedown', respawn);
  }

  displayKillFeed(killer, victim) {
    console.log(`📢 Showing kill feed: ${killer} killed ${victim}`);

    const notif = document.createElement('div');
    notif.className = 'kill-notification';
    notif.innerHTML = `<span class="killer-name">${killer}</span> killed <span class="victim-name">${victim}</span> <span class="points">+10</span>`;

    document.body.appendChild(notif);
    console.log(`✅ Kill feed added to DOM`);

    setTimeout(() => {
      notif.classList.add('fadeOut');
      setTimeout(() => {
        notif.remove();
        console.log(`   Kill feed removed`);
      }, 500);
    }, 3000);
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

    player.position.x += (forward.x * moveDir.z + right.x * moveDir.x) * speed;
    player.position.z += (forward.z * moveDir.z + right.z * moveDir.x) * speed;

    const maxBounds = this.serverConfig.arenaHalfSize;
    player.position.x = Math.max(-maxBounds, Math.min(maxBounds, player.position.x));
    player.position.z = Math.max(-maxBounds, Math.min(maxBounds, player.position.z));
    player.position.y = 1;

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
      network.sendMove(player.position, player.rotation);
    }

    if (wantsShoot) {
      this.shoot();
      this.lastShotTime = now;
    }
  }

  shoot() {
    network.sendShoot();
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
