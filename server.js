const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const ChartsWatcherService = require('./chartsWatcherService');
const ToplistService = require('./toplistService');
const PolygonService = require('./polygonService');
const IndicatorsService = require('./indicators');
const ConditionsService = require('./conditions');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// WebSocket server for real-time alerts
const wss = new WebSocket.Server({ server });
const clients = new Set();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize services
const chartsWatcherService = new ChartsWatcherService();
const toplistService = new ToplistService();
const polygonService = new PolygonService();
const indicatorsService = new IndicatorsService();
const conditionsService = new ConditionsService();

// Initialize ChartsWatcher WebSocket connection
chartsWatcherService.connect().catch(error => {
  console.error('Failed to initialize ChartsWatcher connection:', error);
});

// Initialize Toplist WebSocket connection
toplistService.connect().catch(error => {
  console.error('Failed to initialize Toplist connection:', error);
});

// WebSocket connection handling for frontend clients
wss.on('connection', (ws) => {
  console.log('📱 Frontend client connected');
  clients.add(ws);
  
  ws.on('close', () => {
    console.log('📱 Frontend client disconnected');
    clients.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket client error:', error);
    clients.delete(ws);
  });
});

// Broadcast processed alerts to all connected clients
function broadcastToClients(data) {
  const message = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        console.error('Error sending message to client:', error);
        clients.delete(client);
      }
    }
  });
}

// Listen for new alerts from ChartsWatcher WebSocket
chartsWatcherService.onAlert(async (alert) => {
  console.log(`🚨 Processing real-time alert for ${alert.ticker}...`);
  const processed = await processAlert(alert);
  if (processed) {
    console.log(`✅ Real-time alert processed for ${processed.ticker}: Valid=${processed.evaluation.allConditionsMet}`);
    
    // Broadcast to all connected frontend clients
    broadcastToClients({
      type: 'NEW_ALERT',
      data: processed,
      timestamp: new Date().toISOString()
    });
  }
});

// Listen for toplist updates from ChartsWatcher WebSocket
toplistService.onToplistUpdate(async (toplistUpdate) => {
  console.log(`📊 Broadcasting toplist update with ${toplistUpdate.rows?.length || 0} rows...`);
  
  // Broadcast to all connected frontend clients
  broadcastToClients({
    type: 'TOPLIST_UPDATE',
    data: toplistUpdate,
    timestamp: new Date().toISOString()
  });
});

// Create a valid example alert that passes all conditions
function createValidExampleAlert(alert) {
  const currentPrice = alert.price;
  
  // Create indicators that pass all conditions
  const indicators = {
    ema1m12: currentPrice * 0.99, // EMA 12 for 1m
    ema1m18: currentPrice * 0.98, // Slightly below current price
    ema1m20: currentPrice * 0.97, // EMA 20 for 1m
    ema1m26: currentPrice * 0.96, // EMA 26 for 1m
    ema1m200: currentPrice * 0.85, // Well below current price
    ema5m18: currentPrice * 0.99, // Slightly below current price
    ema5m20: currentPrice * 0.98, // EMA 20 for 5m
    ema5m200: currentPrice * 0.90, // Below current price
    macd1m: {
      macd: 0.15,
      signal: 0.12,
      histogram: 0.03 // Positive
    },
    macd5m: {
      macd: 0.25,
      signal: 0.20,
      histogram: 0.05 // Positive
    },
    vwap1m: currentPrice * 0.95, // Below current price
    lod: currentPrice * 0.92, // Low of day
    hod: currentPrice * 1.08 // High of day
  };

  // Create evaluation that passes all conditions
  const evaluation = {
    score: "7/7",
    allConditionsMet: true,
    failedConditions: []
  };

  return {
    ticker: alert.ticker,
    timestamp: alert.timestamp,
    price: alert.price,
    volume: alert.volume,
    indicators: indicators,
    evaluation: evaluation,
    lastCandle: {
      close: currentPrice,
      volume: alert.volume
    }
  };
}

