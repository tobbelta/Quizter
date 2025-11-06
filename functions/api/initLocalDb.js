/**
 * Initialize local development database with schema
 * Only works in local development (wrangler pages dev)
 * Call this endpoint once after starting wrangler to set up tables
 */

export async function onRequestGet({ env }) {
  try {
    console.log('[initLocalDb] Starting database initialization...');
    
    // Schema SQL
    const schemaSql = `
      DROP TABLE IF EXISTS answers;
      DROP TABLE IF EXISTS participants;
      DROP TABLE IF EXISTS runs;
      DROP TABLE IF EXISTS questions;
      DROP TABLE IF EXISTS users;
      DROP TABLE IF EXISTS donations;
      DROP TABLE IF EXISTS provider_settings;
      DROP TABLE IF EXISTS background_tasks;
      
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        display_name TEXT,
        created_at INTEGER NOT NULL,
        is_super_user BOOLEAN DEFAULT FALSE
      );
      
      CREATE TABLE questions (
        id TEXT PRIMARY KEY,
        question_sv TEXT NOT NULL,
        question_en TEXT,
        options_sv TEXT NOT NULL,
        options_en TEXT,
        correct_option INTEGER NOT NULL,
        explanation_sv TEXT,
        explanation_en TEXT,
        age_groups TEXT,
        categories TEXT,
        difficulty TEXT,
        audience TEXT,
        target_audience TEXT,
        source TEXT,
        illustration_svg TEXT,
        illustration_provider TEXT,
        illustration_generated_at INTEGER,
        ai_validated BOOLEAN DEFAULT FALSE,
        ai_validation_result TEXT,
        ai_validated_at INTEGER,
        manually_approved BOOLEAN DEFAULT FALSE,
        manually_rejected BOOLEAN DEFAULT FALSE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
      );
      
      CREATE TABLE runs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        join_code TEXT NOT NULL UNIQUE,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        closed_at INTEGER,
        question_ids TEXT NOT NULL,
        checkpoints TEXT NOT NULL,
        route TEXT,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      );
      
      CREATE TABLE participants (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        user_id TEXT,
        alias TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        completed_at INTEGER,
        last_seen INTEGER,
        FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      );
      
      CREATE TABLE answers (
        id TEXT PRIMARY KEY,
        participant_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        answer_index INTEGER NOT NULL,
        is_correct BOOLEAN NOT NULL,
        answered_at INTEGER NOT NULL,
        FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
      );
      
      CREATE TABLE donations (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        run_id TEXT,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'sek',
        stripe_payment_intent_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL
      );
      
      CREATE TABLE provider_settings (
        provider_id TEXT PRIMARY KEY,
        is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        is_available BOOLEAN NOT NULL DEFAULT TRUE,
        last_checked INTEGER,
        updated_at INTEGER
      );
      
      CREATE TABLE background_tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        task_type TEXT NOT NULL,
        status TEXT NOT NULL,
        label TEXT,
        description TEXT,
        payload TEXT,
        progress TEXT,
        result TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        started_at INTEGER,
        finished_at INTEGER
      );
    `;
    
    // Split by semicolon and execute each statement
    const statements = schemaSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    console.log(`[initLocalDb] Executing ${statements.length} SQL statements...`);
    
    for (const statement of statements) {
      await env.DB.prepare(statement).run();
    }
    
    console.log('[initLocalDb] Database initialized successfully!');
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Local database initialized successfully',
      tablesCreated: 8
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('[initLocalDb] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
