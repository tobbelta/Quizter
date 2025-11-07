/**
 * Concurrent Operations Test
 * Tests that multiple operations can happen simultaneously without conflicts
 */

// Polyfill fetch for Node.js
if (typeof global.fetch === 'undefined') {
    const { default: fetch } = require('node-fetch');
    global.fetch = fetch;
}

const BASE_URL = process.env.TEST_URL || 'http://127.0.0.1:8788';

class ConcurrentOperationsTest {
    constructor() {
        this.testRunId = null;
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

        return response.json();
    }

    async testMultipleParticipantsJoinSimultaneously() {
        console.log('🧪 Testing multiple participants joining simultaneously...');
        
        // Create a run first
        const run = await this.makeRequest('/api/runs', {
            method: 'POST',
            body: JSON.stringify({
                name: 'Concurrency Test Game',
                question_ids: ['q1', 'q2']
            })
        });

        this.testRunId = run.run.id;

        // Create 10 participants simultaneously
        const participantPromises = [];
        for (let i = 0; i < 10; i++) {
            participantPromises.push(
                this.makeRequest('/api/participants', {
                    method: 'POST',
                    body: JSON.stringify({
                        run_id: this.testRunId,
                        alias: `Player${i}`,
                        email: `player${i}@test.com`
                    })
                })
            );
        }

        const participants = await Promise.all(participantPromises);

        // Verify all participants were created
        if (participants.length !== 10) {
            throw new Error(`Expected 10 participants, got ${participants.length}`);
        }

        // Verify all have unique IDs
        const ids = participants.map(p => p.participant.id);
        const uniqueIds = new Set(ids);
        if (uniqueIds.size !== 10) {
            throw new Error('Duplicate participant IDs detected!');
        }

        console.log(`✅ All 10 participants created with unique IDs`);
        return participants;
    }

    async testMultipleAnswersSubmittedSimultaneously(participants) {
        console.log('🧪 Testing multiple answers submitted simultaneously...');
        
        // Submit answers from all participants at once
        const answerPromises = participants.map((p, index) => 
            this.makeRequest('/api/answers', {
                method: 'POST',
                body: JSON.stringify({
                    participant_id: p.participant.id,
                    question_id: 'q1',
                    answer_index: index % 4,
                    is_correct: index % 2 === 0,
                    time_spent: 3000 + (index * 100)
                })
            })
        );

        const answers = await Promise.all(answerPromises);

        // Verify all answers were recorded
        if (answers.length !== participants.length) {
            throw new Error(`Expected ${participants.length} answers, got ${answers.length}`);
        }

        // Verify all have unique IDs
        const ids = answers.map(a => a.answer.id);
        const uniqueIds = new Set(ids);
        if (uniqueIds.size !== participants.length) {
            throw new Error('Duplicate answer IDs detected!');
        }

        console.log(`✅ All ${answers.length} answers recorded with unique IDs`);
        return answers;
    }

    async testMultipleRunsCreatedSimultaneously() {
        console.log('🧪 Testing multiple runs created simultaneously...');
        
        // Create 5 runs at the same time
        const runPromises = [];
        for (let i = 0; i < 5; i++) {
            runPromises.push(
                this.makeRequest('/api/runs', {
                    method: 'POST',
                    body: JSON.stringify({
                        name: `Concurrent Run ${i}`,
                        question_ids: ['q1']
                    })
                })
            );
        }

        const runs = await Promise.all(runPromises);

        // Verify all runs have unique join codes
        const joinCodes = runs.map(r => r.run.join_code);
        const uniqueCodes = new Set(joinCodes);
        if (uniqueCodes.size !== 5) {
            throw new Error('Duplicate join codes detected!');
        }

        console.log(`✅ All 5 runs created with unique join codes`);
        
        // Cleanup these test runs
        await Promise.all(runs.map(r => 
            this.makeRequest(`/api/runs/${r.run.id}`, { method: 'DELETE' })
        ));
        
        return runs;
    }

    async cleanup(participants) {
        console.log('🧹 Cleaning up test data...');
        
        try {
            // Delete all participants (will cascade delete answers)
            if (participants && participants.length > 0) {
                await Promise.all(participants.map(p => 
                    this.makeRequest(`/api/participants/${p.participant.id}`, {
                        method: 'DELETE'
                    })
                ));
            }

            // Delete test run
            if (this.testRunId) {
                await this.makeRequest(`/api/runs/${this.testRunId}`, {
                    method: 'DELETE'
                });
            }

            console.log('✅ Cleanup completed');
        } catch (error) {
            console.warn('⚠️ Cleanup warning:', error.message);
        }
    }

    async run() {
        const startTime = Date.now();
        console.log('🚀 Starting Concurrent Operations Tests...\n');

        let participants = null;

        try {
            participants = await this.testMultipleParticipantsJoinSimultaneously();
            await this.testMultipleAnswersSubmittedSimultaneously(participants);
            await this.testMultipleRunsCreatedSimultaneously();

            const duration = Date.now() - startTime;
            console.log(`\n🎉 ALL CONCURRENCY TESTS PASSED! (${duration}ms)`);
            console.log('System handles concurrent operations correctly ✅\n');

            return true;

        } catch (error) {
            console.error('\n❌ TEST FAILED:', error.message);
            console.error('Concurrency issues detected\n');
            return false;

        } finally {
            await this.cleanup(participants);
        }
    }
}

// Export for programmatic use
module.exports = { ConcurrentOperationsTest };

// Run if called directly
if (require.main === module) {
    (async () => {
        const test = new ConcurrentOperationsTest();
        const success = await test.run();
        process.exit(success ? 0 : 1);
    })();
}
