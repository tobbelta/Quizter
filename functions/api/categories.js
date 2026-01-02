import { ensureCategoriesTable, listCategories, renameCategoryInQuestions } from '../lib/categories.js';
import { logAuditEvent } from '../lib/auditLogs.js';

const isSuperUserRequest = (request, env) => {
  const userEmail = request.headers.get('x-user-email');
  const superuserEmail = env.SUPERUSER_EMAIL || 'admin@admin.se';
  if (!userEmail) return false;
  return userEmail.toLowerCase() === superuserEmail.toLowerCase();
};

const parseBoolean = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  return value === '1' || value.toLowerCase() === 'true';
};

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    const wantsInactive = parseBoolean(url.searchParams.get('includeInactive'));
    const includeInactive = wantsInactive && isSuperUserRequest(request, env);

    await ensureCategoriesTable(env.DB);
    const categories = await listCategories(env.DB, { includeInactive });

    return new Response(JSON.stringify({ success: true, categories }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (error) {
    console.error('[categories] GET error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!isSuperUserRequest(request, env)) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const payload = await request.json();
    const categories = Array.isArray(payload.categories) ? payload.categories : [];
    if (categories.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No categories provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    await ensureCategoriesTable(env.DB);
    const now = Date.now();

    for (const category of categories) {
      const name = String(category.name || '').trim();
      if (!name) {
        return new Response(JSON.stringify({ success: false, error: 'Category name is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const originalName = String(category.originalName || name).trim();
      const description = category.description ? String(category.description).trim() : '';
      const prompt = category.prompt ? String(category.prompt).trim() : '';
      const isActive = category.isActive === false ? 0 : 1;
      const parsedSortOrder = Number(category.sortOrder);
      const sortOrder = Number.isFinite(parsedSortOrder) ? parsedSortOrder : 0;

      if (originalName && originalName !== name) {
        const existing = await env.DB.prepare('SELECT name FROM categories WHERE name = ?')
          .bind(name)
          .first();
        if (existing) {
          return new Response(JSON.stringify({
            success: false,
            error: `Kategori med namnet "${name}" finns redan.`
          }), {
            status: 409,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        await env.DB.prepare(`
          UPDATE categories
          SET name = ?, description = ?, prompt = ?, is_active = ?, sort_order = ?, updated_at = ?
          WHERE name = ?
        `).bind(
          name,
          description,
          prompt,
          isActive,
          sortOrder,
          now,
          originalName
        ).run();

        await renameCategoryInQuestions(env.DB, originalName, name);
        continue;
      }

      const existing = await env.DB.prepare('SELECT name FROM categories WHERE name = ?')
        .bind(name)
        .first();
      if (existing) {
        await env.DB.prepare(`
          UPDATE categories
          SET description = ?, prompt = ?, is_active = ?, sort_order = ?, updated_at = ?
          WHERE name = ?
        `).bind(
          description,
          prompt,
          isActive,
          sortOrder,
          now,
          name
        ).run();
      } else {
        await env.DB.prepare(`
          INSERT INTO categories (
            name, description, prompt, is_active, sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          name,
          description,
          prompt,
          isActive,
          sortOrder,
          now,
          now
        ).run();
      }
    }

    const updated = await listCategories(env.DB, { includeInactive: true });
    const actorEmail = request.headers.get('x-user-email');
    const activeCount = updated.filter((category) => category.isActive !== false).length;
    try {
      await logAuditEvent(env.DB, {
        actorEmail,
        action: 'update',
        targetType: 'categories',
        details: {
          total: updated.length,
          active: activeCount,
          inactive: updated.length - activeCount,
          sample: updated.slice(0, 10).map((category) => category.name)
        }
      });
    } catch (error) {
      console.warn('[categories] Audit log failed:', error.message);
    }
    return new Response(JSON.stringify({ success: true, categories: updated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (error) {
    console.error('[categories] POST error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-email'
    }
  });
}
