/**
 * End-to-End Game Flow Test
 * Tests complete game functionality: create run → join participant → record answer
 * Cleans up after itself by deleting test data
 */

// Polyfill fetch for Node.js
if (typeof global.fetch === 'undefined') {
    const { default: fetch } = require('node-fetch');
    global.fetch = fetch;
}

const BASE_URL = process.env.TEST_URL || 'http://127.0.0.1:8788';

class GameFlowTest {
    constructor() {
        this.testData = {
            runId: null,
            participantId: null,
            answerId: null
        };
    }

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

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
        }

        return response.json();
    }

    async testCreateRun() {
        console.log('🎯 Testing create run...');
        
        const result = await this.makeRequest('/api/runs', {
            method: 'POST',
            body: JSON.stringify({
                name: 'E2E Test Game',
                question_ids: ['test-q1'],
                checkpoints: [],
                route: null
            })
        });

        if (!result.run || !result.run.id || !result.run.join_code) {
            throw new Error('Create run failed - missing id or join_code');
        }

        this.testData.runId = result.run.id;
        console.log(`✅ Run created: ID=${result.run.id}, Code=${result.run.join_code}`);
        return result.run;
    }

    async testRegisterParticipant(runId) {
        console.log('👤 Testing register participant...');
        
        const result = await this.makeRequest('/api/participants', {
            method: 'POST',
            body: JSON.stringify({
                run_id: runId,
                alias: 'E2E-TestPlayer'
            })
        });

        if (!result.participant || !result.participant.id || result.participant.alias !== 'E2E-TestPlayer') {
            throw new Error('Register participant failed');
        }

        this.testData.participantId = result.participant.id;
                console.log(`✅ Participant registered: ID=${result.participant.id}, Alias=${result.participant.alias}`);
        return result.participant;
    }

    async testRecordAnswer(participantId) {
        console.log('📝 Testing record answer...');
        
        const result = await this.makeRequest('/api/answers', {
            method: 'POST',
            body: JSON.stringify({
                participant_id: participantId,
                question_id: 'test-q1',
                answer_index: 1,
                is_correct: true
            })
        });

        if (!result.answer || !result.answer.id) {
            throw new Error('Record answer failed');
        }

        this.testData.answerId = result.answer.id;
        console.log(`✅ Answer recorded: ID=${result.answer.id}, Correct=${result.answer.is_correct}`);
        return result.answer;
    }

    async testDataVerification() {
        console.log('🔍 Verifying data persistence...');

        // Verify run exists
        console.log(`Checking run: ${this.testData.runId}`);
        const runResponse = await this.makeRequest(`/api/runs/${this.testData.runId}`);
        console.log('Run response:', JSON.stringify(runResponse, null, 2));
        if (!runResponse.run || runResponse.run.name !== 'E2E Test Game') {
            throw new Error('Run data verification failed');
        }

        // Verify participant exists
        const participantsResponse = await this.makeRequest(`/api/participants?runId=${this.testData.runId}`);
        const participant = participantsResponse.participants?.find(p => p.id === this.testData.participantId);
        if (!participant || participant.alias !== 'E2E-TestPlayer') {
            throw new Error('Participant data verification failed');
        }

        // Verify answer exists
        const answersResponse = await this.makeRequest(`/api/answers?participantId=${this.testData.participantId}`);
        const answer = answersResponse.answers?.find(a => a.id === this.testData.answerId);
        if (!answer || answer.question_id !== 'test-q1') {
            throw new Error('Answer data verification failed');
        }

        console.log('✅ All data verified successfully');
    }

    async cleanup() {
        console.log('🧹 Cleaning up test data...');
        
        try {
            // Delete answers first (if they have FK constraints)
            if (this.testData.answerId) {
                await this.makeRequest(`/api/answers/${this.testData.answerId}`, {
                    method: 'DELETE'
                });
                console.log('✅ Answer deleted');
            }

            // Delete participant
            if (this.testData.participantId) {
                await this.makeRequest(`/api/participants/${this.testData.participantId}`, {
                    method: 'DELETE'
                });
                console.log('✅ Participant deleted');
            }

            // Delete run
            if (this.testData.runId) {
                await this.makeRequest(`/api/runs/${this.testData.runId}`, {
                    method: 'DELETE'
                });
                console.log('✅ Run deleted');
            }

            console.log('🎉 Cleanup completed successfully');
        } catch (error) {
            console.warn('⚠️ Cleanup warning:', error.message);
            // Don't fail the test if cleanup fails
        }
    }

    async run() {
        const startTime = Date.now();
        console.log('🚀 Starting E2E Game Flow Test...\n');

        try {
            // Test complete flow
            const run = await this.testCreateRun();
            const participant = await this.testRegisterParticipant(run.id);
            await this.testRecordAnswer(participant.id);
            
            // Verify data persistence
            await this.testDataVerification();

            const duration = Date.now() - startTime;
            console.log(`\n🎉 ALL TESTS PASSED! (${duration}ms)`);
            console.log('Game system is fully functional ✅\n');

            return true;

        } catch (error) {
            console.error('\n❌ TEST FAILED:', error.message);
            console.error('Game system has issues that need fixing\n');
            return false;

        } finally {
            // Always attempt cleanup
            await this.cleanup();
        }
    }
}

// Export for programmatic use
module.exports = { GameFlowTest };

// Run if called directly
if (require.main === module) {
    (async () => {
        const test = new GameFlowTest();
        const success = await test.run();
        process.exit(success ? 0 : 1);
    })();
}