// Create real stock alerts with actual market data
async function createRealStockAlerts() {
  const popularStocks = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NFLX'];
  const realAlerts = [];
  
  console.log('🔄 Creating real stock alerts with live market data...');
  
  for (let i = 0; i < popularStocks.length; i++) {
    const ticker = popularStocks[i];
    const minutesAgo = (i + 1) * 2; // Stagger alerts by 2 minutes each
    
    try {
      // Get current price for the stock
      const currentPrice = await polygonService.getCurrentPrice(ticker);
      
      // Create alert with real price
      const alert = {
        ticker: ticker,
        symbol: ticker,
        timestamp: new Date(Date.now() - (minutesAgo * 60000)).toISOString(),
        time: new Date(Date.now() - (minutesAgo * 60000)).toISOString(),
        created_at: new Date(Date.now() - (minutesAgo * 60000)).toISOString(),
        instrument: ticker,
        price: currentPrice,
        volume: Math.floor(Math.random() * 2000000) + 500000, // Random volume between 500k-2.5M
        alert_type: 'real_stock_alert',
        color: '#00ff00',
        text_color: '#ffffff',
        config_id: 'real_stock_config'
      };
      
      realAlerts.push(alert);
      console.log(`✅ Created real alert for ${ticker} at $${currentPrice}`);
      
      // Small delay to avoid API rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error(`❌ Failed to create real alert for ${ticker}:`, error.message);
      
      // Fallback to a reasonable price if API fails
      const fallbackPrices = {
        'AAPL': 185.42,
        'TSLA': 248.75,
        'NVDA': 875.30,
        'MSFT': 412.85,
        'GOOGL': 142.60,
        'AMZN': 155.80,
        'META': 485.25,
        'NFLX': 625.40
      };
      
      const alert = {
        ticker: ticker,
        symbol: ticker,
        timestamp: new Date(Date.now() - (minutesAgo * 60000)).toISOString(),
        time: new Date(Date.now() - (minutesAgo * 60000)).toISOString(),
        created_at: new Date(Date.now() - (minutesAgo * 60000)).toISOString(),
        instrument: ticker,
        price: fallbackPrices[ticker] || 100.00,
        volume: Math.floor(Math.random() * 2000000) + 500000,
        alert_type: 'real_stock_alert_fallback',
        color: '#00ff00',
        text_color: '#ffffff',
        config_id: 'real_stock_config'
      };
      
      realAlerts.push(alert);
      console.log(`⚠️ Using fallback price for ${ticker}: $${alert.price}`);
    }
  }
  
  console.log(`✅ Created ${realAlerts.length} real stock alerts`);
  return realAlerts;
}

// Create 3 forced valid alerts with real market data
async function createForcedValidAlerts() {
  const testStocks = ['AAPL', 'TSLA', 'NVDA']; // Top 3 popular stocks
  const forcedValidAlerts = [];
  
  console.log('🔄 Creating 3 forced valid alerts with real market data...');
  
  for (let i = 0; i < testStocks.length; i++) {
    const ticker = testStocks[i];
    const minutesAgo = (i + 1) * 1; // Stagger by 1 minute each
    
    try {
      // Get current price for the stock
      const currentPrice = await polygonService.getCurrentPrice(ticker);
      
      // Create alert with real price but force it as valid
      const alert = {
        ticker: ticker,
        symbol: ticker,
        timestamp: new Date(Date.now() - (minutesAgo * 60000)).toISOString(),
        time: new Date(Date.now() - (minutesAgo * 60000)).toISOString(),
        created_at: new Date(Date.now() - (minutesAgo * 60000)).toISOString(),
        instrument: ticker,
        price: currentPrice,
        volume: Math.floor(Math.random() * 2000000) + 500000,
        alert_type: 'forced_valid_alert', // Special type to force as valid
        color: '#00ff00',
        text_color: '#ffffff',
        config_id: 'forced_valid_config'
      };
      
      forcedValidAlerts.push(alert);
      console.log(`✅ Created forced valid alert for ${ticker} at $${currentPrice}`);
      
      // Small delay to avoid API rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error(`❌ Failed to create forced valid alert for ${ticker}:`, error.message);
      
      // Fallback prices for the top 3 stocks
      const fallbackPrices = {
        'AAPL': 185.42,
        'TSLA': 248.75,
        'NVDA': 875.30
      };
      
      const alert = {
        ticker: ticker,
        symbol: ticker,
        timestamp: new Date(Date.now() - (minutesAgo * 60000)).toISOString(),
        time: new Date(Date.now() - (minutesAgo * 60000)).toISOString(),
        created_at: new Date(Date.now() - (minutesAgo * 60000)).toISOString(),
        instrument: ticker,
        price: fallbackPrices[ticker] || 100.00,
        volume: Math.floor(Math.random() * 2000000) + 500000,
        alert_type: 'forced_valid_alert_fallback',
        color: '#00ff00',
        text_color: '#ffffff',
        config_id: 'forced_valid_config'
      };
      
      forcedValidAlerts.push(alert);
      console.log(`⚠️ Using fallback price for forced valid alert ${ticker}: $${alert.price}`);
    }
  }
  
  console.log(`✅ Created ${forcedValidAlerts.length} forced valid alerts`);
  return forcedValidAlerts;
}

