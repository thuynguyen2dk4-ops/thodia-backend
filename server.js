const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer'); // Xử lý upload file
const crypto = require('crypto'); // Xử lý chữ ký thanh toán
require('dotenv').config();

const app = express();
app.use(cors()); // Cho phép Frontend gọi API
app.use(express.json()); // Đọc dữ liệu JSON gửi lên

// --- 1. CẤU HÌNH UPLOAD (MULTER) ---
// Lưu file vào RAM để xử lý nhanh (hoặc có thể cấu hình lưu ra ổ cứng)
const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 5 * 1024 * 1024 } // Giới hạn 5MB
});

// --- 2. KẾT NỐI DATABASE (Google Cloud SQL) ---
const pool = new Pool({
  user: 'postgres',           
  host: '34.177.90.63',     
  database: 'postgres',       
  password: 'Thodiauni123@', 
  port: 5432,
  ssl: {
    rejectUnauthorized: false 
  }
});

// Kiểm tra kết nối
pool.connect((err) => {
  if (err) return console.error('❌ Lỗi kết nối Database:', err.stack);
  console.log('✅ Đã kết nối thành công tới Google Cloud SQL!');
});

// ============================================================
// ==================== KHU VỰC API PUBLIC ====================
// ============================================================

// 1. Lấy danh sách Store đã duyệt (Hiển thị bản đồ/Trang chủ)
app.get('/api/stores/approved', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM user_stores WHERE status = 'approved'`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// 2. Tìm kiếm Store
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  try {
    const result = await pool.query(
      `SELECT id, name_vi, address_vi, category, image_url, lat, lng 
       FROM user_stores 
       WHERE status = 'approved' AND name_vi ILIKE $1 
       LIMIT 5`,
      [`%${q}%`]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tìm kiếm' });
  }
});

// 3. Lấy thông tin chi tiết Store (Info, Menu, Gallery, Vouchers)
app.get('/api/stores/:id/public', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM user_stores WHERE id = $1`, [req.params.id]);
    res.json(result.rows[0] || null);
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

