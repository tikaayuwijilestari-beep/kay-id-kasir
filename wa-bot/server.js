/**
 * KAY ID TOKO BANGUNAN - WhatsApp Bot
 * 
 * Free WhatsApp invoice sender using Baileys (WhatsApp Web protocol)
 * 
 * How to use:
 * 1. npm install
 * 2. npm start
 * 3. Scan QR code with your WhatsApp
 * 4. Bot is ready! It will listen on port 3001
 * 
 * API Endpoint:
 * POST http://localhost:3001/send
 * Body: { "phone": "628xxx", "message": "Your message" }
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 3001;
const AUTH_DIR = path.join(__dirname, 'auth_info');

// Ensure auth directory exists
if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

let sock = null;
let connectionStatus = 'disconnected'; // disconnected, connecting, connected, qr_waiting

// Start WhatsApp connection
async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ['KAY ID Toko Bangunan', 'Chrome', '1.0.0'],
  });

  // Handle connection updates
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connectionStatus = 'qr_waiting';
      console.log('\n========================================');
      console.log('  SCAN QR CODE DENGAN WHATSAPP ANDA');
      console.log('========================================');
      console.log('1. Buka WhatsApp di HP');
      console.log('2. Tap menu (⋮) di pojok kanan atas');
      console.log('3. Pilih "Perangkat Tertaut" / "Linked Devices"');
      console.log('4. Tap "Tautkan Perangkat"');
      console.log('5. Scan QR code di bawah ini\n');
      QRCode.generate(qr, { small: true });
      console.log('========================================\n');
    }

    if (connection === 'open') {
      connectionStatus = 'connected';
      console.log('\n✅ WhatsApp terhubung!');
      console.log(`📱 Nomor: ${sock.user?.id?.split(':')[0] || 'Unknown'}`);
      console.log(`🤖 Bot siap menerima perintah`);
      console.log(`🌐 API berjalan di http://localhost:${PORT}\n`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        console.log('🔄 Koneksi terputus, mencoba menghubungkan ulang...');
        connectionStatus = 'connecting';
        startWhatsApp();
      } else {
        console.log('❌ Logout! Hapus folder auth_info dan scan ulang.');
        connectionStatus = 'disconnected';
        // Clean up auth state
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        fs.mkdirSync(AUTH_DIR, { recursive: true });
      }
    }
  });

  // Save credentials whenever they're updated
  sock.ev.on('creds.update', saveCreds);
}

// API: Check connection status
app.get('/status', (req, res) => {
  res.json({
    status: connectionStatus,
    connected: connectionStatus === 'connected',
    user: sock?.user ? {
      id: sock.user.id?.split(':')[0],
      name: sock.user.name,
    } : null,
  });
});

// API: Send message
app.post('/send', async (req, res) => {
  try {
    if (connectionStatus !== 'connected') {
      return res.status(503).json({
        success: false,
        message: 'WhatsApp belum terhubung. Status: ' + connectionStatus,
      });
    }

    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: phone, message',
      });
    }

    // Format phone number
    let formattedPhone = phone.replace(/^0/, '62').replace(/[^0-9]/g, '');
    if (!formattedPhone.startsWith('62')) {
      formattedPhone = '62' + formattedPhone;
    }
    const jid = formattedPhone + '@s.whatsapp.net';

    // Send message
    await sock.sendMessage(jid, { text: message });

    console.log(`✅ Pesan terkirim ke ${formattedPhone}`);
    res.json({
      success: true,
      message: `Pesan terkirim ke ${formattedPhone}`,
    });

  } catch (error) {
    console.error('❌ Error sending message:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send message',
    });
  }
});

// API: Disconnect
app.post('/disconnect', async (req, res) => {
  try {
    if (sock) {
      await sock.logout();
    }
    connectionStatus = 'disconnected';
    res.json({ success: true, message: 'Disconnected' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({
    app: 'KAY ID WhatsApp Bot',
    version: '1.0.0',
    status: connectionStatus,
    endpoints: {
      'GET /status': 'Check connection status',
      'POST /send': 'Send WhatsApp message',
      'POST /disconnect': 'Disconnect WhatsApp',
    },
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`\n🚀 KAY ID WhatsApp Bot`);
  console.log(`📡 API Server: http://localhost:${PORT}`);
  console.log(`📱 Status: ${connectionStatus}\n`);
  
  // Start WhatsApp connection
  startWhatsApp();
});
