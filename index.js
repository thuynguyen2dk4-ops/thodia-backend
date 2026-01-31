const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const https = require('https'); // Dùng cái này thay fetch cho an toàn
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Cấu hình Multer (Upload file)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Cấu hình Database
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || '34.177.90.63',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD || 'Thodiauni123@',
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

// Kiểm tra DB (Không làm sập app nếu lỗi)
pool.connect(err => {
  if (err) console.error("❌ Cảnh báo kết nối DB:", err.message);
  else console.log("✅ Kết nối DB thành công");
});

/* ============================================================
   CÁC API QUAN TRỌNG
===============================================================*/

// Test Server
app.get('/', (req, res) => {
  res.send('Backend ThodiaUni is running OK!');
});

// 1. API Gửi yêu cầu xác minh (Cái bạn đang cần nhất)
app.post('/api/claims/submit', async (req, res) => {
  try {
    const { storeId, userId, role, phone, email, message, proofImage } = req.body;
    
    // Log để debug
    console.log("Nhận yêu cầu claim:", { storeId, email });

    await pool.query(
      `INSERT INTO store_claims 
      (store_id, user_id, role, contact_phone, contact_email, message, verification_proof, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())`, 
      [storeId, userId, role, phone, email, message, proofImage]
    );

    res.json({ success: true, message: "Đã gửi yêu cầu thành công!" });
  } catch (err) {
    console.error("Lỗi gửi claim:", err);
    res.status(500).json({ error: "Lỗi server khi lưu yêu cầu" });
  }
});

// 2. Các API Review & Store cơ bản
app.get('/api/reviews/:storeId', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM location_reviews WHERE store_id = $1 ORDER BY created_at DESC', [req.params.storeId]);
    res.json(result.rows || []); 
  } catch (err) { res.status(500).json([]); }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const { storeId, userId, rating, comment } = req.body;
    await pool.query('INSERT INTO location_reviews (store_id, user_id, rating, comment) VALUES ($1, $2, $3, $4)', [storeId, userId, rating, comment]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi' }); }
});

app.get('/api/stores/approved', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM user_stores WHERE status = 'approved' AND is_active = true ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (err) { res.status(500).json([]); }
});

app.get('/api/stores/:id/public', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM user_stores WHERE id = $1`, [req.params.id]);
    res.json(result.rows[0] || null);
  } catch (err) { res.status(500).json({ error: 'Lỗi' }); }
});

/* ============================================================
   PAYOS PAYMENT (Dùng https native - Bao hoạt động)
===============================================================*/
app.post('/api/payment/create-checkout', async (req, res) => {
  try {
    const { storeId, type, cancelUrl, returnUrl } = req.body;
    const amount = 2000; 
    const orderCode = Number(String(Date.now()).slice(-9));
    const description = `PAY-${orderCode}`;

    // Lưu DB
    await pool.query(`UPDATE user_stores SET last_order_code=$1 WHERE id=$2`, [orderCode, storeId]);

    // Tạo chữ ký
    const raw = `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
    const hmac = crypto.createHmac("sha256", process.env.PAYOS_CHECKSUM_KEY || 'KEY_TEST');
    hmac.update(raw);
    const signature = hmac.digest("hex");

    // Gửi request bằng module https chuẩn của Node.js
    const payload = JSON.stringify({
      orderCode, amount, description, cancelUrl, returnUrl, signature,
      items: [{ name: description, quantity: 1, price: amount }]
    });

    const options = {
      hostname: 'api-merchant.payos.vn',
      path: '/v2/payment-requests',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': process.env.PAYOS_CLIENT_ID,
        'x-api-key': process.env.PAYOS_API_KEY,
        'Content-Length': payload.length
      }
    };

    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', (chunk) => data += chunk);
      response.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.code === "00") res.json({ checkoutUrl: result.data.checkoutUrl });
          else res.status(400).json({ error: result.desc || "Lỗi PayOS" });
        } catch (e) { res.status(500).json({ error: "Lỗi xử lý PayOS" }); }
      });
    });

    request.on('error', (e) => res.status(500).json({ error: e.message }));
    request.write(payload);
    request.end();

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   START SERVER (Quan trọng: Phải bind 0.0.0.0)
===============================================================*/
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server đang chạy tại port ${PORT}`);
});