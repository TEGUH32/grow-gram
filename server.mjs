// =====================================================
// WHATSAPP BLAST SERVER - BAILEYS MJS EDITION
// =====================================================
// BY: DARK PHOENIX INDONESIA
// VERSION: 1.0 (WORKING BANGET KONTOL!)
// =====================================================

import express from 'express';
import { makeWASocket, delay, DisconnectReason, useMultiFileAuthState } from '@itsliaaa/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// =====================================================
// KONFIGURASI
// =====================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const SESSION_DIR = path.join(__dirname, 'session');
const DATA_DIR = path.join(__dirname, 'data');

// Buat folder kalo belum ada
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// File buat nyimpen log blast
const BLAST_LOG = path.join(DATA_DIR, 'blast_log.json');

// =====================================================
// GLOBAL VARIABLES
// =====================================================
let sock = null;
let connectionStatus = 'disconnected';
let qrCode = null;
let pairingCode = null;

// Load blast log
let blastHistory = [];
if (fs.existsSync(BLAST_LOG)) {
    blastHistory = JSON.parse(fs.readFileSync(BLAST_LOG, 'utf8'));
}

// =====================================================
// EXPRESS APP
// =====================================================
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// =====================================================
// SAVE BLAST LOG
// =====================================================
function saveBlastLog() {
    fs.writeFileSync(BLAST_LOG, JSON.stringify(blastHistory, null, 2));
}

// =====================================================
// FORMAT NOMOR JADI JID
// =====================================================
function formatJid(number) {
    // Bersihin nomor: hapus +, spasi, strip, dll
    let clean = number.toString().replace(/[^0-9]/g, '');
    
    // Kalo diawali 0, ganti jadi 62
    if (clean.startsWith('0')) {
        clean = '62' + clean.substring(1);
    }
    
    // Kalo gak diawali 62, tambahin 62
    if (!clean.startsWith('62')) {
        clean = '62' + clean;
    }
    
    // Kalo belum ada @s.whatsapp.net, tambahin
    if (!clean.includes('@')) {
        clean = clean + '@s.whatsapp.net';
    }
    
    return clean;
}

// =====================================================
// CEK NOMOR VALID (TERDAFTAR DI WA)
// =====================================================
async function checkNumber(jid) {
    if (!sock) return { status: false, message: 'Not connected' };
    
    try {
        const result = await sock.onWhatsApp(jid);
        if (result && result.length > 0 && result[0].exists) {
            return { status: true, jid: result[0].jid, message: 'Valid' };
        }
        return { status: false, message: 'Number not registered on WhatsApp' };
    } catch (error) {
        return { status: false, message: error.message };
    }
}

// =====================================================
// KIRIM PESAN BLAST
// =====================================================
async function sendBlastMessage(jid, message) {
    if (!sock) return { success: false, error: 'Not connected' };
    
    try {
        const result = await sock.sendMessage(jid, { text: message });
        return { success: true, result: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// =====================================================
// CONNECT KE WHATSAPP (PAIRING CODE)
// =====================================================
async function connectToWhatsApp() {
    console.log('🔄 Connecting to WhatsApp...');
    connectionStatus = 'connecting';
    
    const logger = pino({ level: 'silent' });
    
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    
    sock = makeWASocket({
        logger,
        auth: state,
        printQRInTerminal: false, // QR di terminal dimatiin, pake pairing code aja
        browser: ['Chrome (Linux)', '', '']
    });
    
    // Handler untuk QR code (fallback kalo pairing code gagal)
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrCode = qr;
            console.log('📱 Scan QR Code with WhatsApp (fallback mode)');
        }
        
        if (connection === 'connecting') {
            console.log('⏳ Connecting...');
            connectionStatus = 'connecting';
        }
        
        if (connection === 'open') {
            console.log('✅ Connected to WhatsApp!');
            connectionStatus = 'connected';
            qrCode = null;
            pairingCode = null;
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Connection closed:', lastDisconnect?.error);
            connectionStatus = 'disconnected';
            
            if (shouldReconnect) {
                console.log('🔄 Reconnecting in 5 seconds...');
                setTimeout(() => connectToWhatsApp(), 5000);
            } else {
                console.log('🔒 Logged out, please delete session folder and restart');
            }
        }
    });
    
    // Handler untuk update credentials
    sock.ev.on('creds.update', saveCreds);
    
    // Handler untuk pesan masuk (opsional)
    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            if (!msg.key.fromMe && msg.message?.conversation) {
                console.log(`📩 Incoming message from ${msg.key.remoteJid}: ${msg.message.conversation}`);
            }
        }
    });
    
    return sock;
}

// =====================================================
// REQUEST PAIRING CODE
// =====================================================
async function requestPairingCode(phoneNumber) {
    if (!sock) {
        throw new Error('Socket not initialized');
    }
    
    // Bersihin nomor
    let cleanNumber = phoneNumber.toString().replace(/[^0-9]/g, '');
    if (cleanNumber.startsWith('0')) {
        cleanNumber = '62' + cleanNumber.substring(1);
    }
    if (!cleanNumber.startsWith('62')) {
        cleanNumber = '62' + cleanNumber;
    }
    
    console.log(`📱 Requesting pairing code for: ${cleanNumber}`);
    
    try {
        const code = await sock.requestPairingCode(cleanNumber);
        pairingCode = code;
        console.log(`🔗 Pairing code: ${code}`);
        return code;
    } catch (error) {
        console.error('Failed to get pairing code:', error);
        throw error;
    }
}

