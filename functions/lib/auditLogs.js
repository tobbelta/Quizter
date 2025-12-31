export const ensureAuditLogsSchema = async (db) => {
  const exists = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'").first();
  if (!exists) {
    await db.prepare(`
      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY,
        actor_id TEXT,
        actor_email TEXT,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        details TEXT,
        created_at INTEGER NOT NULL
      )
    `).run();
  }

  await db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_logs_target_type ON audit_logs(target_type)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_email ON audit_logs(actor_email)').run();
};

export const logAuditEvent = async (db, {
  actorId = null,
  actorEmail = null,
  action,
  targetType,
  targetId = null,
  details = null
}) => {
  if (!db || !action || !targetType) return;
  await ensureAuditLogsSchema(db);
  const payload = details ? JSON.stringify(details) : null;
  await db.prepare(
    `INSERT INTO audit_logs (id, actor_id, actor_email, action, target_type, target_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    actorId,
    actorEmail,
    action,
    targetType,
    targetId,
    payload,
    Date.now()
  ).run();
};