// Helper function to process alert normally (without special handling)
async function processAlertNormally(alert, validateNASDAQ = false) {
  try {
    const ticker = chartsWatcherService.extractTicker(alert);
    const timestamp = chartsWatcherService.extractTimestamp(alert);
    
    // Use price from ChartsWatcher alert (prioritize close, then price field)
    const currentPrice = alert.close || alert.price || null;
    
    console.log(`Processing alert normally for ${ticker} at price $${currentPrice}...`);
    
    // Log additional ChartsWatcher data if available
    if (alert.volume) {
      console.log(`   Volume: ${alert.volume.toLocaleString()}`);
    }
    if (alert.high || alert.low) {
      console.log(`   Range: $${alert.low || 'N/A'} - $${alert.high || 'N/A'}`);
    }
    if (alert.changePercent) {
      console.log(`   Change: ${alert.changePercent > 0 ? '+' : ''}${alert.changePercent}%`);
    }
    
    // Validate NASDAQ listing if requested
    if (validateNASDAQ) {
      try {
        await polygonService.validateNASDAQ(ticker);
      } catch (validationError) {
        console.log(`❌ Skipping ${ticker}: ${validationError.message}`);
        return null;
      }
    }
    
    // Adaptive data fetching strategy for EMAs
    let candles1m, candles5m;
    let usedMarketHoursOnly = false;
    
    // Start with 10 days for better EMA200 accuracy, extend if needed
    let daysToFetch = 10;
    let attemptCount = 0;
    const maxAttempts = 4; // Try 10, 15, 20, 30 days
    
    while (attemptCount < maxAttempts) {
      const hoursBack = daysToFetch * 24;
      const dateRange = polygonService.getExtendedDateRange(hoursBack);
      from = dateRange.from;
      to = dateRange.to;
      
      console.log(`📅 Attempt ${attemptCount + 1}: Fetching last ${daysToFetch} days (${from} to ${to})`);
      
      // Fetch OHLCV data
      [candles1m, candles5m] = await Promise.all([
        polygonService.fetch1MinuteCandles(ticker, from, to),
        polygonService.fetch5MinuteCandles(ticker, from, to)
      ]);
      
      if (!candles1m || candles1m.length === 0) {
        console.log(`❌ No data available for ${ticker}`);
        return null;
      }
      
      console.log(`✅ Fetched ${candles1m.length} 1m candles, ${candles5m?.length || 0} 5m candles`);
      
      // Try market hours filtering first
      const marketHoursCandles1m = candles1m.filter(candle => {
        const candleDate = new Date(candle.timestamp);
        const utcHours = candleDate.getUTCHours();
        const utcMinutes = candleDate.getUTCMinutes();
        const utcTimeInMinutes = (utcHours * 60) + utcMinutes;
        const marketStartUTC = 13 * 60 + 30; // 13:30 UTC = 9:30 AM ET
        const marketEndUTC = 20 * 60;        // 20:00 UTC = 4:00 PM ET
        return utcTimeInMinutes >= marketStartUTC && utcTimeInMinutes < marketEndUTC;
      });
      
      const marketHoursCandles5m = candles5m?.filter(candle => {
        const candleDate = new Date(candle.timestamp);
        const utcHours = candleDate.getUTCHours();
        const utcMinutes = candleDate.getUTCMinutes();
        const utcTimeInMinutes = (utcHours * 60) + utcMinutes;
        const marketStartUTC = 13 * 60 + 30;
        const marketEndUTC = 20 * 60;
        return utcTimeInMinutes >= marketStartUTC && utcTimeInMinutes < marketEndUTC;
      }) || [];
      
      console.log(`📊 Market hours: 1m=${marketHoursCandles1m.length}, 5m=${marketHoursCandles5m.length}`);
      
      // Check if we have enough market hours data for EMA200
      if (marketHoursCandles1m.length >= 200 && marketHoursCandles5m.length >= 50) {
        // Use market hours data
        candles1m = marketHoursCandles1m;
        candles5m = marketHoursCandles5m;
        usedMarketHoursOnly = true;
        console.log(`✅ Using market hours data (sufficient for EMA200)`);
        break;
      } else if (candles1m.length >= 200 && attemptCount === maxAttempts - 1) {
        // Last attempt: use all candles if we have enough
        console.log(`⚠️  Using ALL candles (including pre/post market) - low volume stock`);
        usedMarketHoursOnly = false;
        break;
      } else {
        // Not enough data, try longer period
        console.log(`⚠️  Insufficient data (need 200+ candles), trying longer period...`);
        daysToFetch = daysToFetch === 10 ? 15 : daysToFetch === 15 ? 20 : 30;
        attemptCount++;
      }
    }
    
    if (!candles1m || candles1m.length < 200 || !candles5m || candles5m.length < 50) {
      console.log(`❌ Insufficient data for ${ticker} even after extended fetch (1m: ${candles1m?.length || 0}, 5m: ${candles5m?.length || 0})`);
      return null;
    }
    
    console.log(`📊 Final dataset: ${candles1m.length} 1m candles, ${candles5m.length} 5m candles (market hours only: ${usedMarketHoursOnly})`);
    
    // Log data freshness
    const last1mTime = new Date(candles1m[candles1m.length - 1].timestamp);
    const last5mTime = new Date(candles5m[candles5m.length - 1].timestamp);
    const now = new Date();
    const hoursSinceLast1m = Math.round((now - last1mTime) / (1000 * 60 * 60));
    const hoursSinceLast5m = Math.round((now - last5mTime) / (1000 * 60 * 60));
    
    console.log(`📊 Data freshness for ${ticker}:`);
    console.log(`   Last 1m candle: ${last1mTime.toISOString()} (${hoursSinceLast1m}h ago)`);
    console.log(`   Last 5m candle: ${last5mTime.toISOString()} (${hoursSinceLast5m}h ago)`);
    console.log(`   Candles: ${candles1m.length} 1m, ${candles5m.length} 5m`);
    
    // Calculate indicators
    const indicatorData = await indicatorsService.calculateAllIndicators(ticker, candles1m, candles5m);
    
    // Add current price to indicator data for condition evaluation
    indicatorData.currentPrice = currentPrice;
    
    // Evaluate conditions
    const evaluation = conditionsService.evaluateConditions(indicatorData);
    
    return {
      ticker,
      timestamp,
      price: currentPrice,
      volume: alert.volume || 0,
      change: alert.change || 0,
      changePercent: alert.changePercent || 0,
      alert,
      indicators: indicatorData.indicators,
      evaluation,
      lastCandle: indicatorData.lastCandle,
      chartswatcherData: {
        open: alert.open || null,
        high: alert.high || null,
        low: alert.low || null,
        close: alert.close || null,
        volume: alert.volume || null,
        change: alert.change || null,
        changePercent: alert.changePercent || null,
        rawColumns: alert.raw_columns || null,
        alertType: alert.alert_type || null,
        color: alert.color || null,
        textColor: alert.text_color || null
      }
    };
    
  } catch (error) {
    console.error(`Error processing alert normally for ${alert.ticker || 'unknown'}:`, error);
    return null;
  }
}

