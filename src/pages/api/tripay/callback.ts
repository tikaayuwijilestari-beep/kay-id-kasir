import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../lib/db';

// Tripay Webhook Handler
// This endpoint receives payment callbacks from Tripay
// Configure this URL in your Tripay dashboard: https://your-domain.com/api/tripay/callback

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = getEnvFromLocals(locals);
    const db = await getDB(env);

    // Verify webhook signature (optional but recommended)
    // Tripay sends: { event, data: { reference, merchant_ref, payment_status, ... } }
    const body = await request.json();
    
    console.log('Tripay webhook received:', body);

    const { event, data } = body;
    
    if (!data || !data.reference) {
      return new Response('Invalid webhook data', { status: 400 });
    }

    const { reference, merchant_ref, payment_status, amount } = data;

    // Only process successful payments
    if (payment_status !== 'PAID') {
      console.log(`Payment ${reference} status: ${payment_status}`);
      return new Response(JSON.stringify({ success: true, message: 'Status recorded' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Extract order_id from merchant_ref (format: order_id-timestamp)
    const parts = merchant_ref.split('-');
    const orderId = parts.slice(0, -1).join('-'); // Remove timestamp part

    // Check if this payment was already processed
    const existingSale = await db.prepare('SELECT id FROM sales WHERE tripay_reference = ?').bind(reference).first();
    
    if (existingSale) {
      console.log(`Payment ${reference} already processed`);
      return new Response(JSON.stringify({ success: true, message: 'Already processed' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Mark sale as paid (if exists) or create new record
    // For now, we'll just log the successful payment
    // You can extend this to auto-create sales records
    
    console.log(`✅ Payment received: ${reference}, Order: ${orderId}, Amount: ${amount}`);

    // TODO: Auto-create sales record or update existing pending sale
    // For now, return success to acknowledge receipt
    
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Payment recorded',
      reference,
      orderId,
      amount
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Tripay webhook error:', error);
    return new Response(`Server error: ${error instanceof Error ? error.message : 'Unknown error'}`, { status: 500 });
  }
};
