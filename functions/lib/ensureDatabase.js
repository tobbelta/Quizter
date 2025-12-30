/**
 * Ensure database tables exist - auto-initialize if needed
 * Used in background tasks that don't go through middleware
 */

import { ensureCategoriesTable } from './categories.js';
import { ensureAudienceTables } from './audiences.js';
import { ensureAiRulesTable } from './aiRules.js';

let dbInitialized = false;

async function tableExists(db, tableName) {
  const result = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).bind(tableName).first();
  return Boolean(result);
}

async function ensureTableColumns(db, tableName, columns) {
  const exists = await tableExists(db, tableName);
  if (!exists) {
    return;
  }
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
    { name: 'illustration_emoji', ddl: 'illustration_emoji TEXT' },
    { name: 'ai_generated', ddl: 'ai_generated BOOLEAN DEFAULT FALSE' },
    { name: 'ai_generation_provider', ddl: 'ai_generation_provider TEXT' },
    { name: 'ai_generation_model', ddl: 'ai_generation_model TEXT' },
    { name: 'validated', ddl: 'validated BOOLEAN DEFAULT FALSE' },
    { name: 'ai_validated', ddl: 'ai_validated BOOLEAN DEFAULT FALSE' },
    { name: 'ai_validation_result', ddl: 'ai_validation_result TEXT' },
    { name: 'ai_validated_at', ddl: 'ai_validated_at INTEGER' },
    { name: 'time_sensitive', ddl: 'time_sensitive BOOLEAN DEFAULT FALSE' },
    { name: 'best_before_at', ddl: 'best_before_at INTEGER' },
    { name: 'quarantined', ddl: 'quarantined BOOLEAN DEFAULT FALSE' },
    { name: 'quarantined_at', ddl: 'quarantined_at INTEGER' },
    { name: 'quarantine_reason', ddl: 'quarantine_reason TEXT' },
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

async function ensureRunsSchema(db) {
  const exists = await tableExists(db, 'runs');
  if (!exists) {
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
  }

  await ensureTableColumns(db, 'runs', [
    { name: 'updated_at', ddl: 'updated_at INTEGER' },
    { name: 'closed_at', ddl: 'closed_at INTEGER' },
    { name: 'status', ddl: 'status TEXT' },
    { name: 'question_ids', ddl: 'question_ids TEXT' },
    { name: 'checkpoints', ddl: 'checkpoints TEXT' },
    { name: 'route', ddl: 'route TEXT' },
    { name: 'join_code', ddl: 'join_code TEXT' },
    { name: 'created_by', ddl: 'created_by TEXT' },
    { name: 'created_at', ddl: 'created_at INTEGER' },
    { name: 'name', ddl: 'name TEXT' },
    { name: 'payment_policy', ddl: 'payment_policy TEXT' },
    { name: 'payment_status', ddl: 'payment_status TEXT' },
    { name: 'payment_total_amount', ddl: 'payment_total_amount INTEGER' },
    { name: 'payment_host_amount', ddl: 'payment_host_amount INTEGER' },
    { name: 'payment_player_amount', ddl: 'payment_player_amount INTEGER' },
    { name: 'payment_currency', ddl: 'payment_currency TEXT' },
    { name: 'payment_provider_id', ddl: 'payment_provider_id TEXT' },
    { name: 'expected_players', ddl: 'expected_players INTEGER' },
    { name: 'anonymous_policy', ddl: 'anonymous_policy TEXT' },
    { name: 'max_anonymous', ddl: 'max_anonymous INTEGER' },
    { name: 'host_payment_id', ddl: 'host_payment_id TEXT' },
  ]);
}

async function ensureParticipantsSchema(db) {
  const exists = await tableExists(db, 'participants');
  if (!exists) {
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
  }

  await ensureTableColumns(db, 'participants', [
    { name: 'completed_at', ddl: 'completed_at INTEGER' },
    { name: 'last_seen', ddl: 'last_seen INTEGER' },
    { name: 'user_id', ddl: 'user_id TEXT' },
    { name: 'alias', ddl: 'alias TEXT' },
    { name: 'joined_at', ddl: 'joined_at INTEGER' },
    { name: 'run_id', ddl: 'run_id TEXT' },
    { name: 'device_id', ddl: 'device_id TEXT' },
    { name: 'payment_status', ddl: 'payment_status TEXT' },
    { name: 'payment_amount', ddl: 'payment_amount INTEGER' },
    { name: 'payment_currency', ddl: 'payment_currency TEXT' },
    { name: 'payment_provider_id', ddl: 'payment_provider_id TEXT' },
    { name: 'payment_id', ddl: 'payment_id TEXT' },
    { name: 'is_anonymous', ddl: 'is_anonymous BOOLEAN DEFAULT FALSE' },
  ]);
}

async function ensureAnswersSchema(db) {
  const exists = await tableExists(db, 'answers');
  if (!exists) {
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
  }

  await ensureTableColumns(db, 'answers', [
    { name: 'is_correct', ddl: 'is_correct BOOLEAN' },
    { name: 'answered_at', ddl: 'answered_at INTEGER' },
    { name: 'answer_index', ddl: 'answer_index INTEGER' },
    { name: 'question_id', ddl: 'question_id TEXT' },
    { name: 'participant_id', ddl: 'participant_id TEXT' },
  ]);
}

async function ensurePaymentsSchema(db) {
  const settingsExists = await tableExists(db, 'payment_settings');
  if (!settingsExists) {
    await db.prepare(`
      CREATE TABLE payment_settings (
        id TEXT PRIMARY KEY,
        config TEXT NOT NULL,
        updated_at INTEGER
      )
    `).run();
  }

  await ensureTableColumns(db, 'payment_settings', [
    { name: 'config', ddl: 'config TEXT' },
    { name: 'updated_at', ddl: 'updated_at INTEGER' },
  ]);

  const paymentsExists = await tableExists(db, 'payments');
  if (!paymentsExists) {
    await db.prepare(`
      CREATE TABLE payments (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        run_id TEXT,
        participant_id TEXT,
        provider_id TEXT NOT NULL,
        provider_type TEXT NOT NULL,
        payment_type TEXT NOT NULL,
        status TEXT NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL,
        provider_payment_id TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
      )
    `).run();
  }

  await ensureTableColumns(db, 'payments', [
    { name: 'user_id', ddl: 'user_id TEXT' },
    { name: 'run_id', ddl: 'run_id TEXT' },
    { name: 'participant_id', ddl: 'participant_id TEXT' },
    { name: 'provider_id', ddl: 'provider_id TEXT' },
    { name: 'provider_type', ddl: 'provider_type TEXT' },
    { name: 'payment_type', ddl: 'payment_type TEXT' },
    { name: 'status', ddl: 'status TEXT' },
    { name: 'amount', ddl: 'amount INTEGER' },
    { name: 'currency', ddl: 'currency TEXT' },
    { name: 'provider_payment_id', ddl: 'provider_payment_id TEXT' },
    { name: 'metadata', ddl: 'metadata TEXT' },
    { name: 'created_at', ddl: 'created_at INTEGER' },
    { name: 'updated_at', ddl: 'updated_at INTEGER' },
  ]);

  const subscriptionsExists = await tableExists(db, 'subscriptions');
  if (!subscriptionsExists) {
    await db.prepare(`
      CREATE TABLE subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        status TEXT NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL,
        period TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        provider_payment_id TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
      )
    `).run();
  }

  await ensureTableColumns(db, 'subscriptions', [
    { name: 'user_id', ddl: 'user_id TEXT' },
    { name: 'provider_id', ddl: 'provider_id TEXT' },
    { name: 'status', ddl: 'status TEXT' },
    { name: 'amount', ddl: 'amount INTEGER' },
    { name: 'currency', ddl: 'currency TEXT' },
    { name: 'period', ddl: 'period TEXT' },
    { name: 'started_at', ddl: 'started_at INTEGER' },
    { name: 'expires_at', ddl: 'expires_at INTEGER' },
    { name: 'provider_payment_id', ddl: 'provider_payment_id TEXT' },
    { name: 'metadata', ddl: 'metadata TEXT' },
    { name: 'created_at', ddl: 'created_at INTEGER' },
    { name: 'updated_at', ddl: 'updated_at INTEGER' },
  ]);
}

async function ensureMessagesSchema(db) {
  const messagesExists = await tableExists(db, 'messages');
  if (!messagesExists) {
    await db.prepare(`
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        type TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        created_by TEXT
      )
    `).run();
  }

  await ensureTableColumns(db, 'messages', [
    { name: 'title', ddl: 'title TEXT' },
    { name: 'body', ddl: 'body TEXT' },
    { name: 'type', ddl: 'type TEXT' },
    { name: 'target_type', ddl: 'target_type TEXT' },
    { name: 'target_id', ddl: 'target_id TEXT' },
    { name: 'metadata', ddl: 'metadata TEXT' },
    { name: 'created_at', ddl: 'created_at INTEGER' },
    { name: 'updated_at', ddl: 'updated_at INTEGER' },
    { name: 'created_by', ddl: 'created_by TEXT' },
  ]);

  const statesExists = await tableExists(db, 'message_states');
  if (!statesExists) {
    await db.prepare(`
      CREATE TABLE message_states (
        message_id TEXT NOT NULL,
        recipient_type TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        read_at INTEGER,
        deleted_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        PRIMARY KEY (message_id, recipient_type, recipient_id)
      )
    `).run();
  }

  await ensureTableColumns(db, 'message_states', [
    { name: 'message_id', ddl: 'message_id TEXT' },
    { name: 'recipient_type', ddl: 'recipient_type TEXT' },
    { name: 'recipient_id', ddl: 'recipient_id TEXT' },
    { name: 'read_at', ddl: 'read_at INTEGER' },
    { name: 'deleted_at', ddl: 'deleted_at INTEGER' },
    { name: 'created_at', ddl: 'created_at INTEGER' },
    { name: 'updated_at', ddl: 'updated_at INTEGER' },
  ]);

  await db.prepare('CREATE INDEX IF NOT EXISTS idx_messages_target ON messages(target_type, target_id)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_message_states_recipient ON message_states(recipient_type, recipient_id)').run();
}

async function addMissingColumns(db) {
  try {
    await ensureRunsSchema(db);
    await ensureParticipantsSchema(db);
    await ensureAnswersSchema(db);
    await ensureQuestionsSchema(db);
    await ensureCategoriesTable(db);
    await ensureAudienceTables(db);
    await ensureAiRulesTable(db);
    await ensurePaymentsSchema(db);
    await ensureMessagesSchema(db);
  } catch (error) {
    console.log('[ensureDatabase] Table recreation error:', error.message);
    try {
      await ensureQuestionsSchema(db);
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
        time_sensitive BOOLEAN DEFAULT FALSE,
        best_before_at INTEGER,
        quarantined BOOLEAN DEFAULT FALSE,
        quarantined_at INTEGER,
        quarantine_reason TEXT,
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
        route TEXT,
        payment_policy TEXT,
        payment_status TEXT,
        payment_total_amount INTEGER,
        payment_host_amount INTEGER,
        payment_player_amount INTEGER,
        payment_currency TEXT,
        payment_provider_id TEXT,
        expected_players INTEGER,
        anonymous_policy TEXT,
        max_anonymous INTEGER,
        host_payment_id TEXT
      )`,
      `CREATE TABLE participants (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        user_id TEXT,
        alias TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        completed_at INTEGER,
        last_seen INTEGER,
        payment_status TEXT,
        payment_amount INTEGER,
        payment_currency TEXT,
        payment_provider_id TEXT,
        payment_id TEXT,
        is_anonymous BOOLEAN DEFAULT FALSE
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
      `CREATE TABLE payment_settings (
        id TEXT PRIMARY KEY,
        config TEXT NOT NULL,
        updated_at INTEGER
      )`,
      `CREATE TABLE payments (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        run_id TEXT,
        participant_id TEXT,
        provider_id TEXT NOT NULL,
        provider_type TEXT NOT NULL,
        payment_type TEXT NOT NULL,
        status TEXT NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL,
        provider_payment_id TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
      )`,
      `CREATE TABLE subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        status TEXT NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL,
        period TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        provider_payment_id TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
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
      `CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        type TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        created_by TEXT
      )`,
      `CREATE TABLE message_states (
        message_id TEXT NOT NULL,
        recipient_type TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        read_at INTEGER,
        deleted_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        PRIMARY KEY (message_id, recipient_type, recipient_id)
      )`,
      `CREATE TABLE ai_rule_sets (
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        config TEXT NOT NULL,
        updated_at INTEGER,
        PRIMARY KEY (scope_type, scope_id)
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
    await ensurePaymentsSchema(db);
    await ensureMessagesSchema(db);
    dbInitialized = true;

    // Ensure schema is fully compatible even if older local schema existed
    await ensureQuestionsSchema(db);
    
  } catch (error) {
    console.error('[ensureDatabase] Error:', error);
    throw error;
  }
}