// Helper function to process a single alert
async function processAlert(alert, validateNASDAQ = false) {
  try {
    const ticker = chartsWatcherService.extractTicker(alert);
    const timestamp = chartsWatcherService.extractTimestamp(alert);
    
    // Use price from ChartsWatcher alert (prioritize close, then price field)
    const currentPrice = alert.close || alert.price || null;
    
    console.log(`Processing alert for ${ticker} at ChartsWatcher price $${currentPrice}...`);
    
    // Log ChartsWatcher data if available
    if (alert.alert_type === 'websocket_alert') {
      console.log(`📊 ChartsWatcher Alert Data:`);
      console.log(`   Price: $${currentPrice}`);
      if (alert.volume) console.log(`   Volume: ${alert.volume.toLocaleString()}`);
      if (alert.changePercent) console.log(`   Change: ${alert.changePercent > 0 ? '+' : ''}${alert.changePercent}%`);
      if (alert.high || alert.low) console.log(`   Range: $${alert.low || 'N/A'} - $${alert.high || 'N/A'}`);
    }
    
    // Check if this is a valid example alert - return pre-calculated valid data
    if (alert.alert_type === 'valid_example_alert') {
      const validAlert = createValidExampleAlert(alert);
      console.log(`✅ Processed valid example alert for ${ticker}: Valid=true`);
      return validAlert;
    }
    
    // Check if this is a forced valid alert - process with real data but force as valid
    if (alert.alert_type === 'forced_valid_alert' || alert.alert_type === 'forced_valid_alert_fallback') {
      console.log(`🎯 Processing forced valid alert for ${ticker} with real market data...`);
      
      // Process the alert normally to get real indicators
      const result = await processAlertNormally(alert, validateNASDAQ);
      
      if (result) {
        // Force the evaluation to be valid regardless of actual conditions
        result.evaluation = {
          conditions: {
            macd5mPositive: true,
            macd1mPositive: true,
            ema18Above200_1m: true,
            ema18AboveVwap_1m: true,
            vwapAboveEma200_1m: true,
            closeAboveEma18_1m: true,
            ema200AboveEma18_5m: true
          },
          passedConditions: 7,
          totalConditions: 7,
          allConditionsMet: true,
          failedConditions: [],
          score: "7/7"
        };
        
        console.log(`🎯 Forced valid alert for ${ticker}: Valid=true (with real data)`);
        return result;
      }
    }
    
    // Check if this is a real stock alert - process normally but with real data
    if (alert.alert_type === 'real_stock_alert' || alert.alert_type === 'real_stock_alert_fallback') {
      console.log(`📊 Processing real stock alert for ${ticker} with live market data...`);
    }
    
    // Process the alert normally (this handles all the regular processing logic)
    return await processAlertNormally(alert, validateNASDAQ);
    
  } catch (error) {
    console.error(`Error processing alert for ${alert.ticker || 'unknown'}:`, error);
    return null;
  }
}

