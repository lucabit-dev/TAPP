const fs = require('fs');
const path = require('path');

class ConditionsService {
  constructor() {
    this.conditionNames = {
      macd5mPositive: 'MACD Histogram (5m) > 0',
      ema18Above200_1m: 'EMA 18 (1m) > EMA 200 (1m)',
      priceAboveVwap: 'Precio > VWAP (1m)'
    };
    
    // Statistics tracking
    this.statistics = {
      totalEvaluations: 0,
      totalPassed: 0,
      conditionCounts: {
        macd5mPositive: { passed: 0, failed: 0 },
        ema18Above200_1m: { passed: 0, failed: 0 },
        priceAboveVwap: { passed: 0, failed: 0 }
      }
    };
    
    // Floating point comparison epsilon
    this.EPSILON = 1e-10;
  }

  // Helper method for floating point comparison with tolerance
  isGreaterThan(a, b, tolerance = this.EPSILON) {
    if (a === null || a === undefined || b === null || b === undefined) {
      return false;
    }
    return (a - b) > tolerance;
  }

  // Helper method for EMA/VWAP comparisons with percentage tolerance
  isGreaterThanWithTolerance(a, b, percentageTolerance = 0.0001) {
    if (a === null || a === undefined || b === null || b === undefined) {
      return false;
    }
    const tolerance = Math.abs(b) * percentageTolerance;
    return (a - b) > tolerance;
  }

  // Helper method to extract MACD histogram value
  getMACDHistogram(macdData) {
    if (!macdData || typeof macdData !== 'object') {
      return null;
    }
    return macdData.histogram || null;
  }

  evaluateConditions(indicatorData) {
    const { indicators, lastCandle, currentPrice } = indicatorData;
    const conditions = {};
    const failedConditions = [];
    
    console.log(`\n🔍 Evaluating conditions for ${indicatorData.ticker || 'unknown'}...`);
    console.log('📊 Indicator Data:', {
      ema1m18: indicators.ema1m18,
      ema1m200: indicators.ema1m200,
      ema5m18: indicators.ema5m18,
      ema5m200: indicators.ema5m200,
      macd1m: indicators.macd1m,
      macd5m: indicators.macd5m,
      vwap1m: indicators.vwap1m,
      currentPrice: currentPrice,
      lastCandleClose: lastCandle?.close
    });

    // Extract MACD histogram value for 5m
    const macd5mHistogram = this.getMACDHistogram(indicators.macd5m);
    
    // Use currentPrice if available, otherwise fall back to lastCandle.close
    const closePrice = currentPrice || lastCandle?.close;

    // Condition 1: MACD Histogram (5m) > 0
    conditions.macd5mPositive = this.isGreaterThan(macd5mHistogram, 0);
    console.log(`✅ Condition 1 - MACD Histogram (5m) > 0: ${conditions.macd5mPositive ? 'PASS' : 'FAIL'} (${macd5mHistogram})`);
    if (!conditions.macd5mPositive) {
      failedConditions.push({
        name: this.conditionNames.macd5mPositive,
        expected: '> 0',
        actual: macd5mHistogram || 'N/A',
        condition: 'macd5mPositive'
      });
    }

    // Condition 2: EMA 18 (1m) > EMA 200 (1m)
    conditions.ema18Above200_1m = this.isGreaterThanWithTolerance(indicators.ema1m18, indicators.ema1m200);
    const diff2 = indicators.ema1m18 - indicators.ema1m200;
    console.log(`✅ Condition 2 - EMA 18 (1m) > EMA 200 (1m): ${conditions.ema18Above200_1m ? 'PASS' : 'FAIL'} (${indicators.ema1m18} vs ${indicators.ema1m200}, diff: ${diff2.toFixed(6)})`);
    if (!conditions.ema18Above200_1m) {
      failedConditions.push({
        name: this.conditionNames.ema18Above200_1m,
        expected: `EMA 18 (${indicators.ema1m18}) > EMA 200 (${indicators.ema1m200})`,
        actual: `${indicators.ema1m18 || 'N/A'} vs ${indicators.ema1m200 || 'N/A'} (diff: ${diff2.toFixed(6)})`,
        condition: 'ema18Above200_1m'
      });
    }

    // Condition 3: Precio > VWAP (1m)
    conditions.priceAboveVwap = this.isGreaterThanWithTolerance(closePrice, indicators.vwap1m);
    const diff3 = closePrice - indicators.vwap1m;
    console.log(`✅ Condition 3 - Precio > VWAP (1m): ${conditions.priceAboveVwap ? 'PASS' : 'FAIL'} (${closePrice} vs ${indicators.vwap1m}, diff: ${diff3.toFixed(6)})`);
    if (!conditions.priceAboveVwap) {
      failedConditions.push({
        name: this.conditionNames.priceAboveVwap,
        expected: `Precio (${closePrice}) > VWAP (${indicators.vwap1m})`,
        actual: `${closePrice || 'N/A'} vs ${indicators.vwap1m || 'N/A'} (diff: ${diff3.toFixed(6)})`,
        condition: 'priceAboveVwap'
      });
    }

    // Count passed conditions - CRITICAL: Verify boolean logic
    const passedConditions = Object.values(conditions).filter(Boolean).length;
    const totalConditions = Object.keys(conditions).length;
    const allConditionsMet = passedConditions === totalConditions;
    
    // Enhanced debugging output
    console.log(`\n📊 FINAL RESULT for ${indicatorData.ticker || 'unknown'}:`);
    console.log(`✅ Passed: ${passedConditions}/${totalConditions} conditions`);
    console.log(`🎯 All conditions met: ${allConditionsMet ? 'YES' : 'NO'}`);
    console.log(`🔍 Boolean Logic Verification:`);
    Object.entries(conditions).forEach(([key, value], index) => {
      console.log(`   ${index + 1}. ${key}: ${value ? 'TRUE' : 'FALSE'}`);
    });
    
    if (failedConditions.length > 0) {
      console.log(`❌ Failed conditions: ${failedConditions.map(f => f.name).join(', ')}`);
    }
    
    // Save debug data to file
    this.saveDebugLog(indicatorData.ticker, {
      timestamp: new Date().toISOString(),
      ticker: indicatorData.ticker,
      price: closePrice,
      conditions: conditions,
      passedConditions,
      totalConditions,
      allConditionsMet,
      failedConditions,
      indicators: indicatorData.indicators,
      candleCounts: indicatorData.candleCounts
    });
    
    console.log('─'.repeat(80));

    // Update statistics
    this.updateStatistics(conditions, allConditionsMet);

    return {
      conditions,
      passedConditions,
      totalConditions,
      allConditionsMet,
      failedConditions,
      score: `${passedConditions}/${totalConditions}`,
      debugInfo: {
        macd5mHistogram,
        closePrice,
        allIndicatorValues: {
          ema1m18: indicators.ema1m18,
          ema1m200: indicators.ema1m200,
          ema5m18: indicators.ema5m18,
          ema5m200: indicators.ema5m200,
          vwap1m: indicators.vwap1m,
          macd1m: indicators.macd1m,
          macd5m: indicators.macd5m
        }
      }
    };
  }

