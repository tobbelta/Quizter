import { ensureDatabase } from '../lib/ensureDatabase.js';

export async function onRequest({ env, request }) {
    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const db = env.DB;
        await ensureDatabase(db);
        
        // Check table structure
        const tableInfo = await db.prepare(`
            SELECT sql FROM sqlite_master 
            WHERE type='table' AND name='runs'
        `).first();

        const columns = await db.prepare(`
            PRAGMA table_info(runs)
        `).all();

        return new Response(JSON.stringify({ 
            success: true,
            tableInfo,
            columns
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Debug error:', error);
        return new Response(JSON.stringify({ 
            success: false, 
            error: error.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}