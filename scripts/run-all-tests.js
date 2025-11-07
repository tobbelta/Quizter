/**
 * Master Test Runner
 * Automatically discovers and runs all API tests in tests/api/ directory
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const COLORS = {
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m',
    MAGENTA: '\x1b[35m',
    CYAN: '\x1b[36m',
    RESET: '\x1b[0m',
    BOLD: '\x1b[1m'
};

function log(color, message) {
    console.log(`${color}${message}${COLORS.RESET}`);
}

async function runTest(testFile) {
    return new Promise((resolve) => {
        const testName = path.basename(testFile, '.js');
        const startTime = Date.now();

        log(COLORS.CYAN, `\n${'='.repeat(70)}`);
        log(COLORS.BOLD + COLORS.CYAN, `  Running: ${testName}`);
        log(COLORS.CYAN, '='.repeat(70) + '\n');

        const testProcess = spawn('node', [testFile], {
            stdio: 'inherit',
            shell: true
        });

        testProcess.on('close', (code) => {
            const duration = Date.now() - startTime;
            
            if (code === 0) {
                log(COLORS.GREEN, `\n✅ ${testName} PASSED (${duration}ms)`);
                resolve({ testName, passed: true, duration });
            } else {
                log(COLORS.RED, `\n❌ ${testName} FAILED (${duration}ms)`);
                resolve({ testName, passed: false, duration });
            }
        });

        testProcess.on('error', (error) => {
            log(COLORS.RED, `\n💥 ${testName} ERROR: ${error.message}`);
            resolve({ testName, passed: false, duration: 0, error: error.message });
        });
    });
}

async function discoverTests() {
    const testsDir = path.join(__dirname, '../tests/api');
    const files = fs.readdirSync(testsDir);
    
    return files
        .filter(file => file.endsWith('.test.js'))
        .map(file => path.join(testsDir, file))
        .sort(); // Alphabetical order
}

async function runAllTests() {
    const overallStart = Date.now();
    
    log(COLORS.BOLD + COLORS.MAGENTA, '\n' + '█'.repeat(70));
    log(COLORS.BOLD + COLORS.MAGENTA, '  🚀 MASTER TEST SUITE - API Tests');
    log(COLORS.BOLD + COLORS.MAGENTA, '█'.repeat(70) + '\n');

    const testFiles = await discoverTests();
    
    if (testFiles.length === 0) {
        log(COLORS.YELLOW, '⚠️  No test files found in tests/api/');
        process.exit(1);
    }

    log(COLORS.BLUE, `📋 Discovered ${testFiles.length} test suite(s):\n`);
    testFiles.forEach((file, index) => {
        log(COLORS.BLUE, `   ${index + 1}. ${path.basename(file, '.js')}`);
    });
    log('');

    const results = [];
    
    for (const testFile of testFiles) {
        const result = await runTest(testFile);
        results.push(result);
    }

    const overallDuration = Date.now() - overallStart;
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const totalTests = results.length;

    // Summary
    log(COLORS.BOLD + COLORS.MAGENTA, '\n' + '█'.repeat(70));
    log(COLORS.BOLD + COLORS.MAGENTA, '  📊 TEST SUMMARY');
    log(COLORS.BOLD + COLORS.MAGENTA, '█'.repeat(70) + '\n');

    results.forEach(result => {
        const icon = result.passed ? '✅' : '❌';
        const color = result.passed ? COLORS.GREEN : COLORS.RED;
        log(color, `${icon} ${result.testName.padEnd(40)} ${result.duration}ms`);
    });

    log('');
    log(COLORS.BOLD, `Total Suites: ${totalTests}`);
    log(COLORS.GREEN, `Passed: ${passed}`);
    if (failed > 0) {
        log(COLORS.RED, `Failed: ${failed}`);
    }
    log(COLORS.BLUE, `Duration: ${overallDuration}ms`);

    log(COLORS.BOLD + COLORS.MAGENTA, '\n' + '█'.repeat(70) + '\n');

    if (failed === 0) {
        log(COLORS.BOLD + COLORS.GREEN, '🎉 ALL TEST SUITES PASSED! 🎉\n');
        process.exit(0);
    } else {
        log(COLORS.BOLD + COLORS.RED, `❌ ${failed} TEST SUITE(S) FAILED\n`);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    runAllTests().catch(error => {
        log(COLORS.RED, `\n💥 Fatal error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { runAllTests, discoverTests };
