// Input Manager - Handles keyboard and mouse input
class InputManager {
  constructor() {
    this.keys = {};
    this.mouseDown = false;
    this.mouseDelta = { x: 0, y: 0 };
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.debugMode = false;

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Keyboard events
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    // Mouse events for looking around (with pointer lock support)
    document.addEventListener('mousemove', (e) => {
      // Use movementX/Y if pointer is locked, otherwise use client coordinates
      if (document.pointerLockElement) {
        this.mouseDelta.x = e.movementX || 0;
        this.mouseDelta.y = e.movementY || 0;
      } else {
        this.mouseDelta.x = e.clientX - this.lastMouseX;
        this.mouseDelta.y = e.clientY - this.lastMouseY;
      }

      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    // Mouse click for shooting
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // Left click
        this.mouseDown = true;
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouseDown = false;
      }
    });

    // Lock pointer with 'L' key
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'l') {
        document.body.requestPointerLock = document.body.requestPointerLock || document.body.mozRequestPointerLock;
        if (document.body.requestPointerLock) {
          document.body.requestPointerLock();
        }
      }
    });

    // Space for shooting (alternative)
    window.addEventListener('keydown', (e) => {
      if (e.key === ' ') {
        e.preventDefault();
        this.mouseDown = true;
      }
      // Toggle debug mode with F3
      if (e.key === 'F3') {
        e.preventDefault();
        this.debugMode = !this.debugMode;
        console.log('Debug mode:', this.debugMode ? 'ON' : 'OFF');
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === ' ') {
        e.preventDefault();
        this.mouseDown = false;
      }
    });

    // Mobile touch controls
    const dpadButtons = document.querySelectorAll('.dpad-btn');
    dpadButtons.forEach((button) => {
      const dir = button.getAttribute('data-dir');
      if (!dir) {
        return;
      }
      const press = (event) => {
        event.preventDefault();
        this.keys[dir] = true;
      };
      const release = (event) => {
        event.preventDefault();
        this.keys[dir] = false;
      };
      button.addEventListener('touchstart', press, { passive: false });
      button.addEventListener('touchend', release, { passive: false });
      button.addEventListener('touchcancel', release, { passive: false });
    });

    const fireButton = document.getElementById('mobileFire');
    if (fireButton) {
      const fireDown = (event) => {
        event.preventDefault();
        this.mouseDown = true;
      };
      const fireUp = (event) => {
        event.preventDefault();
        this.mouseDown = false;
      };
      fireButton.addEventListener('touchstart', fireDown, { passive: false });
      fireButton.addEventListener('touchend', fireUp, { passive: false });
      fireButton.addEventListener('touchcancel', fireUp, { passive: false });
    }
  }

  isMoving() {
    return this.keys['w'] || this.keys['a'] || this.keys['s'] || this.keys['d'];
  }

  getMovementDirection() {
    const direction = { x: 0, z: 0 };

    if (this.keys['w']) direction.z += 1;  // W = forward
    if (this.keys['s']) direction.z -= 1;  // S = backward
    if (this.keys['a']) direction.x -= 1;  // A = left
    if (this.keys['d']) direction.x += 1;  // D = right

    // Normalize diagonal movement
    const length = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
    if (length > 0) {
      direction.x /= length;
      direction.z /= length;
    }

    return direction;
  }

  getMouseRotation() {
    // Lower sensitivity for smoother controls
    const sensitivity = document.pointerLockElement ? 0.003 : 0.002;
    return {
      x: this.mouseDelta.y * sensitivity,
      y: this.mouseDelta.x * sensitivity
    };
  }

  resetMouseDelta() {
    this.mouseDelta = { x: 0, y: 0 };
  }

  isShooting() {
    return this.mouseDown;
  }
}

// Global input manager
const input = new InputManager();
