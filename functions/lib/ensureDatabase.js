/**
 * Ensure database tables exist - auto-initialize if needed
 * Used in background tasks that don't go through middleware
 */

import { ensureCategoriesTable } from './categories.js';
import { ensureAudienceTables } from './audiences.js';

let dbInitialized = false;

async function ensureTableColumns(db, tableName, columns) {
  const info = await db.prepare(`PRAGMA table_info(${tableName})`).all();
  const existing = new Set((info.results || []).map((col) => col.name));

  for (const column of columns) {
    if (existing.has(column.name)) continue;
    console.log(`[ensureDatabase] Adding missing column ${tableName}.${column.name}`);
    await db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${column.ddl}`).run();
  }
}

async function ensureQuestionsSchema(db) {
  await ensureTableColumns(db, 'questions', [
    { name: 'background_sv', ddl: 'background_sv TEXT' },
    { name: 'background_en', ddl: 'background_en TEXT' },
    { name: 'illustration_emoji', ddl: 'illustration_emoji TEXT' },
    { name: 'ai_generated', ddl: 'ai_generated BOOLEAN DEFAULT FALSE' },
    { name: 'ai_generation_provider', ddl: 'ai_generation_provider TEXT' },
    { name: 'ai_generation_model', ddl: 'ai_generation_model TEXT' },
    { name: 'validated', ddl: 'validated BOOLEAN DEFAULT FALSE' },
    { name: 'ai_validated', ddl: 'ai_validated BOOLEAN DEFAULT FALSE' },
    { name: 'ai_validation_result', ddl: 'ai_validation_result TEXT' },
    { name: 'ai_validated_at', ddl: 'ai_validated_at INTEGER' },
    { name: 'validation_generated_at', ddl: 'validation_generated_at INTEGER' },
    { name: 'structure_validation_result', ddl: 'structure_validation_result TEXT' },
    { name: 'created_by', ddl: 'created_by TEXT' },
    { name: 'manually_approved_at', ddl: 'manually_approved_at INTEGER' },
    { name: 'manually_rejected_at', ddl: 'manually_rejected_at INTEGER' },
    { name: 'reported', ddl: 'reported BOOLEAN DEFAULT FALSE' },
    { name: 'report_count', ddl: 'report_count INTEGER DEFAULT 0' },
    { name: 'reports', ddl: 'reports TEXT' },
    { name: 'report_resolved_at', ddl: 'report_resolved_at INTEGER' },
  ]);
}

async function ensureProviderSettingsSchema(db) {
  await ensureTableColumns(db, 'provider_settings', [
    { name: 'purpose_settings', ddl: 'purpose_settings TEXT' },
    { name: 'model', ddl: 'model TEXT' },
    { name: 'encrypted_api_key', ddl: 'encrypted_api_key TEXT' },
    { name: 'api_key_hint', ddl: 'api_key_hint TEXT' },
    { name: 'display_name', ddl: 'display_name TEXT' },
    { name: 'base_url', ddl: 'base_url TEXT' },
    { name: 'extra_headers', ddl: 'extra_headers TEXT' },
    { name: 'supports_response_format', ddl: 'supports_response_format BOOLEAN DEFAULT TRUE' },
    { name: 'max_questions_per_request', ddl: 'max_questions_per_request INTEGER' },
    { name: 'provider_type', ddl: 'provider_type TEXT' },
    { name: 'is_custom', ddl: 'is_custom BOOLEAN DEFAULT FALSE' },
  ]);
}

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

    // Ensure questions table has all expected columns for API compatibility
    await ensureQuestionsSchema(db);
    await ensureProviderSettingsSchema(db);
    await ensureCategoriesTable(db);
    await ensureAudienceTables(db);
  } catch (error) {
    console.log('[ensureDatabase] Table recreation error:', error.message);
    try {
      await ensureQuestionsSchema(db);
      await ensureProviderSettingsSchema(db);
      await ensureCategoriesTable(db);
      await ensureAudienceTables(db);
    } catch (schemaError) {
      console.log('[ensureDatabase] Questions schema ensure error:', schemaError.message);
    }
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
        background_sv TEXT,
        background_en TEXT,
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
      `CREATE TABLE categories (
        name TEXT PRIMARY KEY,
        description TEXT,
        prompt TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
      )`,
      `CREATE TABLE age_groups (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        description TEXT,
        prompt TEXT,
        min_age INTEGER,
        max_age INTEGER,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
      )`,
      `CREATE TABLE target_audiences (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        description TEXT,
        prompt TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
      )`,
      `CREATE TABLE age_group_targets (
        age_group_id TEXT NOT NULL,
        target_audience_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (age_group_id, target_audience_id)
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
        purpose_settings TEXT,
        model TEXT,
        encrypted_api_key TEXT,
        api_key_hint TEXT,
        display_name TEXT,
        base_url TEXT,
        extra_headers TEXT,
        supports_response_format BOOLEAN DEFAULT TRUE,
        max_questions_per_request INTEGER,
        provider_type TEXT,
        is_custom BOOLEAN DEFAULT FALSE,
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

    // Ensure schema is fully compatible even if older local schema existed
    await ensureQuestionsSchema(db);
    await ensureCategoriesTable(db);
    await ensureAudienceTables(db);
    dbInitialized = true;
    
  } catch (error) {
    console.error('[ensureDatabase] Error:', error);
    throw error;
  }
}