app.get('/api/stores/:id/menu', async (req, res) => {
  try {
    // Lấy menu item đang active
    const result = await pool.query(
      `SELECT * FROM store_menu_items WHERE store_id = $1 AND is_available = true ORDER BY sort_order ASC`, 
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

app.get('/api/stores/:id/gallery', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM store_gallery WHERE store_id = $1`, [req.params.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

app.get('/api/store-vouchers/:storeId', async (req, res) => {
  try {
    // Lấy voucher còn hạn
    const result = await pool.query(
      `SELECT * FROM store_vouchers 
       WHERE store_id = $1 AND is_active = true AND end_date >= NOW()`, 
      [req.params.storeId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

// 4. API Lấy tất cả voucher active (cho Banner/Map)
app.get('/api/vouchers/active', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT store_id, title_vi, code FROM store_vouchers WHERE is_active = true AND end_date >= NOW()`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

// 5. Reviews
app.get('/api/reviews/list/:storeId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM location_reviews WHERE store_id = $1 ORDER BY created_at DESC`,
      [req.params.storeId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

app.post('/api/reviews', async (req, res) => {
  const { storeId, userId, rating, comment } = req.body;
  try {
    await pool.query(
      `INSERT INTO location_reviews (store_id, user_id, rating, comment) VALUES ($1, $2, $3, $4)`,
      [storeId, userId, rating, comment]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

// 6. Tuyển dụng (Public Jobs)
app.get('/api/jobs/approved', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM jobs WHERE status = 'approved' ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

app.post('/api/jobs', async (req, res) => {
  const { title, shop_name, address, phone, salary, type, description, user_id } = req.body;
  try {
    await pool.query(
      `INSERT INTO jobs (title, shop_name, address, phone, salary, type, description, user_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
      [title, shop_name, address, phone, salary, type, description, user_id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

// ============================================================
// ==================== KHU VỰC USER USER =====================
// ============================================================

// 1. Quản lý cửa hàng của tôi
app.get('/api/user-stores', async (req, res) => {
  const { userId } = req.query;
  try {
    const result = await pool.query(
      `SELECT * FROM user_stores WHERE user_id = $1 ORDER BY created_at DESC`, 
      [userId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

// CREATE/UPDATE Store (Kèm Upload ảnh)
app.post('/api/stores/save', 
  upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'gallery', maxCount: 10 }]), 
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { id, userId, name_vi, address_vi, phone, description_vi, category, lat, lng, is_premium, image_url } = req.body;
      const files = req.files;
      
      let storeId = id;
      let finalImageUrl = image_url; // Giữ nguyên ảnh cũ nếu không up mới

      // Giả lập upload ảnh (Trong thực tế cần code upload lên S3/Cloudinary ở đây)
      if (files['avatar'] && files['avatar'][0]) {
        finalImageUrl = `https://fake-storage.com/${Date.now()}_${files['avatar'][0].originalname}`;
      }

      if (storeId && storeId !== 'undefined') {
        // UPDATE
        await client.query(
          `UPDATE user_stores SET name_vi=$1, address_vi=$2, phone=$3, description_vi=$4, category=$5, image_url=$6, lat=$7, lng=$8 WHERE id=$9`,
          [name_vi, address_vi, phone, description_vi, category, finalImageUrl, lat, lng, storeId]
        );
      } else {
        // INSERT
        const insertRes = await client.query(
          `INSERT INTO user_stores (user_id, name_vi, address_vi, phone, description_vi, category, image_url, lat, lng, is_premium, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending') RETURNING id`,
          [userId, name_vi, address_vi, phone, description_vi, category, finalImageUrl, lat, lng, is_premium || false]
        );
        storeId = insertRes.rows[0].id;
      }

      // Xử lý Gallery
      if (files['gallery']) {
        for (const file of files['gallery']) {
          const gUrl = `https://fake-storage.com/gallery/${Date.now()}_${file.originalname}`;
          await client.query(`INSERT INTO store_gallery (store_id, image_url) VALUES ($1, $2)`, [storeId, gUrl]);
        }
      }

      await client.query('COMMIT');
      res.json({ success: true, storeId });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      res.status(500).json({ error: 'Lỗi lưu store' });
    } finally {
      client.release();
    }
});

app.delete('/api/stores/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM user_stores WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi xóa' }); }
});

// 2. Quản lý Menu Items
app.post('/api/menu-items', async (req, res) => {
  const { store_id, name_vi, price, image_url, is_available } = req.body;
  try {
    await pool.query(
      `INSERT INTO store_menu_items (store_id, name_vi, price, image_url, is_available) VALUES ($1, $2, $3, $4, $5)`,
      [store_id, name_vi, price, image_url, is_available]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi tạo menu' }); }
});

app.put('/api/menu-items/:id', async (req, res) => {
  const { name_vi, price, image_url, is_available } = req.body;
  try {
    await pool.query(
      `UPDATE store_menu_items SET name_vi=$1, price=$2, image_url=$3, is_available=$4 WHERE id=$5`,
      [name_vi, price, image_url, is_available, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi sửa menu' }); }
});

app.delete('/api/menu-items/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM store_menu_items WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi xóa menu' }); }
});

// 3. Quản lý Vouchers (Chủ quán tạo/sửa)
app.get('/api/stores/:id/vouchers-all', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM store_vouchers WHERE store_id = $1`, [req.params.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

app.post('/api/vouchers', async (req, res) => {
  const { store_id, code, title_vi, discount_value, discount_type, min_order, end_date, is_active } = req.body;
  try {
    await pool.query(
      `INSERT INTO store_vouchers (store_id, code, title_vi, discount_value, discount_type, min_order, end_date, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [store_id, code, title_vi, discount_value, discount_type, min_order, end_date, is_active]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi tạo voucher' }); }
});

app.put('/api/vouchers/:id', async (req, res) => {
  const { code, title_vi, discount_value, is_active } = req.body;
  try {
    await pool.query(
      `UPDATE store_vouchers SET code=$1, title_vi=$2, discount_value=$3, is_active=$4 WHERE id=$5`,
      [code, title_vi, discount_value, is_active, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi sửa voucher' }); }
});

app.delete('/api/vouchers/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM store_vouchers WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi xóa voucher' }); }
});

// 4. Lưu Voucher (Người dùng lưu vào ví)
app.post('/api/vouchers/save', async (req, res) => {
  const { userId, voucherId } = req.body;
  try {
    await pool.query(
      `INSERT INTO user_saved_vouchers (user_id, voucher_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, 
      [userId, voucherId]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi lưu voucher' }); }
});

app.get('/api/user-vouchers', async (req, res) => {
  const { userId } = req.query;
  try {
    const result = await pool.query(
      `SELECT v.* FROM store_vouchers v 
       JOIN user_saved_vouchers s ON v.id = s.voucher_id 
       WHERE s.user_id = $1`, 
      [userId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Lỗi lấy voucher' }); }
});

// 5. Yêu thích (Favorites)
app.get('/api/favorites', async (req, res) => {
  const { userId } = req.query;
  try {
    const result = await pool.query(`SELECT * FROM favorites WHERE user_id = $1`, [userId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

app.post('/api/favorites', async (req, res) => {
  const { userId, locationId, name, lat, lng, type } = req.body;
  try {
    await pool.query(
      `INSERT INTO favorites (user_id, location_id, location_name, location_lat, location_lng, location_type)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [userId, locationId, name, lat, lng, type]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi thêm favorite' }); }
});

app.delete('/api/favorites/:id', async (req, res) => {
  const { userId } = req.body;
  try {
    await pool.query(`DELETE FROM favorites WHERE location_id = $1 AND user_id = $2`, [req.params.id, userId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi xóa favorite' }); }
});

// 6. Gửi yêu cầu xác minh (Claims)
app.post('/api/claims/submit', upload.array('proofFiles', 5), async (req, res) => {
  try {
    const { userId, mapboxId, mapboxName, mapboxAddress, lat, lng, phone, email, role, message } = req.body;
    // Giả lập link ảnh
    const imageUrls = req.files.map((file, i) => `https://fake-proof.com/${userId}_${i}.jpg`);
    
    await pool.query(
      `INSERT INTO store_claims (user_id, mapbox_id, mapbox_name, mapbox_address, lat, lng, phone, email, role, message, proof_images, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')`,
      [userId, mapboxId, mapboxName, mapboxAddress, lat, lng, phone, email, role, message, imageUrls]
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Lỗi gửi claim' }); }
});

// ============================================================
// ===================== KHU VỰC ADMIN ========================
// ============================================================

// 1. Check quyền
app.get('/api/admin/check', async (req, res) => {
  const { userId } = req.query;
  try {
    const result = await pool.query(`SELECT role FROM user_roles WHERE user_id = $1`, [userId]);
    const isAdmin = result.rows.length > 0 && result.rows[0].role === 'admin';
    res.json({ isAdmin });
  } catch (err) { res.status(500).json({ error: 'Lỗi check admin' }); }
});

// 2. Quản lý Store (List, Approve, Reject)
app.get('/api/admin/stores', async (req, res) => {
  const { status } = req.query;
  try {
    let query = `SELECT s.*, p.email as user_email FROM user_stores s LEFT JOIN profiles p ON s.user_id = p.id`;
    const params = [];
    if (status && status !== 'all') {
      query += ` WHERE s.status = $1`;
      params.push(status);
    }
    query += ` ORDER BY s.created_at DESC`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Lỗi lấy stores' }); }
});

app.put('/api/admin/stores/:id/status', async (req, res) => {
  const { status } = req.body;
  try {
    await pool.query(`UPDATE user_stores SET status = $1 WHERE id = $2`, [status, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi update status' }); }
});

// 3. Quản lý Claims (Duyệt chủ sở hữu)
app.get('/api/admin/claims', async (req, res) => {
  try {
    const query = `
      SELECT c.*, p.email as claimant_email, s.id as existing_store_id, s.name_vi as existing_store_name, owner.email as current_owner_email
      FROM store_claims c
      LEFT JOIN profiles p ON c.user_id = p.id
      LEFT JOIN user_stores s ON c.mapbox_id = s.mapbox_id
      LEFT JOIN profiles owner ON s.user_id = owner.id
      WHERE c.status = 'pending' ORDER BY c.created_at DESC
    `;
    const result = await pool.query(query);
    // Map dữ liệu để khớp frontend
    const claims = result.rows.map(row => ({
        ...row,
        profiles: { email: row.claimant_email },
        existingStore: row.existing_store_id ? { id: row.existing_store_id, name_vi: row.existing_store_name, owner_email: row.current_owner_email } : null
    }));
    res.json(claims);
  } catch (err) { res.status(500).json({ error: 'Lỗi lấy claims' }); }
});

app.post('/api/admin/claims/approve', async (req, res) => {
  const { claimId, mapboxId, userId, mapboxName, mapboxAddress, lat, lng, role, phone, proofImageUrl } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Kiểm tra store tồn tại chưa
    const checkStore = await client.query('SELECT id FROM user_stores WHERE mapbox_id = $1', [mapboxId]);
    
    if (checkStore.rows.length > 0) {
      // Update chủ mới
      await client.query(
        `UPDATE user_stores SET user_id = $1, name_vi = $2, is_verified = true, status = 'approved' WHERE id = $3`,
        [userId, mapboxName, checkStore.rows[0].id]
      );
    } else {
      // Tạo mới
      await client.query(
        `INSERT INTO user_stores (user_id, mapbox_id, name_vi, address_vi, lat, lng, category, is_verified, status, description_vi, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, 'checkin', true, 'approved', $7, $8)`,
        [userId, mapboxId, mapboxName, mapboxAddress, lat, lng, `Đã xác minh: ${role}. LH: ${phone}`, proofImageUrl]
      );
    }

    // Update claim status
    await client.query(`UPDATE store_claims SET status = 'approved' WHERE id = $1`, [claimId]);
    // Reject các claim khác cùng mapbox_id
    await client.query(`UPDATE store_claims SET status = 'rejected' WHERE mapbox_id = $1 AND id != $2 AND status = 'pending'`, [mapboxId, claimId]);

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Lỗi giao dịch' });
  } finally { client.release(); }
});

app.post('/api/admin/claims/reject', async (req, res) => {
  try {
    await pool.query(`UPDATE store_claims SET status = 'rejected' WHERE id = $1`, [req.body.claimId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi reject' }); }
});

// 4. Các mục quản lý khác (Ads, Jobs, Users)
app.get('/api/admin/ads', async (req, res) => {
  try {
    const result = await pool.query(`SELECT s.id, s.name_vi, s.image_url, s.ad_expiry, s.is_ad, p.email as user_email FROM user_stores s LEFT JOIN profiles p ON s.user_id = p.id WHERE s.is_ad = true`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Lỗi lấy ads' }); }
});

app.put('/api/admin/ads/cancel/:id', async (req, res) => {
  try {
    await pool.query(`UPDATE user_stores SET is_ad = false, ad_expiry = NULL WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi hủy ads' }); }
});

app.get('/api/admin/jobs', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM jobs ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Lỗi lấy jobs' }); }
});

app.put('/api/admin/jobs/:id/status', async (req, res) => {
  try {
    await pool.query(`UPDATE jobs SET status = $1 WHERE id = $2`, [req.body.status, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi update job' }); }
});

app.delete('/api/admin/jobs/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM jobs WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi xóa job' }); }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, EXISTS(SELECT 1 FROM user_stores s WHERE s.user_id = p.id AND s.is_premium = true) as is_vip
      FROM profiles p ORDER BY p.created_at DESC
    `);
    const users = result.rows.map(u => ({ ...u, isVip: u.is_vip }));
    res.json(users);
  } catch (err) { res.status(500).json({ error: 'Lỗi lấy users' }); }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM profiles WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi xóa user' }); }
});

// ============================================================
// ==================== THANH TOÁN (PAYOS) ====================
// ============================================================

app.post('/api/payment/create-checkout', async (req, res) => {
  try {
    const CLIENT_ID = process.env.PAYOS_CLIENT_ID;
    const API_KEY = process.env.PAYOS_API_KEY;
    const CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;

    if (!CLIENT_ID || !API_KEY || !CHECKSUM_KEY) return res.status(500).json({ error: "Thiếu cấu hình PayOS" });

    const { storeId, type, packageType, returnUrl, cancelUrl } = req.body;
    if (!storeId) return res.status(400).json({ error: "Thiếu Store ID" });

    const orderCode = Number(String(Date.now()).slice(-9)); 
    let amount = 2000;
    let description = "";
    let pendingType = "";

    if (type === "vip") {
      amount = 100000;
      description = `VIP ${orderCode}`;
      pendingType = "vip_lifetime";
    } 
    else if (type === "ad") {
      if (packageType === 'month') {
        amount = 150000;
        description = `QC Thang ${orderCode}`;
        pendingType = "ad_month";
      } else {
        amount = 50000;
        description = `QC Tuan ${orderCode}`;
        pendingType = "ad_week";
      }
    }

    console.log(`[PAYMENT] Order: ${orderCode} | Shop: ${storeId} | Type: ${pendingType}`);

    // Cập nhật DB (Lưu mã đơn hàng để Webhook xử lý)
    await pool.query(
      `UPDATE user_stores SET last_order_code = $1, pending_package_type = $2 WHERE id = $3`,
      [orderCode, pendingType, storeId]
    );

    // Tạo chữ ký PayOS
    const signData = `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
    const hmac = crypto.createHmac("sha256", CHECKSUM_KEY);
    hmac.update(signData);
    const signature = hmac.digest("hex");

    const payload = {
      orderCode, amount, description, 
      buyerName: "User", buyerEmail: "user@example.com",
      cancelUrl, returnUrl, signature,
      items: [{ name: description, quantity: 1, price: amount }]
    };

    const response = await fetch("https://api-merchant.payos.vn/v2/payment-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-client-id": CLIENT_ID, "x-api-key": API_KEY },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok || result.code !== "00") throw new Error(result.desc || "Lỗi PayOS");

    res.json({ checkoutUrl: result.data.checkoutUrl });

  } catch (error) {
    console.error("Payment Error:", error);
    res.status(500).json({ error: error.message || "Lỗi thanh toán" });
  }
});

// --- KHỞI ĐỘNG SERVER ---
const PORT = process.env.PORT || 8081; 
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại port ${PORT}`);
});