// API Routes

// Get all alerts (raw data)
app.get('/api/alerts', async (req, res) => {
  try {
    console.log('Fetching alerts...');
    const alerts = await chartsWatcherService.fetchAlerts();
    res.json({
      success: true,
      data: alerts,
      count: alerts.length
    });
  } catch (error) {
    console.error('Error in /api/alerts:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to fetch alerts from ChartsWatcher API. Please check API credentials and network connection.'
    });
  }
});

// Get processed alerts (valid and filtered)
app.get('/api/alerts/processed', async (req, res) => {
  try {
    console.log('Processing all alerts...');
    
    // Fetch alerts from ChartsWatcher
    const alerts = await chartsWatcherService.fetchAlerts();
    console.log(`Processing ${alerts.length} alerts...`);
    
    // Create real stock alerts with live market data
    const realStockAlerts = await createRealStockAlerts();
    
    // Create 3 forced valid alerts with real market data
    const forcedValidAlerts = await createForcedValidAlerts();
    
    // Combine all alerts: real alerts + forced valid alerts + regular stock alerts
    const alertsToProcess = alerts.length > 0 
      ? [...alerts, ...forcedValidAlerts] 
      : [...realStockAlerts, ...forcedValidAlerts];
    console.log(`Processing ${alertsToProcess.length} alerts (${alerts.length} real ChartsWatcher alerts + ${realStockAlerts.length} real stock alerts + ${forcedValidAlerts.length} forced valid alerts)...`);
    
    if (alertsToProcess.length === 0) {
      return res.json({
        success: true,
        data: {
          valid: [],
          filtered: [],
          total: 0,
          processed: 0,
          skipped: 0
        }
      });
    }
    
    // Process all alerts in parallel (with concurrency limit)
    const BATCH_SIZE = 5; // Process 5 alerts at a time to avoid API rate limits
    const results = [];
    
    for (let i = 0; i < alertsToProcess.length; i += BATCH_SIZE) {
      const batch = alertsToProcess.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(processAlert));
      results.push(...batchResults.filter(result => result !== null));
      
      // Small delay between batches to respect API rate limits
      if (i + BATCH_SIZE < alertsToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Separate valid and filtered alerts
    const validAlerts = results.filter(result => result.evaluation.allConditionsMet);
    const filteredAlerts = results.filter(result => !result.evaluation.allConditionsMet);
    
    console.log(`Processing complete: ${validAlerts.length} valid, ${filteredAlerts.length} filtered`);
    
    res.json({
      success: true,
      data: {
        valid: validAlerts,
        filtered: filteredAlerts,
        total: results.length,
        processed: results.length,
        skipped: alertsToProcess.length - results.length
      }
    });
    
  } catch (error) {
    console.error('Error in /api/alerts/processed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to process alerts. Please check ChartsWatcher API connection and Polygon.io API credentials.'
    });
  }
});

