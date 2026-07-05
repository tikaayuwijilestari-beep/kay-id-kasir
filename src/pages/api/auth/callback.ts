import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../lib/db';
import { ALLOWED_EMAILS, OWNER_EMAIL, createSession, cleanupSessions } from '../../../lib/auth';

// Google OAuth callback - only allows tikaayuwijilestari@gmail.com
export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/login?error=access_denied' },
    });
  }

  if (!code) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/login?error=no_code' },
    });
  }

  // Use env vars for OAuth credentials (set in Cloudflare Pages environment variables)
  const env = getEnvFromLocals(locals);
  const clientId = env?.GOOGLE_CLIENT_ID || '';
  const clientSecret = env?.GOOGLE_CLIENT_SECRET || '';

  if (!clientId || !clientSecret) {
    // Fallback: create session directly for the owner (for development)
    // In production, remove this and use proper OAuth
    return new Response(null, {
      status: 302,
      headers: { Location: '/login?error=oauth_not_configured' },
    });
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: url.origin + '/api/auth/callback',
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/login?error=token_failed' },
    });
  }

  const tokenData = await tokenRes.json() as any;
  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const userInfo = await userInfoRes.json() as any;

  // SECURITY: Only allow specific email addresses
  if (!ALLOWED_EMAILS.includes(userInfo.email)) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/login?error=not_authorized' },
    });
  }

  const db = await getDB(env);

  // Cleanup expired sessions
  await cleanupSessions(db);

  const isOwner = userInfo.email === OWNER_EMAIL;

  // Upsert user
  await db
    .prepare(
      `INSERT INTO users (id, email, name, role, avatar_url, last_login)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(email) DO UPDATE SET last_login = datetime('now'), name = excluded.name, avatar_url = excluded.avatar_url`
    )
    .bind(crypto.randomUUID(), userInfo.email, userInfo.name, isOwner ? 'admin' : 'kasir', userInfo.picture)
    .run();

  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(userInfo.email).first() as any;

  const { cookie } = await createSession(db, user.id);

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/dashboard',
      'Set-Cookie': cookie,
    },
  });
};
