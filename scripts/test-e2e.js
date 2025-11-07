#!/usr/bin/env node

/**
 * Local Test Runner
 * Starts dev server, runs E2E tests, and stops server
 */

const { spawn } = require('child_process');
const { GameFlowTest } = require('../tests/api/game-flow.test.js');

const COLORS = {
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m',
    RESET: '\x1b[0m'
};

function log(color, message) {
    console.log(`${color}${message}${COLORS.RESET}`);
}

async function waitForServer(url, timeout = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            const response = await fetch(`${url}/api/runs`);
            if (response.ok) {
                return true;
            }
        } catch (error) {
            // Server not ready yet
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return false;
}

async function runLocalTest() {
    log(COLORS.BLUE, '\n🚀 Starting Local E2E Test Runner...\n');

    let serverProcess = null;

    try {
        // Start dev server
        log(COLORS.YELLOW, '📦 Starting development server...');
        serverProcess = spawn('npm', ['run', 'dev:test'], {
            stdio: ['inherit', 'pipe', 'pipe'],
            shell: true
        });

        // Handle server output
        serverProcess.stdout.on('data', (data) => {
            const output = data.toString().trim();
            if (output) {
                console.log(`[server] ${output}`);
            }
        });

        serverProcess.stderr.on('data', (data) => {
            const output = data.toString().trim();
            if (output && !output.includes('ExperimentalWarning')) {
                console.error(`[server] ${output}`);
            }
        });

        // Wait for server to be ready
        log(COLORS.YELLOW, '⏳ Waiting for server to be ready...');
        const isReady = await waitForServer('http://127.0.0.1:8788');
        
        if (!isReady) {
            throw new Error('Server failed to start within timeout period');
        }

        log(COLORS.GREEN, '✅ Server is ready!\n');

        // Run E2E tests
        const test = new GameFlowTest();
        const success = await test.run();

        if (success) {
            log(COLORS.GREEN, '\n🎉 ALL TESTS PASSED! Ready for deployment ✅');
            return true;
        } else {
            log(COLORS.RED, '\n❌ TESTS FAILED! Fix issues before deploying');
            return false;
        }

    } catch (error) {
        log(COLORS.RED, `\n💥 Test runner error: ${error.message}`);
        return false;

    } finally {
        // Clean up server process
        if (serverProcess) {
            log(COLORS.YELLOW, '\n🧹 Stopping development server...');
            serverProcess.kill('SIGTERM');
            
            // Give it time to close gracefully
            setTimeout(() => {
                if (!serverProcess.killed) {
                    serverProcess.kill('SIGKILL');
                }
            }, 3000);
        }
    }
}

// Run if called directly
if (require.main === module) {
    (async () => {
        const success = await runLocalTest();
        process.exit(success ? 0 : 1);
    })();
}