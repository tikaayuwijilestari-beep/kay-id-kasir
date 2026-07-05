import type { APIRoute } from 'astro';

// Google SSO - redirects to Google OAuth
// Configure GOOGLE_CLIENT_ID in Cloudflare Pages environment variables
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const env = (request as any).env as any;

  const clientId = env?.GOOGLE_CLIENT_ID || '';

  if (!clientId) {
    // If no client ID configured, show error
    return new Response(null, {
      status: 302,
      headers: { Location: '/login?error=oauth_not_configured' },
    });
  }

  const redirectUri = url.origin + '/api/auth/callback';
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&access_type=offline&prompt=select_account`;

  return new Response(null, {
    status: 302,
    headers: { Location: googleAuthUrl },
  });
};
