import type { APIRoute } from 'astro';

// Google SSO - redirects to Google OAuth
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const clientId = url.searchParams.get('client_id') || '';

  // For Cloudflare Pages, use Google Identity Services
  // In production, configure GOOGLE_CLIENT_ID in environment variables
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(url.origin + '/api/auth/callback')}&response_type=code&scope=openid%20email%20profile`;

  return new Response(null, {
    status: 302,
    headers: { Location: googleAuthUrl },
  });
};
