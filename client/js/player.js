// Player management
class PlayerManager {
  constructor() {
    this.localPlayer = null;
    this.remotePlayers = new Map();
    this.playerMeshes = new Map();
    this.healthBars = new Map();
    this.nameLabels = new Map(); // Store name label objects
    this.scene = null;
    this.camera = null;
    this._tempQuat = new THREE.Quaternion();
    this._tempQuatInv = new THREE.Quaternion();
  }

  setScene(scene) {
    this.scene = scene;
  }

  setCamera(camera) {
    this.camera = camera;
  }

  createLocalPlayer(playerId, initialPosition, nameOverride) {
    const name = nameOverride || NameGenerator.generate();
    this.localPlayer = {
      id: playerId,
      name: name,
      color: null,
      position: { ...initialPosition },
      rotation: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      health: 100,
      score: 0,
      camera: null
    };
  }

  addRemotePlayer(playerId, name, position) {
    const player = {
      id: playerId,
      name: name,
      color: null,
      position: { ...position },
      rotation: { x: 0, y: 0, z: 0 },
      health: 100,
      score: 0,
      mesh: null
    };

    this.remotePlayers.set(playerId, player);
    this.createPlayerMesh(playerId, player);

    return player;
  }

  createPlayerMesh(playerId, player) {
    const geometry = new THREE.ConeGeometry(1, 2, 8);
    const material = new THREE.MeshStandardMaterial({
      color: player.color || 0x0088FF
    });
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(player.position.x, player.position.y, player.position.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    this.scene.add(mesh);
    this.playerMeshes.set(playerId, mesh);

    // Create health bar
    const healthBarGeometry = new THREE.PlaneGeometry(2, 0.1);
    const healthBarMaterial = new THREE.MeshBasicMaterial({
      color: 0x00CCFF,
      side: THREE.DoubleSide
    });
    const healthBar = new THREE.Mesh(healthBarGeometry, healthBarMaterial);
    healthBar.position.y = 2.5;
    mesh.add(healthBar);
    this.healthBars.set(playerId, { mesh: healthBar, fullWidth: 2 });

    // Create name label above player
    this.createNameLabel(playerId, player.name, mesh);
  }

  createNameLabel(playerId, name, playerMesh) {
    // Create canvas texture for name
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Draw background
    ctx.fillStyle = 'rgba(10, 14, 39, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw border
    ctx.strokeStyle = '#FF8800';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

    // Draw text
    ctx.font = 'bold 40px Arial';
    ctx.fillStyle = '#00CCFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);

    // Position above player's head
    sprite.position.y = 3.2;
    sprite.scale.set(3, 0.75, 1);

    playerMesh.add(sprite);
    this.nameLabels.set(playerId, sprite);
  }

  updateRemotePlayer(playerId, name, color, position, rotation, health, score) {
    const player = this.remotePlayers.get(playerId);
    if (player) {
      if (color && player.color !== color) {
        player.color = color;
        const meshForColor = this.playerMeshes.get(playerId);
        if (meshForColor) {
          meshForColor.material.color.setHex(color);
        }
      }
      if (name && player.name !== name) {
        player.name = name;
        const meshForLabel = this.playerMeshes.get(playerId);
        const oldLabel = this.nameLabels.get(playerId);
        if (meshForLabel && oldLabel) {
          meshForLabel.remove(oldLabel);
        }
        this.nameLabels.delete(playerId);
        if (meshForLabel) {
          this.createNameLabel(playerId, name, meshForLabel);
        }
      }
      player.position = { ...position };
      player.rotation = { ...rotation };
      player.health = health;
      player.score = score;

      if (health <= 0) {
        const deadMesh = this.playerMeshes.get(playerId);
        if (deadMesh) {
          this.scene.remove(deadMesh);
          this.playerMeshes.delete(playerId);
        }

        this.healthBars.delete(playerId);
        this.nameLabels.delete(playerId);
        return;
      }

      if (!this.playerMeshes.has(playerId)) {
        this.createPlayerMesh(playerId, player);
      }

      const mesh = this.playerMeshes.get(playerId);
      if (mesh) {
        mesh.position.set(position.x, position.y, position.z);
        mesh.rotation.x = rotation.x;
        mesh.rotation.y = rotation.y;
        mesh.rotation.z = rotation.z;

        // Update health bar
        const healthBarData = this.healthBars.get(playerId);
        if (healthBarData) {
          const healthPercent = Math.max(0, health / 100);
          healthBarData.mesh.scale.x = healthPercent;
          healthBarData.mesh.material.color.setHex(
            healthPercent > 0.5 ? 0x00CCFF : healthPercent > 0.25 ? 0xFF8800 : 0xFF3300
          );
        }
      }
    }
  }

  updateBillboards() {
    if (!this.camera) {
      return;
    }

    for (const [playerId, mesh] of this.playerMeshes) {
      const healthBarData = this.healthBars.get(playerId);
      if (healthBarData) {
        mesh.getWorldQuaternion(this._tempQuatInv).invert();
        this._tempQuat.copy(this.camera.quaternion);
        healthBarData.mesh.quaternion.copy(this._tempQuatInv.multiply(this._tempQuat));
      }
    }
  }

  removeRemotePlayer(playerId) {
    const mesh = this.playerMeshes.get(playerId);
    if (mesh) {
      this.scene.remove(mesh);
      this.playerMeshes.delete(playerId);
    }

    const healthBarData = this.healthBars.get(playerId);
    if (healthBarData) {
      this.scene.remove(healthBarData.mesh);
      this.healthBars.delete(playerId);
    }

    const nameLabel = this.nameLabels.get(playerId);
    if (nameLabel) {
      this.scene.remove(nameLabel);
      this.nameLabels.delete(playerId);
    }

    this.remotePlayers.delete(playerId);
  }

  getLocalPlayer() {
    return this.localPlayer;
  }

  getRemotePlayer(playerId) {
    return this.remotePlayers.get(playerId);
  }

  getAllPlayers() {
    const all = [this.localPlayer];
    for (const player of this.remotePlayers.values()) {
      all.push(player);
    }
    return all;
  }

  getTotalPlayerCount() {
    return 1 + this.remotePlayers.size;
  }
}

const playerManager = new PlayerManager();
