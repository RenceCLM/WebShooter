// Main Game Engine - Focused on Death/Kill System
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
    
    // Death/Kill tracking
    this.isPlayerDead = false;
    this.lastProcessedKills = new Set(); // Track which kills we've shown
  }

  async init() {
    console.log('🎮 Initializing game...');
    await network.connect();
    console.log('✅ WebSocket connected');
    
    // Wait for player ID
    await new Promise(resolve => {
      const checkId = setInterval(() => {
        if (network.playerId) {
          clearInterval(checkId);
          console.log('✅ Player ID:', network.playerId.substring(0, 8));
          resolve();
        }
      }, 50);
      setTimeout(() => clearInterval(checkId), 5000);
    });

    this.setupScene();
    this.setupNetworkHandlers();

    playerManager.setScene(this.scene);
    playerManager.createLocalPlayer(network.playerId, { x: 0, y: 1, z: 0 });
    console.log('✅ Local player created: ' + playerManager.localPlayer.name);

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
  }

  setupNetworkHandlers() {
    // Main game state handler
    network.on('gameState', (message) => {
      const { players, bullets, kills } = message.state;
      
      console.log(`📊 GameState: ${players.length} players, ${bullets.length} bullets, ${kills.length} kills`);
      
      // Store bullets for rendering
      this.serverBullets = bullets || [];

      // Update player states
      const remoteIds = new Set();
      for (const player of players) {
        if (player.id === network.playerId) {
          // Check if WE are dead
          if (player.health <= 0 && !this.isPlayerDead) {
            console.log(`⚠️  WE DIED - Health: ${player.health}`);
            this.isPlayerDead = true;
          } else if (player.health > 0 && this.isPlayerDead) {
            console.log(`✨ WE RESPAWNED - Health: ${player.health}`);
            this.isPlayerDead = false;
            this.lastProcessedKills.clear(); // Reset kills when respawning
          }

          // Update local player
          if (playerManager.localPlayer) {
            playerManager.localPlayer.position = player.position;
            playerManager.localPlayer.health = player.health;
            playerManager.localPlayer.score = player.score;
          }
        } else {
          // Remote player
          remoteIds.add(player.id);
          if (!playerManager.remotePlayers.has(player.id)) {
            playerManager.addRemotePlayer(player.id, player.name, player.position);
          }
          playerManager.updateRemotePlayer(player.id, player.position, player.rotation, player.health, player.score);
        }
      }

      // Remove disconnected players
      for (const [playerId] of playerManager.remotePlayers) {
        if (!remoteIds.has(playerId)) {
          playerManager.removeRemotePlayer(playerId);
        }
      }

      // Process kills - THIS IS CRITICAL
      if (kills && kills.length > 0) {
        console.log(`🔴 Processing ${kills.length} kills:`, kills);
        
        for (const kill of kills) {
          const killKey = `${kill.killerId}-${kill.victimId}`; // Unique kill ID
          
          // Skip if we already processed this kill
          if (this.lastProcessedKills.has(killKey)) {
            console.log(`⏭️  Already processed kill: ${kill.killer} → ${kill.victim}`);
            continue;
          }
          
          this.lastProcessedKills.add(killKey);
          console.log(`✅ NEW KILL: ${kill.killer} → ${kill.victim}`);
          
          // Show kill notification for all kills
          this.showKillNotification(kill.killer, kill.victim);
          
          // If WE were the victim, show death screen
          if (kill.victimId === network.playerId) {
            console.log(`❌ WE WERE KILLED by ${kill.killer}!`);
            this.showDeathScreen(kill.killer);
          }
          
          // If WE were the killer, show local feedback
          if (kill.killerId === network.playerId) {
            console.log(`✨ WE KILLED ${kill.victim}!`);
          }
        }
      }
    });

    network.on('playerJoined', (message) => {
      console.log('👥 Players online: ' + message.players.length);
    });

    network.on('playerLeft', (message) => {
      playerManager.removeRemotePlayer(message.playerId);
    });
  }

  syncBullets() {
    const serverBulletIds = new Set(this.serverBullets.map(b => b.id));

    // Remove bullets that no longer exist
    for (const [bulletId, bulletObj] of this.bullets) {
      if (!serverBulletIds.has(bulletId)) {
        this.scene.remove(bulletObj.mesh);
        if (bulletObj.light) this.scene.remove(bulletObj.light);
        this.bullets.delete(bulletId);
      }
    }

    // Add new bullets and update positions
    for (const bulletData of this.serverBullets) {
      if (!this.bullets.has(bulletData.id)) {
        this.createBullet(bulletData);
      } else {
        const bulletObj = this.bullets.get(bulletData.id);
        bulletObj.mesh.position.set(bulletData.position.x, bulletData.position.y, bulletData.position.z);
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

    // If we're dead, don't process movement
    if (this.isPlayerDead) {
      return;
    }

    const now = Date.now();
    const deltaTime = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;

    const moveDir = input.getMovementDirection();
    const speed = 50 * deltaTime;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);

    player.position.x += (forward.x * moveDir.z + right.x * moveDir.x) * speed;
    player.position.z += (forward.z * moveDir.z + right.z * moveDir.x) * speed;

    const maxBounds = 80;
    player.position.x = Math.max(-maxBounds, Math.min(maxBounds, player.position.x));
    player.position.z = Math.max(-maxBounds, Math.min(maxBounds, player.position.z));
    player.position.y = 1;

    this.camera.position.x = player.position.x;
    this.camera.position.y = player.position.y + 0.6;
    this.camera.position.z = player.position.z;

    const mouseRot = input.getMouseRotation();
    player.rotation.x -= mouseRot.x;
    player.rotation.y -= mouseRot.y;
    player.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.rotation.x));

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = player.rotation.y;
    this.camera.rotation.x = player.rotation.x;

    input.resetMouseDelta();

    if (input.isShooting() && now - this.lastShotTime > this.shootCooldown) {
      this.shoot();
      this.lastShotTime = now;
    }

    if (input.isMoving() || input.isShooting()) {
      network.sendMove(player.position, player.rotation);
    }
  }

  shoot() {
    const player = playerManager.localPlayer;
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    network.sendShoot(
      { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      { x: direction.x, y: direction.y, z: direction.z }
    );
  }

  showDeathScreen(killerName) {
    console.log(`🎬 SHOWING DEATH SCREEN: Killed by ${killerName}`);
    
    const killScreen = document.getElementById('killScreen');
    const killerNameEl = document.getElementById('killerName');
    
    if (killerNameEl) killerNameEl.textContent = killerName;
    
    // Show screen
    killScreen.classList.add('show');
    killScreen.style.pointerEvents = 'auto'; // Make clickable

    // Create or update hint
    let hint = killScreen.querySelector('.respawn-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'respawn-hint';
      killScreen.appendChild(hint);
    }
    hint.textContent = 'Press any key to respawn...';

    // One-time respawn handler
    const respawnHandler = (e) => {
      console.log(`🔄 Respawn triggered by: ${e.type}`);
      killScreen.classList.remove('show');
      killScreen.style.pointerEvents = 'none';
      document.removeEventListener('keydown', respawnHandler);
      document.removeEventListener('mousedown', respawnHandler);
    };

    document.addEventListener('keydown', respawnHandler);
    document.addEventListener('mousedown', respawnHandler);
  }

  showKillNotification(killerName, victimName) {
    console.log(`🎯 KILL NOTIFICATION: ${killerName} killed ${victimName}`);
    
    const notification = document.createElement('div');
    notification.className = 'kill-notification';
    notification.innerHTML = `<span class="killer-name">${killerName}</span> killed <span class="victim-name">${victimName}</span> <span class="points">+10</span>`;
    
    document.body.appendChild(notification);
    console.log('📢 Kill notification added to DOM');

    setTimeout(() => {
      notification.classList.add('fadeOut');
      setTimeout(() => {
        notification.remove();
        console.log('📢 Kill notification removed');
      }, 500);
    }, 3000);
  }

  onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  updateDebugOverlay() {
    const debugOverlay = document.getElementById('debugOverlay');
    debugOverlay.classList.add('show');

    let html = '<h3>🐛 DEBUG (F3)</h3>';
    
    html += '<div class="debug-section"><strong>Network:</strong>';
    html += `<div>Connected: ${network.isConnected ? '✅' : '❌'}</div>`;
    html += `<div>My ID: ${network.playerId ? network.playerId.substring(0, 8) : '?'}</div>`;
    html += `<div>Status: ${this.isPlayerDead ? '💀 DEAD' : '✅ ALIVE'}</div>`;
    html += '</div>';

    const player = playerManager.localPlayer;
    if (player) {
      html += '<div class="debug-section"><strong>Local Player:</strong>';
      html += `<div>Name: ${player.name}</div>`;
      html += `<div>Health: ${player.health | 0}</div>`;
      html += `<div>Score: ${player.score | 0}</div>`;
      html += `<div>Pos: (${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}, ${player.position.z.toFixed(1)})</div>`;
      html += '</div>';
    }

    html += `<div class="debug-section"><strong>Remote Players (${playerManager.remotePlayers.size}):</strong>`;
    for (const [id, p] of playerManager.remotePlayers) {
      const healthColor = p.health > 50 ? '🟢' : p.health > 0 ? '🟡' : '🔴';
      html += `<div>${healthColor} ${p.name} - HP: ${p.health | 0}</div>`;
    }
    html += '</div>';

    html += `<div class="debug-section"><strong>Bullets: ${this.bullets.size}</strong>`;
    html += `<div>Server count: ${this.serverBullets.length}</div>`;
    html += '</div>';

    debugOverlay.innerHTML = html;
  }

  gameLoop() {
    requestAnimationFrame(() => this.gameLoop());

    this.update();
    this.syncBullets();
    this.updateHUD();

    if (input.debugMode) {
      this.updateDebugOverlay();
    }

    this.renderer.render(this.scene, this.camera);
  }
}

const game = new GameEngine();
game.init().catch(error => {
  console.error('❌ Failed to initialize game:', error);
  alert(`Failed to connect!\n\nError: ${error.message}\n\nMake sure server is running: npm start`);
});
