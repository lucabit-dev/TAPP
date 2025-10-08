const fs = require('fs');
const path = require('path');

class ConditionsService {
  constructor() {
    this.conditionNames = {
      macd5mPositive: 'MACD (5m) > 0',
      macd1mPositive: 'MACD (1m) > 0',
      ema18Above200_1m: 'EMA 18 (1m) > EMA 200 (1m)',
      ema18AboveVwap_1m: 'EMA 18 (1m) > VWAP (1m)',
      vwapAboveEma200_1m: 'VWAP (1m) > EMA 200 (1m)',
      closeAboveEma18_1m: 'Close > EMA 18 (1m)',
      ema200AboveEma18_5m: 'EMA 200 (5m) > EMA 18 (5m)'
    };
    
    // Statistics tracking
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

  // Helper method to extract MACD value
  getMACDValue(macdData) {
    if (!macdData || typeof macdData !== 'object') {
      return null;
    }
    return macdData.macd || null;
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

    // Extract MACD values properly
    const macd1mValue = this.getMACDValue(indicators.macd1m);
    const macd5mValue = this.getMACDValue(indicators.macd5m);
    
    // Use currentPrice if available, otherwise fall back to lastCandle.close
    const closePrice = currentPrice || lastCandle?.close;

    // Condition 1: MACD (5m) > 0
    conditions.macd5mPositive = this.isGreaterThan(macd5mValue, 0);
    console.log(`✅ Condition 1 - MACD (5m) > 0: ${conditions.macd5mPositive ? 'PASS' : 'FAIL'} (${macd5mValue})`);
    if (!conditions.macd5mPositive) {
      failedConditions.push({
        name: this.conditionNames.macd5mPositive,
        expected: '> 0',
        actual: macd5mValue || 'N/A',
        condition: 'macd5mPositive'
      });
    }

    // Condition 2: MACD (1m) > 0
    conditions.macd1mPositive = this.isGreaterThan(macd1mValue, 0);
    console.log(`✅ Condition 2 - MACD (1m) > 0: ${conditions.macd1mPositive ? 'PASS' : 'FAIL'} (${macd1mValue})`);
    if (!conditions.macd1mPositive) {
      failedConditions.push({
        name: this.conditionNames.macd1mPositive,
        expected: '> 0',
        actual: macd1mValue || 'N/A',
        condition: 'macd1mPositive'
      });
    }

    // Condition 3: EMA 18 (1m) > EMA 200 (1m) - Use tolerance for EMA comparisons
    conditions.ema18Above200_1m = this.isGreaterThanWithTolerance(indicators.ema1m18, indicators.ema1m200);
    const diff3 = indicators.ema1m18 - indicators.ema1m200;
    console.log(`✅ Condition 3 - EMA 18 (1m) > EMA 200 (1m): ${conditions.ema18Above200_1m ? 'PASS' : 'FAIL'} (${indicators.ema1m18} vs ${indicators.ema1m200}, diff: ${diff3.toFixed(6)})`);
    if (!conditions.ema18Above200_1m) {
      failedConditions.push({
        name: this.conditionNames.ema18Above200_1m,
        expected: `EMA 18 (${indicators.ema1m18}) > EMA 200 (${indicators.ema1m200})`,
        actual: `${indicators.ema1m18 || 'N/A'} vs ${indicators.ema1m200 || 'N/A'} (diff: ${diff3.toFixed(6)})`,
        condition: 'ema18Above200_1m'
      });
    }

    // Condition 4: EMA 18 (1m) > VWAP (1m) - Use tolerance for EMA/VWAP comparisons
    conditions.ema18AboveVwap_1m = this.isGreaterThanWithTolerance(indicators.ema1m18, indicators.vwap1m);
    const diff4 = indicators.ema1m18 - indicators.vwap1m;
    console.log(`✅ Condition 4 - EMA 18 (1m) > VWAP (1m): ${conditions.ema18AboveVwap_1m ? 'PASS' : 'FAIL'} (${indicators.ema1m18} vs ${indicators.vwap1m}, diff: ${diff4.toFixed(6)})`);
    if (!conditions.ema18AboveVwap_1m) {
      failedConditions.push({
        name: this.conditionNames.ema18AboveVwap_1m,
        expected: `EMA 18 (${indicators.ema1m18}) > VWAP (${indicators.vwap1m})`,
        actual: `${indicators.ema1m18 || 'N/A'} vs ${indicators.vwap1m || 'N/A'} (diff: ${diff4.toFixed(6)})`,
        condition: 'ema18AboveVwap_1m'
      });
    }

    // Condition 5: VWAP (1m) > EMA 200 (1m) - Use tolerance for VWAP/EMA comparisons
    conditions.vwapAboveEma200_1m = this.isGreaterThanWithTolerance(indicators.vwap1m, indicators.ema1m200);
    const diff5 = indicators.vwap1m - indicators.ema1m200;
    console.log(`✅ Condition 5 - VWAP (1m) > EMA 200 (1m): ${conditions.vwapAboveEma200_1m ? 'PASS' : 'FAIL'} (${indicators.vwap1m} vs ${indicators.ema1m200}, diff: ${diff5.toFixed(6)})`);
    if (!conditions.vwapAboveEma200_1m) {
      failedConditions.push({
        name: this.conditionNames.vwapAboveEma200_1m,
        expected: `VWAP (${indicators.vwap1m}) > EMA 200 (${indicators.ema1m200})`,
        actual: `${indicators.vwap1m || 'N/A'} vs ${indicators.ema1m200 || 'N/A'} (diff: ${diff5.toFixed(6)})`,
        condition: 'vwapAboveEma200_1m'
      });
    }

    // Condition 6: Close > EMA 18 (1m) - Use tolerance for price comparisons
    conditions.closeAboveEma18_1m = this.isGreaterThanWithTolerance(closePrice, indicators.ema1m18);
    const diff6 = closePrice - indicators.ema1m18;
    console.log(`✅ Condition 6 - Close > EMA 18 (1m): ${conditions.closeAboveEma18_1m ? 'PASS' : 'FAIL'} (${closePrice} vs ${indicators.ema1m18}, diff: ${diff6.toFixed(6)})`);
    if (!conditions.closeAboveEma18_1m) {
      failedConditions.push({
        name: this.conditionNames.closeAboveEma18_1m,
        expected: `Close (${closePrice}) > EMA 18 (${indicators.ema1m18})`,
        actual: `${closePrice || 'N/A'} vs ${indicators.ema1m18 || 'N/A'} (diff: ${diff6.toFixed(6)})`,
        condition: 'closeAboveEma18_1m'
      });
    }

    // Condition 7: EMA 200 (5m) > EMA 18 (5m) - CRITICAL: Verify these are from 5m candles
    conditions.ema200AboveEma18_5m = this.isGreaterThanWithTolerance(indicators.ema5m200, indicators.ema5m18);
    const diff7 = indicators.ema5m200 - indicators.ema5m18;
    console.log(`✅ Condition 7 - EMA 200 (5m) > EMA 18 (5m): ${conditions.ema200AboveEma18_5m ? 'PASS' : 'FAIL'} (${indicators.ema5m200} vs ${indicators.ema5m18}, diff: ${diff7.toFixed(6)})`);
    console.log(`🔍 EMA 5m Debug: EMA200=${indicators.ema5m200}, EMA18=${indicators.ema5m18} (calculated from 5m candles)`);
    if (!conditions.ema200AboveEma18_5m) {
      failedConditions.push({
        name: this.conditionNames.ema200AboveEma18_5m,
        expected: `EMA 200 (${indicators.ema5m200}) > EMA 18 (${indicators.ema5m18})`,
        actual: `${indicators.ema5m200 || 'N/A'} vs ${indicators.ema5m18 || 'N/A'} (diff: ${diff7.toFixed(6)})`,
        condition: 'ema200AboveEma18_5m'
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
        macd1mValue,
        macd5mValue,
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
