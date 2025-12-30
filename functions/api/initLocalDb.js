/**
 * Initialize local development database with schema
 * Only works in local development (wrangler pages dev)
 * Call this endpoint once after starting wrangler to set up tables
 */

import { seedDefaultCategories } from '../lib/categories.js';
import { seedDefaultAudiences } from '../lib/audiences.js';

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
      DROP TABLE IF EXISTS categories;
      DROP TABLE IF EXISTS age_group_targets;
      DROP TABLE IF EXISTS target_audiences;
      DROP TABLE IF EXISTS age_groups;
      DROP TABLE IF EXISTS donations;
      DROP TABLE IF EXISTS provider_settings;
      DROP TABLE IF EXISTS ai_rule_sets;
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
        ai_generated BOOLEAN DEFAULT FALSE,
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
        structure_validation_result TEXT,
        manually_approved BOOLEAN DEFAULT FALSE,
        manually_rejected BOOLEAN DEFAULT FALSE,
        manually_approved_at INTEGER,
        manually_rejected_at INTEGER,
        reported BOOLEAN DEFAULT FALSE,
        report_count INTEGER DEFAULT 0,
        reports TEXT,
        report_resolved_at INTEGER,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
      );

      CREATE TABLE categories (
        name TEXT PRIMARY KEY,
        description TEXT,
        prompt TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
      );

      CREATE TABLE age_groups (
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
      );

      CREATE TABLE target_audiences (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        description TEXT,
        prompt TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER
      );

      CREATE TABLE age_group_targets (
        age_group_id TEXT NOT NULL,
        target_audience_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (age_group_id, target_audience_id)
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
        host_payment_id TEXT,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      );
      
      CREATE TABLE participants (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        user_id TEXT,
        alias TEXT NOT NULL,
        device_id TEXT,
        joined_at INTEGER NOT NULL,
        completed_at INTEGER,
        last_seen INTEGER,
        payment_status TEXT,
        payment_amount INTEGER,
        payment_currency TEXT,
        payment_provider_id TEXT,
        payment_id TEXT,
        is_anonymous BOOLEAN DEFAULT FALSE,
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

      CREATE TABLE payment_settings (
        id TEXT PRIMARY KEY,
        config TEXT NOT NULL,
        updated_at INTEGER
      );

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
      );

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
      );
      
      CREATE TABLE provider_settings (
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
      );

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
      );

      CREATE TABLE message_states (
        message_id TEXT NOT NULL,
        recipient_type TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        read_at INTEGER,
        deleted_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER,
        PRIMARY KEY (message_id, recipient_type, recipient_id)
      );

      CREATE TABLE analytics_events (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        user_id TEXT,
        event_type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        device_type TEXT,
        os TEXT,
        browser TEXT,
        timezone TEXT,
        user_agent TEXT,
        language TEXT,
        screen_resolution TEXT,
        path TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE ai_rule_sets (
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        config TEXT NOT NULL,
        updated_at INTEGER,
        PRIMARY KEY (scope_type, scope_id)
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

    await seedDefaultCategories(env.DB);
    await seedDefaultAudiences(env.DB);
    
    console.log('[initLocalDb] Database initialized successfully!');
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Local database initialized successfully',
      tablesCreated: 12
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
