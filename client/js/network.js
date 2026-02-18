// WebSocket Network Management
class NetworkManager {
  constructor() {
    this.ws = null;
    this.playerId = null;
    this.isConnected = false;
    this.onMessageHandlers = {};
  }

  connect() {
    return new Promise((resolve, reject) => {
      const banner = document.getElementById('connectionBanner');
      const setBanner = (connected) => {
        if (!banner) return;
        if (connected) {
          banner.classList.remove('show');
        } else {
          banner.textContent = 'DISCONNECTED';
          banner.classList.add('show');
        }
      };

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}`;
      
      console.log(`🔌 Attempting to connect to: ${url}`);
      
      this.ws = new WebSocket(url);
      
      // Set timeout for connection
      const connectionTimeout = setTimeout(() => {
        console.error('❌ WebSocket connection timeout');
        reject(new Error('Connection timeout - server may not be running'));
      }, 5000);

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('✅ Connected to server');
        this.isConnected = true;
        setBanner(true);
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout);
        console.error('❌ WebSocket error:', error);
        this.isConnected = false;
        setBanner(false);
        reject(error);
      };

      this.ws.onclose = () => {
        clearTimeout(connectionTimeout);
        console.log('⚠️ Disconnected from server');
        this.isConnected = false;
        setBanner(false);
      };
    });
  }

  handleMessage(message) {
    if (message.type !== 'gameState' && message.type !== 'debugState') {
      console.log('📨 Received message type:', message.type);
    }
    
    if (message.type === 'joinResponse') {
      console.log('✅ Joined server');
    }

    // Call registered handlers
    if (this.onMessageHandlers[message.type]) {
      this.onMessageHandlers[message.type](message);
    } else {
      console.warn(`⚠️ No handler registered for message type: ${message.type}`);
    }
  }

  on(messageType, handler) {
    this.onMessageHandlers[messageType] = handler;
  }

  sendMessage(type, data) {
    if (this.isConnected) {
      this.ws.send(JSON.stringify({
        type: type,
        ...data
      }));
    }
  }

  sendMove(position, rotation, inputSequence) {
    this.sendMessage('move', {
      position: position,
      rotation: rotation,
      inputSequence: inputSequence
    });
  }

  sendShoot() {
    this.sendMessage('shoot', {});
  }

  sendJoin() {
    this.sendMessage('join', {});
  }

  sendRespawn() {
    this.sendMessage('respawn', {});
  }
}
const network = new NetworkManager();
