import fs from 'fs';
import path from 'path';

export class TestReporter {
  constructor() {
    this.results = [];
    this.currentVersion = null;
  }

  setVersion(version) {
    this.currentVersion = version;
  }

  addResult(scenarioName, stepNumber, description, status, error = null) {
    this.results.push({
      scenario: scenarioName,
      step: stepNumber,
      description,
      status: status, // 'funkar', 'fel', 'stoppad'
      error: error,
      timestamp: new Date().toISOString()
    });
  }

  generateReport() {
    let report = '';
    let currentScenario = '';
    let stepCounter = 1;

    // Gruppera resultat per scenario
    const scenarios = this.groupByScenario();

    for (const [scenarioName, steps] of Object.entries(scenarios)) {
      if (scenarioName !== currentScenario) {
        if (currentScenario) {
          report += '\n';
        }
        report += `  ${scenarioName.toUpperCase()}\n`;
        currentScenario = scenarioName;
        stepCounter = 1;
      }

      for (const step of steps) {
        const statusText = step.status === 'funkar' ? '- funkar' :
                          step.status === 'fel' ? '- fel' :
                          step.status === 'stoppad' ? '- STOPPAD PGA FEL' : '';

        report += `  ${stepCounter}. ${step.description} ${statusText}\n`;

        if (step.error && step.status === 'fel') {
          report += `     Error: ${step.error}\n`;
        }

        // Om detta steg misslyckades, stoppa här
        if (step.status === 'fel' || step.status === 'stoppad') {
          report += `\n  === TESTAD TILL OCH MED RAD:${stepCounter} ===\n`;
          report += `  === VERSION TESTAD: ${this.currentVersion || 'okänd'} ===\n`;
          report += `  === STATUS: [STOPPAD PGA FEL] ===\n`;
          break;
        }

        stepCounter++;
      }
    }

    // Om alla test passerade
    if (!report.includes('STOPPAD PGA FEL')) {
      report += `\n  === ALLA TESTER KLARADE ===\n`;
      report += `  === VERSION TESTAD: ${this.currentVersion || 'okänd'} ===\n`;
      report += `  === STATUS: [KOMPLETT] ===\n`;
    }

    return report;
  }

  groupByScenario() {
    const groups = {};
    for (const result of this.results) {
      if (!groups[result.scenario]) {
        groups[result.scenario] = [];
      }
      groups[result.scenario].push(result);
    }
    return groups;
  }

  saveReport(filename = 'automated-test-results.txt') {
    const report = this.generateReport();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fullFilename = `${timestamp}-${filename}`;

    fs.writeFileSync(fullFilename, report);
    console.log(`Test report saved to: ${fullFilename}`);
    return fullFilename;
  }

  getFailedSteps() {
    return this.results.filter(r => r.status === 'fel' || r.status === 'stoppad');
  }

  getPassedSteps() {
    return this.results.filter(r => r.status === 'funkar');
  }

  getSummary() {
    const total = this.results.length;
    const passed = this.getPassedSteps().length;
    const failed = this.getFailedSteps().length;

    return {
      total,
      passed,
      failed,
      passRate: total > 0 ? (passed / total * 100).toFixed(1) : 0
    };
  }
}