  // Update statistics tracking
  updateStatistics(conditions, allConditionsMet) {
    this.statistics.totalEvaluations++;
    if (allConditionsMet) {
      this.statistics.totalPassed++;
    }

    // Update individual condition counts
    Object.keys(conditions).forEach(conditionKey => {
      if (conditions[conditionKey]) {
        this.statistics.conditionCounts[conditionKey].passed++;
      } else {
        this.statistics.conditionCounts[conditionKey].failed++;
      }
    });
  }

  // Get statistics with failure rates
  getStatistics() {
    const stats = {
      totalEvaluations: this.statistics.totalEvaluations,
      totalPassed: this.statistics.totalPassed,
      totalFailed: this.statistics.totalEvaluations - this.statistics.totalPassed,
      passRate: this.statistics.totalEvaluations > 0 ? 
        (this.statistics.totalPassed / this.statistics.totalEvaluations * 100).toFixed(1) : 0,
      conditions: {}
    };

    // Calculate failure rates for each condition
    Object.keys(this.statistics.conditionCounts).forEach(conditionKey => {
      const counts = this.statistics.conditionCounts[conditionKey];
      const total = counts.passed + counts.failed;
      
      stats.conditions[conditionKey] = {
        name: this.conditionNames[conditionKey],
        passed: counts.passed,
        failed: counts.failed,
        total: total,
        passRate: total > 0 ? (counts.passed / total * 100).toFixed(1) : 0,
        failureRate: total > 0 ? (counts.failed / total * 100).toFixed(1) : 0
      };
    });

    return stats;
  }

  // Get top failing conditions
  getTopFailingConditions(limit = 5) {
    const stats = this.getStatistics();
    return Object.values(stats.conditions)
      .sort((a, b) => b.failed - a.failed)
      .slice(0, limit);
  }

  // Reset statistics
  resetStatistics() {
    this.statistics = {
      totalEvaluations: 0,
      totalPassed: 0,
      conditionCounts: {
        macd5mPositive: { passed: 0, failed: 0 },
        macd1mPositive: { passed: 0, failed: 0 },
        ema18Above200_1m: { passed: 0, failed: 0 },
        ema18AboveVwap_1m: { passed: 0, failed: 0 },
        vwapAboveEma200_1m: { passed: 0, failed: 0 },
        closeAboveEma18_1m: { passed: 0, failed: 0 },
        ema200AboveEma18_5m: { passed: 0, failed: 0 }
      }
    };
  }

  // Save debug log to file
  saveDebugLog(ticker, debugData) {
    try {
      const debugDir = path.join(__dirname, 'debug-logs');
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `debug-${ticker}-${timestamp}.json`;
      const filepath = path.join(debugDir, filename);
      
      fs.writeFileSync(filepath, JSON.stringify(debugData, null, 2));
      console.log(`💾 Debug log saved: ${filename}`);
    } catch (error) {
      console.error('Error saving debug log:', error);
    }
  }

  // Helper method to get condition summary
  getConditionSummary(evaluation) {
    return {
      score: evaluation.score,
      allMet: evaluation.allConditionsMet,
      failedCount: evaluation.failedConditions.length,
      failedConditions: evaluation.failedConditions
    };
  }
}

module.exports = ConditionsService;
