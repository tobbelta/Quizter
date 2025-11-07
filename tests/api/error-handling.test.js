/**
 * API Error Handling Test
 * Tests that APIs handle invalid input and edge cases correctly
 */

// Polyfill fetch for Node.js
if (typeof global.fetch === 'undefined') {
    const { default: fetch } = require('node-fetch');
    global.fetch = fetch;
}

const BASE_URL = process.env.TEST_URL || 'http://127.0.0.1:8788';

class ErrorHandlingTest {
    async makeRequest(path, options = {}) {
        const url = `${BASE_URL}${path}`;
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        const text = await response.text();
        const data = text ? JSON.parse(text) : null;
        
        return { status: response.status, data };
    }

    async testCreateRunWithoutName() {
        console.log('🧪 Testing create run without required name field...');
        
        const result = await this.makeRequest('/api/runs', {
            method: 'POST',
            body: JSON.stringify({
                question_ids: ['q1']
            })
        });

        if (result.status !== 400) {
            throw new Error(`Expected 400, got ${result.status}`);
        }

        if (!result.data.error) {
            throw new Error('Expected error message');
        }

        console.log('✅ Correctly rejected run without name');
    }

    async testRegisterParticipantWithoutRunId() {
        console.log('🧪 Testing register participant without run_id...');
        
        const result = await this.makeRequest('/api/participants', {
            method: 'POST',
            body: JSON.stringify({
                alias: 'TestPlayer'
            })
        });

        if (result.status !== 400) {
            throw new Error(`Expected 400, got ${result.status}`);
        }

        console.log('✅ Correctly rejected participant without run_id');
    }

    async testGetNonExistentRun() {
        console.log('🧪 Testing get non-existent run...');
        
        const result = await this.makeRequest('/api/runs/non-existent-id');

        if (result.status !== 404) {
            throw new Error(`Expected 404, got ${result.status}`);
        }

        console.log('✅ Correctly returned 404 for non-existent run');
    }

    async testRecordAnswerWithoutParticipantId() {
        console.log('🧪 Testing record answer without participant_id...');
        
        const result = await this.makeRequest('/api/answers', {
            method: 'POST',
            body: JSON.stringify({
                question_id: 'q1',
                answer_index: 0
            })
        });

        if (result.status !== 400) {
            throw new Error(`Expected 400, got ${result.status}`);
        }

        console.log('✅ Correctly rejected answer without participant_id');
    }

    async testInvalidJsonPayload() {
        console.log('🧪 Testing invalid JSON payload...');
        
        const response = await fetch(`${BASE_URL}/api/runs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: 'invalid json{'
        });

        if (response.status !== 400 && response.status !== 500) {
            throw new Error(`Expected 400/500, got ${response.status}`);
        }

        console.log('✅ Correctly handled invalid JSON');
    }

    async testMethodNotAllowed() {
        console.log('🧪 Testing method not allowed...');
        
        const response = await fetch(`${BASE_URL}/api/runs`, {
            method: 'PATCH',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (response.status !== 405) {
            throw new Error(`Expected 405, got ${response.status}`);
        }

        console.log('✅ Correctly returned 405 for unsupported method');
    }

    async run() {
        const startTime = Date.now();
        console.log('🚀 Starting Error Handling Tests...\n');

        try {
            await this.testCreateRunWithoutName();
            await this.testRegisterParticipantWithoutRunId();
            await this.testGetNonExistentRun();
            await this.testRecordAnswerWithoutParticipantId();
            await this.testInvalidJsonPayload();
            await this.testMethodNotAllowed();

            const duration = Date.now() - startTime;
            console.log(`\n🎉 ALL ERROR HANDLING TESTS PASSED! (${duration}ms)`);
            console.log('APIs handle errors correctly ✅\n');

            return true;

        } catch (error) {
            console.error('\n❌ TEST FAILED:', error.message);
            console.error('Error handling needs improvement\n');
            return false;
        }
    }
}

// Export for programmatic use
module.exports = { ErrorHandlingTest };

// Run if called directly
if (require.main === module) {
    (async () => {
        const test = new ErrorHandlingTest();
        const success = await test.run();
        process.exit(success ? 0 : 1);
    })();
}
