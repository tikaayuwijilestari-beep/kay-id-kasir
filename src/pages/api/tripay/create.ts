import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../lib/db';
import { requireAuth } from '../../../lib/auth';

// Tripay API configuration
// Set these environment variables:
// - TRIPAY_API_KEY: Your Tripay API key
// - TRIPAY_MERCHANT_CODE: Your Tripay merchant code
// - TRIPAY_MODE: 'sandbox' or 'production' (default: sandbox)

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = getEnvFromLocals(locals);
    const user = await requireAuth(env, request);
    if (user instanceof Response) return user;

    const body = await request.json();
    const { amount, order_id, customer_name, phone, email } = body;

    if (!amount || !order_id) {
      return new Response('Missing required fields: amount, order_id', { status: 400 });
    }

    const apiKey = env.TRIPAY_API_KEY;
    const merchantCode = env.TRIPAY_MERCHANT_CODE;
    const mode = env.TRIPAY_MODE || 'sandbox';

    if (!apiKey || !merchantCode) {
      return new Response('Tripay not configured. Set TRIPAY_API_KEY and TRIPAY_MERCHANT_CODE.', { status: 500 });
    }

    // Generate unique reference
    const timestamp = Math.floor(Date.now() / 1000);
    const merchantRef = `${order_id}-${timestamp}`;

    // Create Tripay payment
    const baseUrl = mode === 'production' 
      ? 'https://tripay.co.id/api' 
      : 'https://tripay.co.id/api-sandbox';

    const payload = {
      method: 'QRIS',
      merchant_ref: merchantRef,
      amount: amount,
      customer_name: customer_name || 'Customer',
      customer_email: email || '',
      customer_phone: phone || '',
      order_items: [
        {
          name: `Order ${order_id}`,
          price: amount,
          quantity: 1
        }
      ],
      return_url: `${new URL(request.url).origin}/pos`,
      expired_time: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };

    const response = await fetch(`${baseUrl}/transaction/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Tripay API error:', error);
      return new Response(`Tripay API error: ${error}`, { status: 500 });
    }

    const result = await response.json();

    if (!result.success) {
      console.error('Tripay error:', result);
      return new Response(`Tripay error: ${result.message || 'Unknown error'}`, { status: 500 });
    }

    // Return QRIS data
    return new Response(JSON.stringify({
      success: true,
      reference: result.data.reference,
      qr_string: result.data.qr_string,
      qr_url: result.data.qr_url,
      checkout_url: result.data.checkout_url,
      amount: result.data.amount,
      expired_time: result.data.expired_time,
      merchant_ref: merchantRef
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Tripay create error:', error);
    return new Response(`Server error: ${error instanceof Error ? error.message : 'Unknown error'}`, { status: 500 });
  }
};
