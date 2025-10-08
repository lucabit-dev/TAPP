const WebSocket = require('ws');

class ToplistService {
  constructor() {
    this.baseUrl = 'wss://app.chartswatcher.com';
    this.userID = '68a9bba1b2c529407770fddb';
    this.apiKey = '68ac935db2c5294077b0cd51';
    this.configID = '68a9bbebb2c5294077710db4'; // Specific toplist config ID
    this.ws = null;
    this.toplistData = [];
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000; // 5 seconds
    this.toplistListeners = [];
    this.statusListeners = [];
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const wsUrl = `${this.baseUrl}/api/v1/websocket?user_id=${this.userID}&api_key=${this.apiKey}`;
      
      console.log('🔌 Connecting to ChartsWatcher Toplist WebSocket...');
      console.log('URL:', wsUrl);
      console.log('Config ID:', this.configID);
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.on('open', () => {
        console.log('✅ Connected to ChartsWatcher Toplist WebSocket');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // Subscribe to toplist for the specific config
        this.subscribeToToplist();
        resolve();
      });
      
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing Toplist WebSocket message:', error);
        }
      });
      
      this.ws.on('close', (code, reason) => {
        console.log(`❌ Toplist WebSocket connection closed. Code: ${code}, Reason: ${reason}`);
        this.isConnected = false;
        this.handleReconnect();
      });
      
      this.ws.on('error', (error) => {
        console.error('❌ Toplist WebSocket error:', error);
        reject(error);
      });
      
      // Set a timeout for connection
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('Toplist WebSocket connection timeout'));
        }
      }, 10000); // 10 second timeout
    });
  }

  subscribeToToplist() {
    if (!this.isConnected || !this.ws) {
      console.error('Cannot subscribe to toplist: WebSocket not connected');
      return;
    }

    const subscribeMessage = {
      "@type": "Toplist",
      "config_id": this.configID,
      "action": "subscribe"
    };

    console.log('📡 Subscribing to toplist for config:', this.configID);
    this.ws.send(JSON.stringify(subscribeMessage));
  }

  unsubscribeFromToplist() {
    if (!this.isConnected || !this.ws) {
      return;
    }

    const unsubscribeMessage = {
      "@type": "Toplist",
      "config_id": this.configID,
      "action": "unsubscribe"
    };

    console.log('📡 Unsubscribing from toplist for config:', this.configID);
    this.ws.send(JSON.stringify(unsubscribeMessage));
  }

  handleMessage(message) {
    console.log('📨 Received toplist message:', message['@type']);

    switch (message['@type']) {
      case 'ToplistConfirm':
        this.handleToplistConfirm(message);
        break;
      case 'ToplistUpdate':
        this.handleToplistUpdate(message);
        break;
      default:
        console.log('Unknown toplist message type:', message['@type']);
    }
  }

  handleToplistConfirm(message) {
    if (message.success) {
      console.log(`✅ Toplist ${message.action} successful: ${message.msg}`);
      if (message.action === 'subscribe') {
        console.log('📊 Column descriptions:', message.column_desc);
      }
    } else {
      console.error('❌ Toplist action failed:', message.msg);
    }
  }

  handleToplistUpdate(message) {
    if (message.config_id !== this.configID) {
      console.log('Ignoring toplist update for different config:', message.config_id);
      return;
    }

    console.log('📊 New toplist update received:', message.rows?.length || 0, 'rows');
    
    // Store the toplist data
    this.toplistData = message.rows || [];
    
    // Notify toplist listeners
    this.notifyToplistListeners(message);
    
    console.log(`📈 Total toplist rows: ${this.toplistData.length}`);
  }

  handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max toplist reconnection attempts reached. Giving up.');
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 Attempting to reconnect toplist (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectDelay/1000} seconds...`);

    setTimeout(() => {
      this.connect().catch(error => {
        console.error('Toplist reconnection failed:', error);
      });
    }, this.reconnectDelay);
  }

  async fetchToplistData() {
    // If we have toplist data from WebSocket, return it
    if (this.toplistData.length > 0) {
      console.log(`📊 Returning ${this.toplistData.length} toplist rows from WebSocket`);
      return [...this.toplistData]; // Return a copy
    }

    // If not connected, try to connect
    if (!this.isConnected) {
      try {
        await this.connect();
        // Wait a bit for toplist data to come in
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('Failed to connect to ChartsWatcher Toplist WebSocket:', error);
        throw new Error('Unable to connect to ChartsWatcher Toplist WebSocket. Please check credentials and network connection.');
      }
    }

    return [...this.toplistData]; // Return a copy
  }

  disconnect() {
    if (this.ws) {
      this.unsubscribeFromToplist();
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
      console.log('🔌 Disconnected from ChartsWatcher Toplist WebSocket');
    }
  }

  // Method to get connection status
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      toplistRowCount: this.toplistData.length,
      configID: this.configID
    };
  }

  // Event listener methods
  onToplistUpdate(listener) {
    this.toplistListeners.push(listener);
  }

  onStatusChange(listener) {
    this.statusListeners.push(listener);
  }

  // Notify toplist listeners
  notifyToplistListeners(toplistUpdate) {
    this.toplistListeners.forEach(listener => {
      try {
        listener(toplistUpdate);
      } catch (error) {
        console.error('Error in toplist listener:', error);
      }
    });
  }

  // Notify status listeners
  notifyStatusListeners(status) {
    this.statusListeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        console.error('Error in status listener:', error);
      }
    });
  }
}

module.exports = ToplistService;


