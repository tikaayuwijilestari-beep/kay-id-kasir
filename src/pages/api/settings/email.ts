import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../lib/db';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnvFromLocals(locals);
  const db = await getDB(env);
  
  try {
    const body = await request.json();
    const { resend_api_key, recipient_emails, weekly_enabled, monthly_enabled } = body;
    
    // Check if settings exist
    const existing = await db.prepare(`SELECT * FROM email_settings WHERE id = 'main'`).first();
    
    if (existing) {
      // Update
      await db.prepare(`
        UPDATE email_settings 
        SET resend_api_key = ?, recipient_emails = ?, weekly_enabled = ?, monthly_enabled = ?, updated_at = datetime('now')
        WHERE id = 'main'
      `).bind(resend_api_key, recipient_emails, weekly_enabled ? 1 : 0, monthly_enabled ? 1 : 0).run();
    } else {
      // Insert
      await db.prepare(`
        INSERT INTO email_settings (id, resend_api_key, recipient_emails, weekly_enabled, monthly_enabled)
        VALUES ('main', ?, ?, ?, ?)
      `).bind(resend_api_key, recipient_emails, weekly_enabled ? 1 : 0, monthly_enabled ? 1 : 0).run();
    }
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const GET: APIRoute = async ({ locals }) => {
  const env = getEnvFromLocals(locals);
  const db = await getDB(env);
  
  const settings = await db.prepare(`SELECT * FROM email_settings WHERE id = 'main'`).first();
  
  return new Response(JSON.stringify(settings || {}), {
    headers: { 'Content-Type': 'application/json' }
  });
};
