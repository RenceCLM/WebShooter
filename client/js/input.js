// Input Manager - Handles keyboard and mouse input
class InputManager {
  constructor() {
    this.keys = {};
    this.mouseDown = false;
    this.mouseDelta = { x: 0, y: 0 };
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.debugMode = false;
    this.isMobile = window.matchMedia('(pointer: coarse)').matches || /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
    this.mobileMoveVector = { x: 0, z: 0 };
    this.leftTouchId = null;
    this.rightTouchId = null;
    this.leftTouchOrigin = { x: 0, y: 0 };
    this.rightLastTouch = { x: 0, y: 0 };
    this.joystickMaxDistance = 40;
    this.lookSensitivity = 0.002;

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

    this.setupMobileTouchControls();

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

  setupMobileTouchControls() {
    const leftZone = document.getElementById('mobileLeftZone');
    const rightZone = document.getElementById('mobileRightZone');
    const leftJoystick = document.getElementById('leftJoystick');
    const leftJoystickKnob = document.getElementById('leftJoystickKnob');

    if (!leftZone || !rightZone || !leftJoystick || !leftJoystickKnob) {
      return;
    }

    const findTouchById = (touchList, id) => {
      for (let i = 0; i < touchList.length; i += 1) {
        if (touchList[i].identifier === id) {
          return touchList[i];
        }
      }
      return null;
    };

    const updateLeftJoystick = (touch) => {
      const rawX = touch.clientX - this.leftTouchOrigin.x;
      const rawY = touch.clientY - this.leftTouchOrigin.y;
      const distance = Math.hypot(rawX, rawY);
      const scale = distance > this.joystickMaxDistance ? this.joystickMaxDistance / distance : 1;
      const offsetX = rawX * scale;
      const offsetY = rawY * scale;

      this.mobileMoveVector.x = offsetX / this.joystickMaxDistance;
      this.mobileMoveVector.z = -offsetY / this.joystickMaxDistance;
      leftJoystickKnob.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
    };

    const resetLeftJoystick = () => {
      this.leftTouchId = null;
      this.mobileMoveVector.x = 0;
      this.mobileMoveVector.z = 0;
      leftJoystick.classList.remove('show');
      leftJoystickKnob.style.transform = 'translate(-50%, -50%)';
    };

    leftZone.addEventListener('touchstart', (event) => {
      if (this.leftTouchId !== null || event.changedTouches.length === 0) {
        return;
      }

      event.preventDefault();
      const touch = event.changedTouches[0];
      this.leftTouchId = touch.identifier;
      this.leftTouchOrigin.x = touch.clientX;
      this.leftTouchOrigin.y = touch.clientY;
      leftJoystick.style.left = `${touch.clientX}px`;
      leftJoystick.style.top = `${touch.clientY}px`;
      leftJoystick.classList.add('show');
      updateLeftJoystick(touch);
    }, { passive: false });

    leftZone.addEventListener('touchmove', (event) => {
      if (this.leftTouchId === null) {
        return;
      }

      const touch = findTouchById(event.touches, this.leftTouchId);
      if (!touch) {
        return;
      }

      event.preventDefault();
      updateLeftJoystick(touch);
    }, { passive: false });

    const handleLeftRelease = (event) => {
      if (this.leftTouchId === null) {
        return;
      }

      const released = findTouchById(event.changedTouches, this.leftTouchId);
      if (!released) {
        return;
      }

      event.preventDefault();
      resetLeftJoystick();
    };

    leftZone.addEventListener('touchend', handleLeftRelease, { passive: false });
    leftZone.addEventListener('touchcancel', handleLeftRelease, { passive: false });

    rightZone.addEventListener('touchstart', (event) => {
      if (this.rightTouchId !== null || event.changedTouches.length === 0) {
        return;
      }

      event.preventDefault();
      const touch = event.changedTouches[0];
      this.rightTouchId = touch.identifier;
      this.rightLastTouch.x = touch.clientX;
      this.rightLastTouch.y = touch.clientY;
    }, { passive: false });

    rightZone.addEventListener('touchmove', (event) => {
      if (this.rightTouchId === null) {
        return;
      }

      const touch = findTouchById(event.touches, this.rightTouchId);
      if (!touch) {
        return;
      }

      event.preventDefault();
      this.mouseDelta.x += touch.clientX - this.rightLastTouch.x;
      this.mouseDelta.y += touch.clientY - this.rightLastTouch.y;
      this.rightLastTouch.x = touch.clientX;
      this.rightLastTouch.y = touch.clientY;
    }, { passive: false });

    const handleRightRelease = (event) => {
      if (this.rightTouchId === null) {
        return;
      }

      const released = findTouchById(event.changedTouches, this.rightTouchId);
      if (!released) {
        return;
      }

      event.preventDefault();
      this.rightTouchId = null;
    };

    rightZone.addEventListener('touchend', handleRightRelease, { passive: false });
    rightZone.addEventListener('touchcancel', handleRightRelease, { passive: false });
  }

  isMoving() {
    const mobileMoving = Math.abs(this.mobileMoveVector.x) > 0.01 || Math.abs(this.mobileMoveVector.z) > 0.01;
    return this.keys['w'] || this.keys['a'] || this.keys['s'] || this.keys['d'] || mobileMoving;
  }

  getMovementDirection() {
    const direction = { x: this.mobileMoveVector.x, z: this.mobileMoveVector.z };

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
    const sensitivity = document.pointerLockElement
      ? this.lookSensitivity * 1.5
      : this.lookSensitivity;
    return {
      x: this.mouseDelta.y * sensitivity,
      y: this.mouseDelta.x * sensitivity
    };
  }

  setLookSensitivity(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    this.lookSensitivity = parsed;
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
