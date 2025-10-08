class IndicatorsService {
  constructor() {
    // All calculations are done manually, no need for instance variables
  }

  // Manual EMA calculation function
  calculateManualEMA(values, period) {
    if (!values || values.length === 0) {
      return null;
    }

    if (values.length < period) {
      return null;
    }

    // Calculate SMA for the first period values (seeding)
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += values[i];
    }
    let ema = sum / period;

    // Calculate EMA for remaining values
    const multiplier = 2 / (period + 1);
    for (let i = period; i < values.length; i++) {
      ema = (values[i] * multiplier) + (ema * (1 - multiplier));
    }

    return ema;
  }

  calculateEMA(candles, period, timeframe = '1m') {
    if (!candles || candles.length === 0) {
      console.log(`❌ No candles available for EMA ${period} (${timeframe})`);
      return null;
    }

    const closes = candles.map(candle => candle.close);
    
    // Check if we have enough data for the period
    if (closes.length < period) {
      console.log(`❌ Insufficient data for EMA ${period} (${timeframe}): have ${closes.length} candles, need ${period}`);
      return null;
    }
    
    try {
      console.log(`🔍 Calculating EMA ${period} (${timeframe}) from ${closes.length} candles...`);
      
      // Use manual EMA calculation for consistency
      const result = this.calculateManualEMA(closes, period);
      
      if (result === null) {
        console.log(`❌ EMA ${period} (${timeframe}) calculation failed`);
        return null;
      }
      
      console.log(`✅ EMA ${period} (${timeframe}) calculated successfully: ${result.toFixed(6)}`);
      console.log(`   Data range: ${closes[0].toFixed(4)} to ${closes[closes.length-1].toFixed(4)}`);
      
      return result;
    } catch (error) {
      console.error(`❌ Error calculating EMA ${period} (${timeframe}):`, error);
      return null;
    }
  }

  // Manual MACD calculation function with proper signal line
  calculateManualMACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (!closes || closes.length === 0) {
      return null;
    }

    // MACD needs at least slowPeriod + signalPeriod candles
    const minCandles = slowPeriod + signalPeriod;
    if (closes.length < minCandles) {
      return null;
    }

    // Calculate EMA_fast and EMA_slow for all data points
    const emaFastValues = [];
    const emaSlowValues = [];
    const macdLineValues = [];

    // Calculate EMA values for each point
    for (let i = 0; i < closes.length; i++) {
      const closesSubset = closes.slice(0, i + 1);
      
      if (closesSubset.length >= fastPeriod) {
        const emaFast = this.calculateManualEMA(closesSubset, fastPeriod);
        emaFastValues.push(emaFast);
      } else {
        emaFastValues.push(null);
      }
      
      if (closesSubset.length >= slowPeriod) {
        const emaSlow = this.calculateManualEMA(closesSubset, slowPeriod);
        emaSlowValues.push(emaSlow);
      } else {
        emaSlowValues.push(null);
      }
    }

    // Calculate MACD line values
    for (let i = 0; i < closes.length; i++) {
      if (emaFastValues[i] !== null && emaSlowValues[i] !== null) {
        macdLineValues.push(emaFastValues[i] - emaSlowValues[i]);
      } else {
        macdLineValues.push(null);
      }
    }

    // Get the latest MACD line value
    const latestMacdLine = macdLineValues[macdLineValues.length - 1];
    if (latestMacdLine === null) {
      return null;
    }

    // Calculate signal line (EMA of MACD line values)
    // Filter out null values for signal calculation
    const validMacdValues = macdLineValues.filter(val => val !== null);
    if (validMacdValues.length < signalPeriod) {
      return null;
    }

    const signalLine = this.calculateManualEMA(validMacdValues, signalPeriod);
    if (signalLine === null) {
      return null;
    }

    // Histogram = MACD line - Signal line
    const histogram = latestMacdLine - signalLine;

    return {
      macd: latestMacdLine,
      signal: signalLine,
      histogram: histogram
    };
  }

  calculateMACD(candles, timeframe = '1m', fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
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
      console.log(`🔍 Calculating MACD (${timeframe}) from ${closes.length} candles...`);
      console.log(`   Parameters: Fast=${fastPeriod}, Slow=${slowPeriod}, Signal=${signalPeriod}`);
      
      // Use manual MACD calculation
      const result = this.calculateManualMACD(closes, fastPeriod, slowPeriod, signalPeriod);
      
      if (result === null) {
        console.log(`❌ MACD (${timeframe}) calculation failed`);
        return null;
      }
      
      console.log(`✅ MACD (${timeframe}) calculated successfully:`);
      console.log(`   MACD: ${result.macd.toFixed(6)}`);
      console.log(`   Signal: ${result.signal.toFixed(6)}`);
      console.log(`   Histogram: ${result.histogram.toFixed(6)}`);
      
      return result;
    } catch (error) {
      console.error(`❌ Error calculating MACD (${timeframe}):`, error);
      return null;
    }
  }

  calculateVWAP(candles, timeframe = '1m') {
    if (!candles || candles.length === 0) {
      console.log(`❌ No candles available for VWAP (${timeframe})`);
      return null;
    }

    try {
      console.log(`🔍 Calculating VWAP (${timeframe}) from ${candles.length} candles...`);
      
      let totalVolume = 0;
      let totalVWAP = 0;
      let validCandles = 0;

      for (const candle of candles) {
        const typicalPrice = (candle.high + candle.low + candle.close) / 3;
        const volume = candle.volume || 0;
        
        if (volume > 0) {
          totalVWAP += typicalPrice * volume;
          totalVolume += volume;
          validCandles++;
        }
      }

      const result = totalVolume > 0 ? totalVWAP / totalVolume : null;
      
      if (result) {
        console.log(`✅ VWAP (${timeframe}) calculated successfully: ${result.toFixed(6)}`);
        console.log(`   Valid candles: ${validCandles}/${candles.length}, Total volume: ${totalVolume.toFixed(0)}`);
      } else {
        console.log(`❌ VWAP (${timeframe}) calculation failed: no valid volume data`);
      }
      
      return result;
    } catch (error) {
      console.error(`❌ Error calculating VWAP (${timeframe}):`, error);
      return null;
    }
  }

  // Calculate Low of Day (LOD) and High of Day (HOD)
  calculateLODHOD(candles) {
    if (!candles || candles.length === 0) {
      console.log(`❌ No candles available for LOD/HOD calculation`);
      return { lod: null, hod: null };
    }

    try {
      console.log(`🔍 Calculating LOD/HOD from ${candles.length} candles...`);
      
      let lod = candles[0].low;
      let hod = candles[0].high;

      for (const candle of candles) {
        if (candle.low < lod) {
          lod = candle.low;
        }
        if (candle.high > hod) {
          hod = candle.high;
        }
      }

      console.log(`✅ LOD/HOD calculated successfully:`);
      console.log(`   LOD: ${lod.toFixed(4)}`);
      console.log(`   HOD: ${hod.toFixed(4)}`);
      
      return { lod, hod };
    } catch (error) {
      console.error(`❌ Error calculating LOD/HOD:`, error);
      return { lod: null, hod: null };
    }
  }

  async calculateAllIndicators(ticker, candles1m, candles5m) {
    console.log(`\n🚀 CALCULATING INDICATORS FOR ${ticker}`);
    console.log(`📊 Input data: ${candles1m.length} 1m candles, ${candles5m.length} 5m candles`);
    
    // Validate data freshness
    this.validateDataFreshness(ticker, candles1m, candles5m);
    
    // Verify time alignment between 1m and 5m candles
    this.verifyTimeAlignment(candles1m, candles5m);
    
    try {
      // Calculate all indicators manually using our custom functions
      console.log(`\n🔍 CALCULATING ALL INDICATORS MANUALLY:`);
      
      // Calculate 1-minute indicators
      console.log(`\n🔍 CALCULATING 1-MINUTE INDICATORS (MANUAL):`);
      const ema1m12 = this.calculateEMA(candles1m, 12, '1m');
      const ema1m18 = this.calculateEMA(candles1m, 18, '1m');
      const ema1m20 = this.calculateEMA(candles1m, 20, '1m');
      const ema1m26 = this.calculateEMA(candles1m, 26, '1m');
      const ema1m200 = this.calculateEMA(candles1m, 200, '1m');
      const macd1m = this.calculateMACD(candles1m, '1m');
      const vwap1m = this.calculateVWAP(candles1m, '1m');
      
      // Calculate 5-minute indicators
      console.log(`\n🔍 CALCULATING 5-MINUTE INDICATORS (MANUAL):`);
      const ema5m12 = this.calculateEMA(candles5m, 12, '5m');
      const ema5m18 = this.calculateEMA(candles5m, 18, '5m');
      const ema5m20 = this.calculateEMA(candles5m, 20, '5m');
      const ema5m26 = this.calculateEMA(candles5m, 26, '5m');
      const ema5m200 = this.calculateEMA(candles5m, 200, '5m');
      const macd5m = this.calculateMACD(candles5m, '5m');
      
      // Calculate LOD and HOD (Low/High of Day)
      const { lod, hod } = this.calculateLODHOD(candles1m);
      
      const results = {
        ticker,
        timestamp: new Date().toISOString(),
        indicators: {
          ema1m12,
          ema1m18,
          ema1m20,
          ema1m26,
          ema1m200,
          ema5m12,
          ema5m18,
          ema5m20,
          ema5m26,
          ema5m200,
          macd1m,
          macd5m,
          vwap1m,
          lod,
          hod
        },
        lastCandle: candles1m.length > 0 ? candles1m[candles1m.length - 1] : null,
        candleCounts: {
          candles1m: candles1m.length,
          candles5m: candles5m.length
        },
        manualCalculation: true
      };

      console.log(`\n📊 FINAL INDICATOR VALUES FOR ${ticker} (MANUAL CALCULATION):`);
      console.log(`   EMA 12 (1m): ${results.indicators.ema1m12?.toFixed(6) || 'N/A'}`);
      console.log(`   EMA 18 (1m): ${results.indicators.ema1m18?.toFixed(6) || 'N/A'}`);
      console.log(`   EMA 20 (1m): ${results.indicators.ema1m20?.toFixed(6) || 'N/A'}`);
      console.log(`   EMA 26 (1m): ${results.indicators.ema1m26?.toFixed(6) || 'N/A'}`);
      console.log(`   EMA 200 (1m): ${results.indicators.ema1m200?.toFixed(6) || 'N/A'}`);
      console.log(`   EMA 12 (5m): ${results.indicators.ema5m12?.toFixed(6) || 'N/A'}`);
      console.log(`   EMA 18 (5m): ${results.indicators.ema5m18?.toFixed(6) || 'N/A'}`);
      console.log(`   EMA 20 (5m): ${results.indicators.ema5m20?.toFixed(6) || 'N/A'}`);
      console.log(`   EMA 26 (5m): ${results.indicators.ema5m26?.toFixed(6) || 'N/A'}`);
      console.log(`   EMA 200 (5m): ${results.indicators.ema5m200?.toFixed(6) || 'N/A'}`);
      console.log(`   MACD (1m): ${results.indicators.macd1m?.macd?.toFixed(6) || 'N/A'}`);
      console.log(`   MACD (5m): ${results.indicators.macd5m?.macd?.toFixed(6) || 'N/A'}`);
      console.log(`   VWAP (1m): ${results.indicators.vwap1m?.toFixed(6) || 'N/A'}`);
      console.log(`   LOD: ${results.indicators.lod?.toFixed(4) || 'N/A'}`);
      console.log(`   HOD: ${results.indicators.hod?.toFixed(4) || 'N/A'}`);
      console.log(`   Last 1m candle: ${results.lastCandle?.close?.toFixed(4) || 'N/A'}`);

      return results;
      
    } catch (error) {
      console.error(`❌ Error calculating indicators manually for ${ticker}:`, error.message);
      throw error;
    }
  }

  // Normalize timestamp to timeframe (floor to timeframe)
  normalizeToTimeframe(timestamp, timeframeMinutes) {
    const date = new Date(timestamp);
    const minutes = date.getMinutes();
    const flooredMinutes = Math.floor(minutes / timeframeMinutes) * timeframeMinutes;
    date.setMinutes(flooredMinutes, 0, 0); // Set seconds and milliseconds to 0
    return date;
  }

  // Validate that candle data is recent and not stale
  validateDataFreshness(ticker, candles1m, candles5m) {
    if (!candles1m || !candles5m || candles1m.length === 0 || candles5m.length === 0) {
      console.warn('⚠️ Cannot validate data freshness: insufficient candle data');
      return;
    }

    const last1mTime = new Date(candles1m[candles1m.length - 1].timestamp);
    const last5mTime = new Date(candles5m[candles5m.length - 1].timestamp);
    const now = new Date();
    
    // Calculate hours since last candle
    const hoursSinceLast1m = Math.round((now - last1mTime) / (1000 * 60 * 60));
    const hoursSinceLast5m = Math.round((now - last5mTime) / (1000 * 60 * 60));
    
    console.log(`🕐 Data Freshness Check for ${ticker}:`);
    console.log(`   Last 1m candle: ${last1mTime.toISOString()} (${hoursSinceLast1m}h ago)`);
    console.log(`   Last 5m candle: ${last5mTime.toISOString()} (${hoursSinceLast5m}h ago)`);
    console.log(`   Current time: ${now.toISOString()}`);
    
    // Warn if data is too old (more than 24 hours for trading analysis)
    const maxStaleHours = 24;
    
    if (hoursSinceLast1m > maxStaleHours) {
      console.warn(`⚠️ WARNING: 1m candle data is ${hoursSinceLast1m}h old (>${maxStaleHours}h)!`);
      console.warn(`   This may result in inaccurate technical analysis.`);
    }
    
    if (hoursSinceLast5m > maxStaleHours) {
      console.warn(`⚠️ WARNING: 5m candle data is ${hoursSinceLast5m}h old (>${maxStaleHours}h)!`);
      console.warn(`   This may result in inaccurate technical analysis.`);
    }
    
    if (hoursSinceLast1m <= maxStaleHours && hoursSinceLast5m <= maxStaleHours) {
      console.log(`✅ Data freshness verified: Both 1m and 5m candles are recent (within ${maxStaleHours}h)`);
    }
  }

  // Verify that 1m and 5m candles are properly aligned in time
  verifyTimeAlignment(candles1m, candles5m) {
    if (!candles1m || !candles5m || candles1m.length === 0 || candles5m.length === 0) {
      console.warn('⚠️ Cannot verify time alignment: insufficient candle data');
      return;
    }

    const last1mTime = new Date(candles1m[candles1m.length - 1].timestamp);
    const last5mTime = new Date(candles5m[candles5m.length - 1].timestamp);
    
    // Normalize 1m time to 5m timeframe for comparison
    const normalized1mTime = this.normalizeToTimeframe(last1mTime, 5);
    const normalized5mTime = this.normalizeToTimeframe(last5mTime, 5);
    
    console.log(`🕐 Time Alignment Check:`);
    console.log(`   Raw 1m time: ${last1mTime.toISOString()}`);
    console.log(`   Raw 5m time: ${last5mTime.toISOString()}`);
    console.log(`   Normalized 1m: ${normalized1mTime.toISOString()}`);
    console.log(`   Normalized 5m: ${normalized5mTime.toISOString()}`);
    
    // Check if normalized times match (within 1 minute tolerance)
    const timeDiff = Math.abs(normalized1mTime.getTime() - normalized5mTime.getTime());
    const maxAllowedDiff = 60 * 1000; // 1 minute in milliseconds
    
    if (timeDiff > maxAllowedDiff) {
      console.warn(`⚠️ Time alignment issue detected:`);
      console.warn(`   Time difference: ${Math.round(timeDiff / 1000)} seconds`);
      console.warn(`   This may cause indicator misalignment!`);
    } else {
      console.log(`✅ Time alignment verified: 1m and 5m candles are properly synchronized`);
    }
  }
}

module.exports = IndicatorsService;