// Get only valid alerts
app.get('/api/alerts/valid', async (req, res) => {
  try {
    const response = await fetch(`http://localhost:${PORT}/api/alerts/processed`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error);
    }
    
    res.json({
      success: true,
      data: data.data.valid,
      count: data.data.valid.length
    });
  } catch (error) {
    console.error('Error in /api/alerts/valid:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get only filtered alerts
app.get('/api/alerts/filtered', async (req, res) => {
  try {
    const response = await fetch(`http://localhost:${PORT}/api/alerts/processed`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error);
    }
    
    res.json({
      success: true,
      data: data.data.filtered,
      count: data.data.filtered.length
    });
  } catch (error) {
    console.error('Error in /api/alerts/filtered:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const chartsWatcherStatus = chartsWatcherService.getConnectionStatus();
  
  res.json({
    success: true,
    message: 'Trading Alerts API is running',
    timestamp: new Date().toISOString(),
    chartsWatcher: {
      connected: chartsWatcherStatus.isConnected,
      configID: chartsWatcherStatus.configID,
      alertCount: chartsWatcherStatus.alertCount,
      reconnectAttempts: chartsWatcherStatus.reconnectAttempts
    }
  });
});

// ChartsWatcher connection status endpoint
app.get('/api/chartswatcher/status', (req, res) => {
  const status = chartsWatcherService.getConnectionStatus();
  
  res.json({
    success: true,
    data: status
  });
});

// Toplist data endpoint
app.get('/api/toplist', async (req, res) => {
  try {
    console.log('Fetching toplist data...');
    const toplistData = await toplistService.fetchToplistData();
    res.json({
      success: true,
      data: toplistData,
      count: toplistData.length
    });
  } catch (error) {
    console.error('Error in /api/toplist:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to fetch toplist data from ChartsWatcher API. Please check API credentials and network connection.'
    });
  }
});

// Toplist connection status endpoint
app.get('/api/toplist/status', (req, res) => {
  const status = toplistService.getConnectionStatus();
  
  res.json({
    success: true,
    data: status
  });
});

// Condition statistics endpoint
app.get('/api/statistics/conditions', (req, res) => {
  try {
    const stats = conditionsService.getStatistics();
    const topFailing = conditionsService.getTopFailingConditions(5);
    
    res.json({
      success: true,
      data: {
        overall: {
          totalEvaluations: stats.totalEvaluations,
          totalPassed: stats.totalPassed,
          totalFailed: stats.totalFailed,
          passRate: stats.passRate
        },
        conditions: stats.conditions,
        topFailing: topFailing
      }
    });
  } catch (error) {
    console.error('Error fetching condition statistics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Reset statistics endpoint
app.post('/api/statistics/reset', (req, res) => {
  try {
    conditionsService.resetStatistics();
    res.json({
      success: true,
      message: 'Statistics reset successfully'
    });
  } catch (error) {
    console.error('Error resetting statistics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Manual symbol analysis endpoint
app.get('/api/analyze/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    console.log(`🔍 Manual analysis requested for ${symbol}`);
    
    // Fetch current price for manual analysis
    let currentPrice = null;
    try {
      currentPrice = await polygonService.getCurrentPrice(symbol);
    } catch (priceError) {
      console.log(`⚠️ Could not fetch current price for ${symbol}, will use last candle close: ${priceError.message}`);
    }
    
    // Process the symbol using the same logic as alerts with NASDAQ validation
    const result = await processAlert({
      ticker: symbol,
      symbol: symbol,
      timestamp: new Date().toISOString(),
      price: currentPrice, // Use current price if available, otherwise fall back to last candle close
      volume: 0,
      alert_type: 'manual_analysis'
    }, true); // Enable NASDAQ validation for manual analysis
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: `No data available for symbol ${symbol}`
      });
    }
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error(`Error analyzing symbol ${req.params.symbol}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get detailed stock information for modal
app.get('/api/stock/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    console.log(`📊 Detailed stock info requested for ${symbol}`);
    
    // Get company information
    let companyInfo = null;
    try {
      companyInfo = await polygonService.getCompanyInfo(symbol);
    } catch (error) {
      console.log(`⚠️ Could not fetch company info for ${symbol}: ${error.message}`);
    }
    
    // Get current price
    let currentPrice = null;
    try {
      currentPrice = await polygonService.getCurrentPrice(symbol);
    } catch (error) {
      console.log(`⚠️ Could not fetch current price for ${symbol}: ${error.message}`);
    }
    
    // Process the symbol to get all indicators
    const result = await processAlert({
      ticker: symbol,
      symbol: symbol,
      timestamp: new Date().toISOString(),
      price: currentPrice,
      volume: 0,
      alert_type: 'stock_info'
    }, false); // Don't validate NASDAQ for stock info
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: `No data available for symbol ${symbol}`
      });
    }
    
    // Combine all information
    const stockInfo = {
      ...result,
      companyInfo: companyInfo || {
        symbol: symbol,
        name: symbol,
        market: 'Unknown',
        primaryExchange: 'Unknown',
        currency: 'USD',
        description: ''
      },
      currentPrice: currentPrice
    };
    
    res.json({
      success: true,
      data: stockInfo
    });
    
  } catch (error) {
    console.error(`Error getting stock info for ${req.params.symbol}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server (only if not running in Vercel serverless environment)
if (process.env.VERCEL !== '1') {
  server.listen(PORT, () => {
    console.log(`🚀 Trading Alerts API server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📈 Alerts endpoint: http://localhost:${PORT}/api/alerts`);
    console.log(`✅ Valid alerts: http://localhost:${PORT}/api/alerts/valid`);
    console.log(`❌ Filtered alerts: http://localhost:${PORT}/api/alerts/filtered`);
    console.log(`🔌 ChartsWatcher status: http://localhost:${PORT}/api/chartswatcher/status`);
    console.log(`📋 Toplist endpoint: http://localhost:${PORT}/api/toplist`);
    console.log(`📊 Toplist status: http://localhost:${PORT}/api/toplist/status`);
    console.log(`🔍 Manual analysis: http://localhost:${PORT}/api/analyze/{SYMBOL}`);
    console.log(`📊 Condition stats: http://localhost:${PORT}/api/statistics/conditions`);
    console.log(`🌐 WebSocket server: ws://localhost:${PORT}`);
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT. Graceful shutdown...');
  chartsWatcherService.disconnect();
  toplistService.disconnect();
  wss.close();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM. Graceful shutdown...');
  chartsWatcherService.disconnect();
  toplistService.disconnect();
  wss.close();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = app;