// =====================================================
// API ENDPOINTS
// =====================================================

// Status koneksi
app.get('/api/status', (req, res) => {
    res.json({
        status: connectionStatus,
        isConnected: connectionStatus === 'connected',
        hasSession: fs.existsSync(path.join(SESSION_DIR, 'creds.json'))
    });
});

// Request pairing code
app.post('/api/pair', async (req, res) => {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number required, KONTOL!' });
    }
    
    try {
        // Pastikan socket ada
        if (!sock || connectionStatus !== 'connected') {
            await connectToWhatsApp();
            await delay(2000);
        }
        
        const code = await requestPairingCode(phoneNumber);
        res.json({ success: true, pairingCode: code });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Connect (manual)
app.post('/api/connect', async (req, res) => {
    try {
        await connectToWhatsApp();
        res.json({ success: true, message: 'Connecting...' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Disconnect
app.post('/api/disconnect', (req, res) => {
    if (sock) {
        sock.end(new Error('Manual disconnect'));
        sock = null;
        connectionStatus = 'disconnected';
    }
    res.json({ success: true, message: 'Disconnected' });
});

// Cek nomor
app.post('/api/check', async (req, res) => {
    const { numbers } = req.body;
    
    if (!numbers || !Array.isArray(numbers)) {
        return res.status(400).json({ error: 'Numbers array required' });
    }
    
    if (connectionStatus !== 'connected') {
        return res.status(400).json({ error: 'Not connected to WhatsApp, KONTOL!' });
    }
    
    const results = [];
    for (const num of numbers) {
        const formatted = formatJid(num);
        const check = await checkNumber(formatted);
        results.push({
            original: num,
            formatted: formatted,
            ...check
        });
    }
    
    res.json({ success: true, results });
});

// Blast pesan
app.post('/api/blast', async (req, res) => {
    const { numbers, message } = req.body;
    
    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
        return res.status(400).json({ error: 'Numbers array required, KONTOL!' });
    }
    
    if (!message || message.trim() === '') {
        return res.status(400).json({ error: 'Message required, BABI!' });
    }
    
    if (connectionStatus !== 'connected') {
        return res.status(400).json({ error: 'Not connected to WhatsApp' });
    }
    
    const blastId = Date.now().toString();
    const results = [];
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < numbers.length; i++) {
        const num = numbers[i];
        const formatted = formatJid(num);
        
        // Cek nomor dulu
        const check = await checkNumber(formatted);
        
        if (!check.status) {
            results.push({
                number: num,
                formatted: formatted,
                success: false,
                error: check.message
            });
            failCount++;
            continue;
        }
        
        // Kirim pesan
        const sendResult = await sendBlastMessage(check.jid, message);
        
        if (sendResult.success) {
            results.push({
                number: num,
                formatted: formatted,
                success: true,
                messageId: sendResult.result?.key?.id
            });
            successCount++;
        } else {
            results.push({
                number: num,
                formatted: formatted,
                success: false,
                error: sendResult.error
            });
            failCount++;
        }
        
        // Delay biar gak kena spam (500ms per pesan)
        await delay(500);
    }
    
    // Simpan ke history
    const blastRecord = {
        id: blastId,
        timestamp: new Date().toISOString(),
        totalNumbers: numbers.length,
        successCount: successCount,
        failCount: failCount,
        message: message,
        numbers: numbers,
        results: results
    };
    
    blastHistory.unshift(blastRecord);
    // Keep only last 100 records
    if (blastHistory.length > 100) blastHistory.pop();
    saveBlastLog();
    
    res.json({
        success: true,
        blastId: blastId,
        summary: {
            total: numbers.length,
            success: successCount,
            failed: failCount
        },
        results: results
    });
});

// Get blast history
app.get('/api/history', (req, res) => {
    res.json({ success: true, history: blastHistory });
});

// Get blast detail
app.get('/api/blast/:id', (req, res) => {
    const blast = blastHistory.find(b => b.id === req.params.id);
    if (!blast) {
        return res.status(404).json({ error: 'Blast not found' });
    }
    res.json({ success: true, blast });
});

// Delete session (logout)
app.post('/api/logout', (req, res) => {
    try {
        if (sock) {
            sock.end(new Error('Logout'));
            sock = null;
        }
        
        // Hapus folder session
        if (fs.existsSync(SESSION_DIR)) {
            fs.rmSync(SESSION_DIR, { recursive: true, force: true });
            fs.mkdirSync(SESSION_DIR);
        }
        
        connectionStatus = 'disconnected';
        res.json({ success: true, message: 'Logged out, session deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// SERVE HTML
// =====================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// =====================================================
// AUTO CONNECT ON START
// =====================================================
connectToWhatsApp();

// =====================================================
// START SERVER
// =====================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║     🔥 WHATSAPP BLAST SERVER - BAILEYS MJS EDITION 🔥    ║
╠══════════════════════════════════════════════════════════╣
║  🌐 URL: http://localhost:${PORT}                          
║  📡 Port: ${PORT}                                         
║  📁 Session: ${SESSION_DIR}                               
║  📊 Status: ${connectionStatus}                           
╠══════════════════════════════════════════════════════════╣
║  ⚠️  USE WITH PAIRING CODE, KONTOL!                     ║
║  ⚠️  JANGAN LUPA ISI NOMOR HP LO SENDIRI                ║
╚══════════════════════════════════════════════════════════╝
    `);
});
