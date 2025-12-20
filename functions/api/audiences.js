import {
  ensureAudienceTables,
  listAgeGroups,
  listTargetAudiences,
  listAgeGroupTargets,
  renameAgeGroupInQuestions,
  renameTargetAudienceInQuestions
} from '../lib/audiences.js';

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

    await ensureAudienceTables(env.DB);
    const [ageGroups, targetAudiences, mappings] = await Promise.all([
      listAgeGroups(env.DB, { includeInactive }),
      listTargetAudiences(env.DB, { includeInactive }),
      listAgeGroupTargets(env.DB, { includeInactive })
    ]);

    return new Response(JSON.stringify({
      success: true,
      ageGroups,
      targetAudiences,
      mappings
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (error) {
    console.error('[audiences] GET error:', error);
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
    const ageGroups = Array.isArray(payload.ageGroups) ? payload.ageGroups : [];
    const targetAudiences = Array.isArray(payload.targetAudiences) ? payload.targetAudiences : [];

    if (ageGroups.length === 0 || targetAudiences.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Både åldersgrupper och målgrupper måste skickas in.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    await ensureAudienceTables(env.DB);
    const now = Date.now();

    for (const audience of targetAudiences) {
      const id = String(audience.id || '').trim();
      if (!id) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Målgrupp måste ha ett ID.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const originalId = String(audience.originalId || id).trim();
      const label = String(audience.label || id).trim();
      const description = audience.description ? String(audience.description).trim() : '';
      const prompt = audience.prompt ? String(audience.prompt).trim() : '';
      const isActive = audience.isActive === false ? 0 : 1;
      const parsedSortOrder = Number(audience.sortOrder);
      const sortOrder = Number.isFinite(parsedSortOrder) ? parsedSortOrder : 0;

      if (originalId && originalId !== id) {
        const existing = await env.DB.prepare('SELECT id FROM target_audiences WHERE id = ?')
          .bind(id)
          .first();
        if (existing) {
          return new Response(JSON.stringify({
            success: false,
            error: `Målgrupp med ID "${id}" finns redan.`
          }), {
            status: 409,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        await env.DB.prepare(`
          UPDATE target_audiences
          SET id = ?, label = ?, description = ?, prompt = ?, is_active = ?, sort_order = ?, updated_at = ?
          WHERE id = ?
        `).bind(
          id,
          label,
          description,
          prompt,
          isActive,
          sortOrder,
          now,
          originalId
        ).run();

        await env.DB.prepare(`
          UPDATE age_group_targets
          SET target_audience_id = ?
          WHERE target_audience_id = ?
        `).bind(id, originalId).run();

        await renameTargetAudienceInQuestions(env.DB, originalId, id);
        continue;
      }

      const existing = await env.DB.prepare('SELECT id FROM target_audiences WHERE id = ?')
        .bind(id)
        .first();
      if (existing) {
        await env.DB.prepare(`
          UPDATE target_audiences
          SET label = ?, description = ?, prompt = ?, is_active = ?, sort_order = ?, updated_at = ?
          WHERE id = ?
        `).bind(
          label,
          description,
          prompt,
          isActive,
          sortOrder,
          now,
          id
        ).run();
      } else {
        await env.DB.prepare(`
          INSERT INTO target_audiences (
            id, label, description, prompt, is_active, sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          id,
          label,
          description,
          prompt,
          isActive,
          sortOrder,
          now,
          now
        ).run();
      }
    }

    for (const group of ageGroups) {
      const id = String(group.id || '').trim();
      if (!id) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Åldersgrupp måste ha ett ID.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const originalId = String(group.originalId || id).trim();
      const label = String(group.label || id).trim();
      const description = group.description ? String(group.description).trim() : '';
      const prompt = group.prompt ? String(group.prompt).trim() : '';
      const minAge = Number.isFinite(Number(group.minAge)) ? Number(group.minAge) : null;
      const maxAge = Number.isFinite(Number(group.maxAge)) ? Number(group.maxAge) : null;
      const isActive = group.isActive === false ? 0 : 1;
      const parsedSortOrder = Number(group.sortOrder);
      const sortOrder = Number.isFinite(parsedSortOrder) ? parsedSortOrder : 0;

      if (originalId && originalId !== id) {
        const existing = await env.DB.prepare('SELECT id FROM age_groups WHERE id = ?')
          .bind(id)
          .first();
        if (existing) {
          return new Response(JSON.stringify({
            success: false,
            error: `Åldersgrupp med ID "${id}" finns redan.`
          }), {
            status: 409,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        await env.DB.prepare(`
          UPDATE age_groups
          SET id = ?, label = ?, description = ?, prompt = ?, min_age = ?, max_age = ?, is_active = ?, sort_order = ?, updated_at = ?
          WHERE id = ?
        `).bind(
          id,
          label,
          description,
          prompt,
          minAge,
          maxAge,
          isActive,
          sortOrder,
          now,
          originalId
        ).run();

        await env.DB.prepare(`
          UPDATE age_group_targets
          SET age_group_id = ?
          WHERE age_group_id = ?
        `).bind(id, originalId).run();

        await renameAgeGroupInQuestions(env.DB, originalId, id);
      } else {
        const existing = await env.DB.prepare('SELECT id FROM age_groups WHERE id = ?')
          .bind(id)
          .first();
        if (existing) {
          await env.DB.prepare(`
            UPDATE age_groups
            SET label = ?, description = ?, prompt = ?, min_age = ?, max_age = ?, is_active = ?, sort_order = ?, updated_at = ?
            WHERE id = ?
          `).bind(
            label,
            description,
            prompt,
            minAge,
            maxAge,
            isActive,
            sortOrder,
            now,
            id
          ).run();
        } else {
          await env.DB.prepare(`
            INSERT INTO age_groups (
              id, label, description, prompt, min_age, max_age, is_active, sort_order, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            id,
            label,
            description,
            prompt,
            minAge,
            maxAge,
            isActive,
            sortOrder,
            now,
            now
          ).run();
        }
      }

      const targetList = Array.isArray(group.targetAudiences) ? group.targetAudiences : [];
      await env.DB.prepare(`
        DELETE FROM age_group_targets
        WHERE age_group_id = ?
      `).bind(id).run();

      for (const targetId of targetList) {
        const cleanId = String(targetId || '').trim();
        if (!cleanId) continue;
        await env.DB.prepare(`
          INSERT OR IGNORE INTO age_group_targets (
            age_group_id, target_audience_id, created_at
          ) VALUES (?, ?, ?)
        `).bind(id, cleanId, now).run();
      }
    }

    const [updatedAgeGroups, updatedTargetAudiences, updatedMappings] = await Promise.all([
      listAgeGroups(env.DB, { includeInactive: true }),
      listTargetAudiences(env.DB, { includeInactive: true }),
      listAgeGroupTargets(env.DB, { includeInactive: true })
    ]);

    return new Response(JSON.stringify({
      success: true,
      ageGroups: updatedAgeGroups,
      targetAudiences: updatedTargetAudiences,
      mappings: updatedMappings
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (error) {
    console.error('[audiences] POST error:', error);
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
