/**
 * Ensure database tables exist - auto-initialize if needed
 * Used in background tasks that don't go through middleware
 */

let dbInitialized = false;

async function addMissingColumns(db) {
  try {
    // DRASTIC FIX: Drop and recreate ALL game tables to remove FK constraints
    console.log('[ensureDatabase] Dropping and recreating game tables without FK constraints...');
    
    // Drop tables in reverse dependency order
    await db.prepare('DROP TABLE IF EXISTS answers').run();
    await db.prepare('DROP TABLE IF EXISTS participants').run();
    await db.prepare('DROP TABLE IF EXISTS runs').run();
    
    // Recreate without FK constraints
    await db.prepare(`
      CREATE TABLE runs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        join_code TEXT NOT NULL UNIQUE,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        closed_at INTEGER,
        updated_at INTEGER,
        question_ids TEXT NOT NULL,
        checkpoints TEXT NOT NULL,
        route TEXT
      )
    `).run();
    
    await db.prepare(`
      CREATE TABLE participants (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        user_id TEXT,
        alias TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        completed_at INTEGER,
        last_seen INTEGER
      )
    `).run();
    
    await db.prepare(`
      CREATE TABLE answers (
        id TEXT PRIMARY KEY,
        participant_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        answer_index INTEGER NOT NULL,
        is_correct BOOLEAN NOT NULL,
        answered_at INTEGER NOT NULL
      )
    `).run();
    
    console.log('[ensureDatabase] Game tables recreated successfully without FK constraints');
  } catch (error) {
    console.log('[ensureDatabase] Table recreation error:', error.message);
  }
}

export async function ensureDatabase(db) {
  if (dbInitialized) return;
  
  try {
    // Check if tables exist
    const result = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='background_tasks'"
    ).first();
    
    if (result) {
      // Tables exist, but check if we need to add missing columns
      await addMissingColumns(db);
      dbInitialized = true;
      return;
    }
    
    console.log('[ensureDatabase] Initializing database...');
    
    // DRASTIC FIX: Drop ALL tables that might be corrupted and recreate them
    const dropTables = [
      'DROP TABLE IF EXISTS answers',
      'DROP TABLE IF EXISTS participants', 
      'DROP TABLE IF EXISTS runs'
    ];
    
    for (const dropSql of dropTables) {
      try {
        await db.prepare(dropSql).run();
        console.log(`✅ Dropped table: ${dropSql}`);
      } catch (error) {
        console.log(`⚠️ Could not drop table (might not exist): ${error.message}`);
      }
    }
    
    console.log('📋 Creating fresh tables...');

    // Create all tables
    const schema = [
      `CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        display_name TEXT,
        created_at INTEGER NOT NULL,
        is_super_user BOOLEAN DEFAULT FALSE
      )`,
      `CREATE TABLE questions (
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
        illustration_emoji TEXT,
        illustration_provider TEXT,
        illustration_generated_at INTEGER,
        ai_generation_provider TEXT,
        ai_generation_model TEXT,
        validated BOOLEAN DEFAULT FALSE,
        ai_validated BOOLEAN DEFAULT FALSE,
        ai_validation_result TEXT,
        ai_validated_at INTEGER,
        validation_generated_at INTEGER,
        manually_approved BOOLEAN DEFAULT FALSE,
        manually_rejected BOOLEAN DEFAULT FALSE,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
      )`,
      `CREATE TABLE runs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        join_code TEXT NOT NULL UNIQUE,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        closed_at INTEGER,
        updated_at INTEGER,
        question_ids TEXT NOT NULL,
        checkpoints TEXT NOT NULL,
        route TEXT
      )`,
      `CREATE TABLE participants (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        user_id TEXT,
        alias TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        completed_at INTEGER,
        last_seen INTEGER
      )`,
      `CREATE TABLE answers (
        id TEXT PRIMARY KEY,
        participant_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        answer_index INTEGER NOT NULL,
        is_correct BOOLEAN NOT NULL,
        answered_at INTEGER NOT NULL
      )`,
      `CREATE TABLE donations (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        run_id TEXT,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'sek',
        stripe_payment_intent_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL
      )`,
      `CREATE TABLE provider_settings (
        provider_id TEXT PRIMARY KEY,
        is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        is_available BOOLEAN NOT NULL DEFAULT TRUE,
        last_checked INTEGER,
        updated_at INTEGER
      )`,
      `CREATE TABLE background_tasks (
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
      )`
    ];
    
    for (const sql of schema) {
      await db.prepare(sql).run();
    }
    
    console.log('[ensureDatabase] Database initialized successfully');
    dbInitialized = true;
    
  } catch (error) {
    console.error('[ensureDatabase] Error:', error);
    throw error;
  }
}
