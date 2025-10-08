const fetch = require('node-fetch');

class PolygonService {
  constructor() {
    this.baseUrl = 'https://api.polygon.io';
    this.apiKey = process.env.POLYGON_API_KEY || 'oLNQ0GD8RpIcP8X2iApVnlzg28P6Ttcc';
  }

  async fetchOHLCV(ticker, timeframe, from, to) {
    try {
      const url = `${this.baseUrl}/v2/aggs/ticker/${ticker}/range/${timeframe}/minute/${from}/${to}?apikey=${this.apiKey}`;
      
      console.log(`Fetching ${timeframe}m OHLCV for ${ticker} from ${from} to ${to}...`);
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Polygon API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status !== 'OK') {
        throw new Error(`Polygon API returned error: ${data.status}`);
      }
      
      const results = data.results || [];
      
      if (results.length === 0) {
        throw new Error(`No data returned from Polygon API for ${ticker}`);
      }
      
      console.log(`Fetched ${results.length} ${timeframe}m candles for ${ticker}`);
      
      // Transform data to our expected format
      return results.map(candle => ({
        timestamp: new Date(candle.t),
        open: candle.o,
        high: candle.h,
        low: candle.l,
        close: candle.c,
        volume: candle.v
      })).sort((a, b) => a.timestamp - b.timestamp);
      
    } catch (error) {
      console.error(`Error fetching ${timeframe}m OHLCV for ${ticker}:`, error.message);
      throw error;
    }
  }

  // Get company information for a ticker
  async getCompanyInfo(ticker) {
    try {
      const url = `${this.baseUrl}/v3/reference/tickers/${ticker}?apikey=${this.apiKey}`;
      
      console.log(`Fetching company info for ${ticker}...`);
      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Symbol ${ticker} not found`);
        }
        throw new Error(`Polygon API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status !== 'OK') {
        throw new Error(`Polygon API returned error: ${data.status}`);
      }
      
      const tickerData = data.results;
      
      if (!tickerData) {
        throw new Error(`No ticker data found for ${ticker}`);
      }
      
      return {
        symbol: tickerData.ticker,
        name: tickerData.name || tickerData.ticker,
        market: tickerData.market,
        primaryExchange: tickerData.primary_exchange,
        currency: tickerData.currency_name,
        description: tickerData.description || ''
      };
      
    } catch (error) {
      console.error(`Error fetching company info for ${ticker}:`, error.message);
      throw error;
    }
  }

  // Validate that a ticker is listed on NASDAQ
  async validateNASDAQ(ticker) {
    try {
      const companyInfo = await this.getCompanyInfo(ticker);
      
      console.log(`Ticker ${ticker} - Market: ${companyInfo.market}, Primary Exchange: ${companyInfo.primaryExchange}`);
      
      // NASDAQ stocks have primary exchange as XNAS
      if (companyInfo.primaryExchange !== 'XNAS') {
        throw new Error(`Symbol ${ticker} is not listed on NASDAQ. Found on: ${companyInfo.primaryExchange}`);
      }
      
      console.log(`✅ ${ticker} is confirmed to be listed on NASDAQ`);
      return true;
      
    } catch (error) {
      console.error(`Error validating NASDAQ listing for ${ticker}:`, error.message);
      throw error;
    }
  }


  async fetch1MinuteCandles(ticker, from, to) {
    return this.fetchOHLCV(ticker, 1, from, to);
  }

  async fetch5MinuteCandles(ticker, from, to) {
    return this.fetchOHLCV(ticker, 5, from, to);
  }

  // Helper method to format date for Polygon API
  formatDateForAPI(date) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  }

  // Get current price for a ticker
  async getCurrentPrice(ticker) {
    try {
      const url = `${this.baseUrl}/v2/last/trade/${ticker}?apikey=${this.apiKey}`;
      
      console.log(`Fetching current price for ${ticker}...`);
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Polygon API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status !== 'OK') {
        throw new Error(`Polygon API returned error: ${data.status}`);
      }
      
      const result = data.results;
      
      if (!result || !result.p) {
        throw new Error(`No price data available for ${ticker}`);
      }
      
      const price = result.p;
      console.log(`✅ Current price for ${ticker}: $${price}`);
      
      return price;
      
    } catch (error) {
      console.error(`Error fetching current price for ${ticker}:`, error.message);
      throw error;
    }
  }

  // Helper method to get date range - prioritize recent data
  getDateRange(hoursBack = 168) { // Default to 7 days for recent data
    const to = new Date();
    const from = new Date(to.getTime() - (hoursBack * 60 * 60 * 1000));
    
    return {
      from: this.formatDateForAPI(from),
      to: this.formatDateForAPI(to)
    };
  }

  // Get extended date range for EMA200 calculation (when needed)
  getExtendedDateRange(hoursBack = 720) { // 30 days for EMA200
    const to = new Date();
    const from = new Date(to.getTime() - (hoursBack * 60 * 60 * 1000));
    
    return {
      from: this.formatDateForAPI(from),
      to: this.formatDateForAPI(to)
    };
  }

  // Calculate EMA using pandas-like exponential weighted moving average
  calculateEMA(values, span, adjust = false) {
    if (!values || values.length === 0) {
      return null;
    }

    if (values.length < span) {
      console.log(`❌ Insufficient data for EMA ${span}: have ${values.length} values, need ${span}`);
      return null;
    }

    try {
      // Calculate alpha (smoothing factor)
      const alpha = 2 / (span + 1);
      
      // Initialize with first value
      let ema = values[0];
      
      // Calculate EMA for remaining values
      for (let i = 1; i < values.length; i++) {
        ema = alpha * values[i] + (1 - alpha) * ema;
      }
      
      return ema;
    } catch (error) {
      console.error(`Error calculating EMA ${span}:`, error);
      return null;
    }
  }

  // Fetch MACD indicator from Polygon.io
  async fetchMACD(ticker, timespan = 'minute', shortWindow = 12, longWindow = 26, signalWindow = 9) {
    try {
      // Validate timespan parameter according to Polygon.io documentation
      const supportedTimespans = ['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'];
      
      if (!supportedTimespans.includes(timespan)) {
        throw new Error(`Unsupported timespan '${timespan}'. Supported values: ${supportedTimespans.join(', ')}`);
      }
      
      const url = `${this.baseUrl}/v1/indicators/macd/${ticker}?timespan=${timespan}&adjusted=true&short_window=${shortWindow}&long_window=${longWindow}&signal_window=${signalWindow}&series_type=close&expand_underlying=false&order=desc&limit=200&apikey=${this.apiKey}`;
      
      console.log(`Fetching MACD (${timespan}) for ${ticker}...`);
      console.log(`   URL: ${url.replace(this.apiKey, 'API_KEY_HIDDEN')}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Polygon API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status !== 'OK') {
        throw new Error(`Polygon API returned error: ${data.status}`);
      }
      
      const results = data.results;
      
      if (!results || !results.values || results.values.length === 0) {
        throw new Error(`No MACD data returned from Polygon API for ${ticker}`);
      }
      
      // Get the most recent MACD values (first in the array since it's ordered desc)
      const latestMACD = results.values[0];
      
      console.log(`✅ MACD (${timespan}) fetched successfully for ${ticker}`);
      console.log(`   MACD: ${latestMACD.value?.toFixed(6) || 'N/A'}`);
      console.log(`   Signal: ${latestMACD.signal?.toFixed(6) || 'N/A'}`);
      console.log(`   Histogram: ${latestMACD.histogram?.toFixed(6) || 'N/A'}`);
      console.log(`   Timestamp: ${new Date(latestMACD.timestamp).toISOString()}`);
      
      return {
        macd: latestMACD.value,
        signal: latestMACD.signal,
        histogram: latestMACD.histogram,
        timestamp: new Date(latestMACD.timestamp)
      };
      
    } catch (error) {
      console.error(`Error fetching MACD (${timespan}) for ${ticker}:`, error.message);
      throw error;
    }
  }

  // Fetch EMA values using Polygon aggregates and calculate locally
  async fetchEMAValues(ticker, timeframe, period, hoursBack = 168) {
    try {
      const dateRange = this.getDateRange(hoursBack);
      
      // Fetch candle data
      const candles = await this.fetchOHLCV(ticker, timeframe, dateRange.from, dateRange.to);
      
      if (!candles || candles.length === 0) {
        throw new Error(`No candle data available for EMA calculation`);
      }
      
      // Extract close prices
      const closes = candles.map(candle => candle.close);
      
      // Calculate EMA
      const emaValue = this.calculateEMA(closes, period);
      
      if (emaValue === null) {
        throw new Error(`Failed to calculate EMA ${period} from ${closes.length} candles`);
      }
      
      console.log(`✅ EMA ${period} (${timeframe}m) calculated successfully: ${emaValue.toFixed(6)}`);
      console.log(`   Data range: ${closes[0].toFixed(4)} to ${closes[closes.length-1].toFixed(4)}`);
      console.log(`   Candles used: ${closes.length}`);
      
      return {
        value: emaValue,
        timestamp: candles[candles.length - 1].timestamp,
        candleCount: candles.length,
        dataRange: {
          first: closes[0],
          last: closes[closes.length - 1]
        }
      };
      
    } catch (error) {
      console.error(`Error fetching EMA ${period} (${timeframe}m) for ${ticker}:`, error.message);
      throw error;
    }
  }

  // Fetch all EMA values needed for trading conditions
  async fetchAllEMAValues(ticker) {
    try {
      console.log(`\n🚀 FETCHING EMA VALUES FROM POLYGON.IO FOR ${ticker}`);
      
      // Fetch 1-minute EMAs (recent data - 7 days)
      console.log(`\n🔍 FETCHING 1-MINUTE EMAS:`);
      const ema1m18 = await this.fetchEMAValues(ticker, 1, 18, 168); // 7 days
      const ema1m200 = await this.fetchEMAValues(ticker, 1, 200, 168); // 7 days
      
      // Fetch 5-minute EMAs (recent data - 7 days, fallback to 30 days if needed)
      console.log(`\n🔍 FETCHING 5-MINUTE EMAS:`);
      let ema5m18, ema5m200;
      
      try {
        ema5m18 = await this.fetchEMAValues(ticker, 5, 18, 168); // 7 days
        ema5m200 = await this.fetchEMAValues(ticker, 5, 200, 168); // 7 days
      } catch (error) {
        console.log(`⚠️ 7-day data insufficient for 5m EMAs, trying 30-day range...`);
        ema5m18 = await this.fetchEMAValues(ticker, 5, 18, 720); // 30 days
        ema5m200 = await this.fetchEMAValues(ticker, 5, 200, 720); // 30 days
      }
      
      const results = {
        ema1m18: ema1m18.value,
        ema1m200: ema1m200.value,
        ema5m18: ema5m18.value,
        ema5m200: ema5m200.value,
        metadata: {
          ema1m18: ema1m18,
          ema1m200: ema1m200,
          ema5m18: ema5m18,
          ema5m200: ema5m200
        }
      };
      
      console.log(`\n📊 FINAL EMA VALUES FROM POLYGON.IO FOR ${ticker}:`);
      console.log(`   EMA 18 (1m): ${results.ema1m18.toFixed(6)}`);
      console.log(`   EMA 200 (1m): ${results.ema1m200.toFixed(6)}`);
      console.log(`   EMA 18 (5m): ${results.ema5m18.toFixed(6)}`);
      console.log(`   EMA 200 (5m): ${results.ema5m200.toFixed(6)}`);
      
      return results;
      
    } catch (error) {
      console.error(`Error fetching all EMA values for ${ticker}:`, error.message);
      throw error;
    }
  }

  // Calculate MACD locally using technicalindicators library
  calculateMACDLocal(candles, timeframe = '1m', fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (!candles || candles.length === 0) {
      console.log(`❌ No candles available for MACD (${timeframe})`);
      return null;
    }

    const closes = candles.map(candle => candle.close);
    
    // MACD needs at least slowPeriod + signalPeriod candles
    const minCandles = slowPeriod + signalPeriod;
    if (closes.length < minCandles) {
      console.log(`❌ Insufficient data for MACD (${timeframe}): have ${closes.length} candles, need at least ${minCandles}`);
      return null;
    }
    
    try {
      console.log(`🔍 Calculating MACD (${timeframe}) locally from ${closes.length} candles...`);
      console.log(`   Parameters: Fast=${fastPeriod}, Slow=${slowPeriod}, Signal=${signalPeriod}`);
      console.log(`   Data range: ${closes[0].toFixed(4)} to ${closes[closes.length-1].toFixed(4)}`);
      
      const { MACD } = require('technicalindicators');
      
      const macd = MACD.calculate({
        values: closes,
        fastPeriod: fastPeriod,
        slowPeriod: slowPeriod,
        signalPeriod: signalPeriod,
        SimpleMAOscillator: false,
        SimpleMASignal: false
      });
      
      if (macd.length > 0) {
        const lastMACD = macd[macd.length - 1];
        console.log(`✅ MACD (${timeframe}) calculated successfully locally:`);
        console.log(`   MACD: ${lastMACD.MACD.toFixed(6)}`);
        console.log(`   Signal: ${lastMACD.signal.toFixed(6)}`);
        console.log(`   Histogram: ${lastMACD.histogram.toFixed(6)}`);
        console.log(`   Last close: ${closes[closes.length-1].toFixed(4)}`);
        
        return {
          macd: lastMACD.MACD,
          signal: lastMACD.signal,
          histogram: lastMACD.histogram,
          timestamp: new Date(),
          lastClose: closes[closes.length-1],
          candleCount: closes.length
        };
      }
      
      console.log(`❌ MACD (${timeframe}) calculation returned empty array`);
      return null;
    } catch (error) {
      console.error(`❌ Error calculating MACD (${timeframe}) locally:`, error);
      return null;
    }
  }

  // Calculate MACD using EMA results for accurate TradingView matching
  calculateMACDWithEMA(candles, timeframe = '1m', fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (!candles || candles.length === 0) {
      console.log(`❌ No candles available for EMA-based MACD (${timeframe})`);
      return null;
    }

    const closes = candles.map(candle => candle.close);
    
    // Need enough data for the slowest EMA + signal period
    const minCandles = slowPeriod + signalPeriod;
    if (closes.length < minCandles) {
      console.log(`❌ Insufficient data for EMA-based MACD (${timeframe}): have ${closes.length} candles, need at least ${minCandles}`);
      return null;
    }
    
    try {
      console.log(`🔍 Calculating EMA-based MACD (${timeframe}) from ${closes.length} candles...`);
      console.log(`   Parameters: Fast=${fastPeriod}, Slow=${slowPeriod}, Signal=${signalPeriod}`);
      console.log(`   Data range: ${closes[0].toFixed(4)} to ${closes[closes.length-1].toFixed(4)}`);
      
      // Calculate EMAs for each period to build MACD line
      const macdLine = [];
      const fastEMAs = [];
      const slowEMAs = [];
      
      // Calculate EMAs for each period starting from slowPeriod
      for (let i = slowPeriod - 1; i < closes.length; i++) {
        const fastEMA = this.calculateEMA(closes.slice(0, i + 1), fastPeriod);
        const slowEMA = this.calculateEMA(closes.slice(0, i + 1), slowPeriod);
        
        if (fastEMA !== null && slowEMA !== null) {
          fastEMAs.push(fastEMA);
          slowEMAs.push(slowEMA);
          macdLine.push(fastEMA - slowEMA);
        }
      }
      
      if (macdLine.length === 0) {
        console.log(`❌ Failed to calculate MACD line from EMAs`);
        return null;
      }
      
      // Calculate signal line (EMA of MACD line)
      const signalLine = this.calculateEMA(macdLine, signalPeriod);
      
      if (signalLine === null) {
        console.log(`❌ Failed to calculate signal line from MACD line`);
        return null;
      }
      
      // Get the latest values
      const latestMACD = macdLine[macdLine.length - 1];
      const latestSignal = signalLine;
      const histogram = latestMACD - latestSignal;
      
      console.log(`✅ EMA-based MACD (${timeframe}) calculated:`);
      console.log(`   Fast EMA: ${fastEMAs[fastEMAs.length - 1].toFixed(6)}`);
      console.log(`   Slow EMA: ${slowEMAs[slowEMAs.length - 1].toFixed(6)}`);
      console.log(`   MACD: ${latestMACD.toFixed(6)}`);
      console.log(`   Signal: ${latestSignal.toFixed(6)}`);
      console.log(`   Histogram: ${histogram.toFixed(6)}`);
      console.log(`   MACD periods: ${macdLine.length}`);
      
      return {
        macd: latestMACD,
        signal: latestSignal,
        histogram: histogram,
        timestamp: new Date(),
        lastClose: closes[closes.length-1],
        candleCount: closes.length,
        fastEMA: fastEMAs[fastEMAs.length - 1],
        slowEMA: slowEMAs[slowEMAs.length - 1],
        macdLine: macdLine,
        signalLine: signalLine
      };
    } catch (error) {
      console.error(`❌ Error calculating EMA-based MACD (${timeframe}):`, error);
      return null;
    }
  }

  // Fetch all MACD values needed for trading conditions
  async fetchAllMACDValues(ticker) {
    try {
      console.log(`\n🚀 FETCHING MACD VALUES FROM POLYGON.IO FOR ${ticker}`);
      
      // Fetch 1-minute MACD: Try Polygon.io first, fallback to local calculation
      console.log(`\n🔍 FETCHING 1-MINUTE MACD:`);
      let macd1m;
      
      try {
        macd1m = await this.fetchMACD(ticker, 'minute', 12, 26, 9);
        console.log(`✅ 1-minute MACD fetched from Polygon.io`);
      } catch (error) {
        console.log(`⚠️ Polygon.io 1-minute MACD failed: ${error.message}`);
        console.log(`🔄 Falling back to local 1-minute MACD calculation...`);
        
        // Get 1-minute candles for local calculation
        const dateRange = this.getDateRange(168); // 7 days
        const candles1m = await this.fetch1MinuteCandles(ticker, dateRange.from, dateRange.to);
        macd1m = this.calculateMACDWithEMA(candles1m, '1m', 12, 26, 9);
        
        if (!macd1m) {
          throw new Error('Both Polygon.io and local 1-minute MACD calculations failed');
        }
      }
      
      // 5-minute MACD: Try Polygon.io hour timeframe first, fallback to local calculation
      console.log(`\n🔍 FETCHING 5-MINUTE MACD:`);
      let macd5m;
      
      try {
        // Try using hour timeframe from Polygon.io as proxy for 5-minute
        macd5m = await this.fetchMACD(ticker, 'hour', 12, 26, 9);
        console.log(`✅ 5-minute MACD fetched from Polygon.io (using hour timeframe)`);
      } catch (error) {
        console.log(`⚠️ Polygon.io hour MACD failed: ${error.message}`);
        console.log(`🔄 Falling back to local 5-minute MACD calculation...`);
        
        // Get 5-minute candles for local calculation
        const dateRange = this.getDateRange(168); // 7 days
        const candles5m = await this.fetch5MinuteCandles(ticker, dateRange.from, dateRange.to);
        
        // Try different calculation methods to find the best match
        const macd5mLocal = this.calculateMACDLocal(candles5m, '5m', 12, 26, 9);
        const macd5mEMA = this.calculateMACDWithEMA(candles5m, '5m', 12, 26, 9);
        
        // Use the EMA-based calculation (most accurate for TradingView matching)
        macd5m = macd5mEMA || macd5mLocal;
        
        if (!macd5m) {
          throw new Error('Both local and manual 5-minute MACD calculations failed');
        }
        
        console.log(`✅ 5-minute MACD calculated locally from ${candles5m.length} candles`);
        
        // Log comparison if both methods worked
        if (macd5mLocal && macd5mEMA) {
          console.log(`   Local MACD: ${macd5mLocal.macd.toFixed(6)}`);
          console.log(`   EMA-based MACD: ${macd5mEMA.macd.toFixed(6)}`);
          console.log(`   Difference: ${Math.abs(macd5mLocal.macd - macd5mEMA.macd).toFixed(6)}`);
        }
      }
      
      const results = {
        macd1m: {
          macd: macd1m.macd,
          signal: macd1m.signal,
          histogram: macd1m.histogram
        },
        macd5m: {
          macd: macd5m.macd,
          signal: macd5m.signal,
          histogram: macd5m.histogram
        },
        metadata: {
          macd1m: macd1m,
          macd5m: macd5m
        }
      };
      
      console.log(`\n📊 FINAL MACD VALUES FOR ${ticker}:`);
      console.log(`   MACD (1m): ${results.macd1m.macd?.toFixed(6) || 'N/A'}`);
      console.log(`   MACD (5m): ${results.macd5m.macd?.toFixed(6) || 'N/A'}`);
      
      return results;
      
    } catch (error) {
      console.error(`Error fetching all MACD values for ${ticker}:`, error.message);
      throw error;
    }
  }
}

module.exports = PolygonService;
