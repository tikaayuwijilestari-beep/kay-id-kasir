import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../lib/db';

// WhatsApp Invoice Sender
// Supports multiple gateways: Fonnte, Wablas, or WhatsApp Cloud API
// Set environment variables:
// - WA_GATEWAY: 'fonnte' | 'wablas' | 'cloudapi' (default: fonnte)
// - FONNTE_TOKEN: Your Fonnte token (if using Fonnte)
// - WABLAS_TOKEN: Your Wablas token (if using Wablas)
// - WA_CLOUD_TOKEN: WhatsApp Cloud API token
// - WA_CLOUD_PHONE_ID: WhatsApp Cloud API phone number ID

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = getEnvFromLocals(locals);
    const body = await request.json();
    const { phone, invoiceNo, total, customerName, items } = body;

    if (!phone || !invoiceNo) {
      return new Response('Missing required fields: phone, invoiceNo', { status: 400 });
    }

    // Format phone number (remove leading 0, add country code)
    let formattedPhone = phone.replace(/^0/, '62').replace(/[^0-9]/g, '');
    if (!formattedPhone.startsWith('62')) {
      formattedPhone = '62' + formattedPhone;
    }

    // Build invoice message
    const formatCurrency = (n: number) => 
      new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

    let message = `*KAY ID TOKO BANGUNAN*\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `📋 *NOTA PENJUALAN*\n`;
    message += `No. Invoice: ${invoiceNo}\n`;
    message += `Tanggal: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}\n`;
    if (customerName) message += `Pelanggan: ${customerName}\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `*Detail Barang:*\n`;

    if (items && items.length > 0) {
      items.forEach((item: any, index: number) => {
        message += `${index + 1}. ${item.name}\n`;
        message += `   ${item.qty} ${item.satuan || 'x'} @ ${formatCurrency(item.price)} = ${formatCurrency(item.price * item.qty)}\n`;
      });
    }

    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `💰 *TOTAL: ${formatCurrency(total)}*\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `\nTerima kasih atas pembelian Anda! 🙏`;

    // Send via configured gateway
    const gateway = (env as any).WA_GATEWAY || 'fonnte';
    let result: any = { success: false, message: 'Unknown gateway' };

    if (gateway === 'fonnte') {
      result = await sendViaFonnte(env, formattedPhone, message);
    } else if (gateway === 'wablas') {
      result = await sendViaWablas(env, formattedPhone, message);
    } else if (gateway === 'cloudapi') {
      result = await sendViaCloudAPI(env, formattedPhone, message);
    } else {
      // Fallback: just log the message
      console.log('WhatsApp message (no gateway configured):', message);
      result = { success: false, message: 'No WhatsApp gateway configured. Set WA_GATEWAY environment variable.' };
    }

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: result.success ? 200 : 500,
    });

  } catch (error) {
    console.error('WhatsApp send error:', error);
    return new Response(`Server error: ${error instanceof Error ? error.message : 'Unknown error'}`, { status: 500 });
  }
};

// Fonnte WhatsApp Gateway (https://fonnte.com)
async function sendViaFonnte(env: any, phone: string, message: string) {
  const token = (env as any).FONNTE_TOKEN;
  if (!token) {
    return { success: false, message: 'FONNTE_TOKEN not set' };
  }

  const response = await fetch('https://api.fonnte.com/send', {
    method: 'POST',
    headers: {
      'Authorization': token,
    },
    body: JSON.stringify({
      target: phone,
      message: message,
    }),
  });

  const result = await response.json();
  return {
    success: result.status || false,
    message: result.reason || result.status ? 'Message sent' : 'Failed to send',
    data: result,
  };
}

// Wablas WhatsApp Gateway (https://wablas.com)
async function sendViaWablas(env: any, phone: string, message: string) {
  const token = (env as any).WABLAS_TOKEN;
  if (!token) {
    return { success: false, message: 'WABLAS_TOKEN not set' };
  }

  const response = await fetch('https://solo.wablas.com/api/send-message', {
    method: 'POST',
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token: token,
      phone: phone,
      message: message,
    }),
  });

  const result = await response.json();
  return {
    success: result.success || false,
    message: result.success ? 'Message sent' : 'Failed to send',
    data: result,
  };
}

// WhatsApp Cloud API (Meta)
async function sendViaCloudAPI(env: any, phone: string, message: string) {
  const token = (env as any).WA_CLOUD_TOKEN;
  const phoneId = (env as any).WA_CLOUD_PHONE_ID;
  
  if (!token || !phoneId) {
    return { success: false, message: 'WA_CLOUD_TOKEN or WA_CLOUD_PHONE_ID not set' };
  }

  const response = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: message },
    }),
  });

  const result = await response.json();
  return {
    success: !result.error,
    message: result.error ? result.error.message : 'Message sent',
    data: result,
  };
}
