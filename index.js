const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
require('dotenv').config();
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(), // 👈 Dùng cái này thay vì cert()
  storageBucket: "winged-ray-485505-m3.firebasestorage.app" 
});

const bucket = admin.storage().bucket();
const app = express();
app.use(cors());
app.use(express.json());

// Multer upload memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || '34.177.90.63',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD || 'Thodiauni123@',
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

pool.connect(err => {
  if (err) console.error("❌ Lỗi kết nối PostgreSQL:", err);
  else console.log("✅ Kết nối thành công PostgreSQL");
});

/* ============================================================
   PUBLIC APIs
===============================================================*/

// 1. Get approved stores
app.get('/api/stores/approved', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM user_stores 
      WHERE status = 'approved' AND is_active = true
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// 2. Search store
app.get('/api/search', async (req, res) => {
  try {
    const q = `%${req.query.q || ''}%`;
    const result = await pool.query(`
      SELECT id, name_vi, address_vi, category, image_url, lat, lng
      FROM user_stores
      WHERE status = 'approved'
      AND name_vi ILIKE $1
      LIMIT 5
    `, [q]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tìm kiếm' });
  }
});

// 3. Store public detail
app.get('/api/stores/:id/public', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM user_stores WHERE id = $1`,
      [req.params.id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 4. Menu items
app.get('/api/stores/:id/menu', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM store_menu_items
      WHERE store_id = $1
      ORDER BY created_at ASC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

// 5. Gallery
app.get('/api/stores/:id/gallery', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM store_gallery WHERE store_id = $1
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

// 6. User Saved Vouchers (Sửa lại cho đúng logic)
app.get('/api/user_saved_vouchers/:storeId', async (req, res) => {
  try {
    // API này frontend gọi để lấy voucher CỦA CỬA HÀNG
    const result = await pool.query(`
      SELECT * FROM store_vouchers
      WHERE store_id = $1 AND is_active = true
    `, [req.params.storeId]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Lỗi lấy voucher" });
  }
});

// Active vouchers (public)
app.get('/api/vouchers/active', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM store_vouchers
      WHERE is_active = true
      ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

// 1. Lấy danh sách đánh giá
app.get('/api/reviews/:storeId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM location_reviews WHERE store_id = $1 ORDER BY created_at DESC',
      [req.params.storeId]
    );
    res.json(result.rows || []); 
  } catch (err) {
    console.error(err);
    res.status(500).json([]); 
  }
});

// 2. Thêm đánh giá mới
app.post('/api/reviews', async (req, res) => {
  try {
    const { storeId, userId, rating, comment } = req.body;
    await pool.query(
      'INSERT INTO location_reviews (store_id, user_id, rating, comment) VALUES ($1, $2, $3, $4)',
      [storeId, userId, rating, comment]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 3. Lấy điểm trung bình
app.get('/api/reviews/average/:storeId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT AVG(rating) AS avg FROM location_reviews WHERE store_id = $1',
      [req.params.storeId]
    );
    res.json({ average: result.rows[0].avg || 0 });
  } catch (err) {
    res.status(500).json({ average: 0 });
  }
});

/* ============================================================
   USER ZONE (My Stores, Menu, Gallery, Vouchers, Favorites)
===============================================================*/

// 1. Lấy danh sách cửa hàng của user
app.get('/api/user-stores', async (req, res) => {
  try {
    const { userId } = req.query;

    const result = await pool.query(`
      SELECT * FROM user_stores
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

// Save Store (Create / Update)
// Save Store (Create / Update)
app.post('/api/stores/save',
  upload.fields([{ name: "avatar", maxCount: 1 }, { name: "gallery", maxCount: 10 }]),
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const {
        id, userId, name_vi, address_vi, phone,
        description_vi, category, lat, lng, is_premium, image_url
      } = req.body;

      const files = req.files;
      let finalImage = image_url; // Mặc định dùng ảnh cũ (nếu là sửa)

      // --- HÀM UPLOAD (Giữ nguyên của bạn) ---
      const uploadToFirebase = (file) => {
        return new Promise((resolve, reject) => {
          if (!file) return resolve(null);
          const fileName = `stores/${Date.now()}_${file.originalname}`;
          const fileUpload = bucket.file(fileName);
          const blobStream = fileUpload.createWriteStream({
            metadata: { contentType: file.mimetype }
          });
          blobStream.on('error', (error) => reject(error));
          blobStream.on('finish', async () => {
            await fileUpload.makePublic(); 
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
            resolve(publicUrl);
          });
          blobStream.end(file.buffer);
        });
      };

      // 1. XỬ LÝ AVATAR (Bạn bị thiếu đoạn này)
      if (files && files.avatar && files.avatar[0]) {
        console.log("Đang upload Avatar...");
        const newAvatarUrl = await uploadToFirebase(files.avatar[0]);
        if (newAvatarUrl) finalImage = newAvatarUrl;
      }

      let storeId = id;

      // 2. LƯU THÔNG TIN CỬA HÀNG VÀO DB (Bạn bị thiếu đoạn này)
      if (storeId) {
        // --- Cập nhật (UPDATE) ---
        await client.query(`
          UPDATE user_stores 
          SET name_vi=$1, address_vi=$2, phone=$3, description_vi=$4, 
              category=$5, lat=$6, lng=$7, image_url=$8, updated_at=NOW()
          WHERE id=$9
        `, [name_vi, address_vi, phone, description_vi, category, lat, lng, finalImage, storeId]);
      } else {
        // --- Tạo mới (INSERT) ---
        const insertRes = await client.query(`
          INSERT INTO user_stores 
          (user_id, name_vi, address_vi, phone, description_vi, category, lat, lng, image_url, status, is_active, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', true, NOW())
          RETURNING id
        `, [userId, name_vi, address_vi, phone, description_vi, category, lat, lng, finalImage]);
        storeId = insertRes.rows[0].id;
      }

      // 3. XỬ LÝ GALLERY (Đoạn này bạn làm đúng rồi, nhưng cần storeId từ bước 2)
      if (files && files.gallery) {
        for (const file of files.gallery) {
          const url = await uploadToFirebase(file);
          if (url) {
            await client.query(`
              INSERT INTO store_gallery (store_id, image_url) VALUES ($1, $2)
            `, [storeId, url]);
          }
        }
      }

      await client.query("COMMIT");
      res.json({ success: true, storeId });

    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Lỗi Save Store:", err); // In lỗi ra để dễ debug
      res.status(500).json({ error: "Lỗi lưu cửa hàng" });
    } finally {
      client.release();
    }
});

app.post('/api/menu-items', async (req, res) => {
  try {
    const { store_id, name_vi, price, image_url, is_available } = req.body;
    await pool.query(`
      INSERT INTO store_menu_items (store_id, name_vi, price, image_url, is_available)
      VALUES ($1,$2,$3,$4,$5)
    `, [store_id, name_vi, price, image_url, is_available]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi tạo menu item" });
  }
});

app.put('/api/menu-items/:id', async (req, res) => {
  try {
    const { name_vi, price, image_url, is_available } = req.body;
    await pool.query(`
      UPDATE store_menu_items SET name_vi=$1, price=$2, image_url=$3, is_available=$4 WHERE id=$5
    `, [name_vi, price, image_url, is_available, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi cập nhật menu item" });
  }
});

app.delete('/api/menu-items/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM store_menu_items WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi xóa menu item" });
  }
});

/* ============================================================
   VOUCHER CRUD (STORE OWNER)
===============================================================*/

app.get('/api/stores/:id/vouchers-all', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM store_vouchers WHERE store_id = $1 ORDER BY created_at DESC`, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

app.post('/api/vouchers', async (req, res) => {
  try {
    const { store_id, code, title_vi, discount_value, discount_type, min_order, end_date, is_active } = req.body;
    await pool.query(`
      INSERT INTO store_vouchers (store_id, code, title_vi, discount_value, discount_type, min_order, end_date, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [store_id, code, title_vi, discount_value, discount_type, min_order, end_date, is_active]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi tạo voucher" });
  }
});

app.put('/api/vouchers/:id', async (req, res) => {
  try {
    const { code, title_vi, discount_value, is_active } = req.body;
    await pool.query(`
      UPDATE store_vouchers SET code=$1, title_vi=$2, discount_value=$3, is_active=$4 WHERE id=$5
    `, [code, title_vi, discount_value, is_active, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi cập nhật voucher" });
  }
});

app.delete('/api/vouchers/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM store_vouchers WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi xóa voucher" });
  }
});

/* ============================================================
   USER SAVED VOUCHERS (Ví Voucher)
===============================================================*/

app.post('/api/vouchers/save', async (req, res) => {
  try {
    const { userId, voucherId } = req.body;
    await pool.query(`
      INSERT INTO user_saved_vouchers (user_id, voucher_id) VALUES ($1,$2) ON CONFLICT DO NOTHING
    `, [userId, voucherId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi lưu voucher vào ví" });
  }
});

app.get('/api/user-vouchers', async (req, res) => {
  try {
    const { userId } = req.query;
    const result = await pool.query(`
      SELECT v.* FROM user_saved_vouchers s JOIN store_vouchers v ON v.id = s.voucher_id WHERE s.user_id = $1
    `, [userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Lỗi lấy ví voucher" });
  }
});

/* ============================================================
   FAVORITES
===============================================================*/

app.get('/api/favorites', async (req, res) => {
  try {
    const { userId } = req.query;
    const result = await pool.query(`SELECT * FROM favorites WHERE user_id = $1`, [userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Lỗi lấy favorites" });
  }
});

app.post('/api/favorites', async (req, res) => {
  try {
    const { userId, locationId, name, lat, lng, type } = req.body;
    await pool.query(`
      INSERT INTO favorites (user_id, location_id, location_name, location_lat, location_lng, location_type)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING
    `, [userId, locationId, name, lat, lng, type]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi thêm favorite" });
  }
});

app.delete('/api/favorites/:id', async (req, res) => {
  try {
    const { userId } = req.query;
    await pool.query(`DELETE FROM favorites WHERE location_id = $1 AND user_id = $2`, [req.params.id, userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi xóa favorite" });
  }
});

/* ============================================================
   ADMIN ZONE
===============================================================*/

app.get('/api/admin/check', async (req, res) => {
  try {
    const { userId } = req.query;
    const result = await pool.query(`SELECT role FROM user_roles WHERE user_id = $1`, [userId]);
    const isAdmin = result.rows.length > 0 && result.rows[0].role === 'admin';
    res.json({ isAdmin });
  } catch (err) {
    res.status(500).json({ error: "Lỗi kiểm tra admin" });
  }
});

/* ============================================================
   ADMIN – STORE MANAGEMENT
===============================================================*/

app.get('/api/admin/stores', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, p.email AS user_email
      FROM user_stores s
      LEFT JOIN profiles p ON s.user_id = p.id
      ORDER BY s.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.put('/api/admin/stores/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await pool.query(`UPDATE user_stores SET status = $1 WHERE id = $2`, [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi cập nhật trạng thái" });
  }
});

/* ============================================================
   ADMIN – CLAIMS (ĐÃ SỬA VÀ THÊM API SUBMIT)
===============================================================*/

// 👇 API QUAN TRỌNG ĐỂ SỬA LỖI POST /api/claims/submit 👇
app.post('/api/claims/submit', async (req, res) => {
  try {
    const { storeId, userId, role, phone, email, message, proofImage } = req.body;
    
    // Sử dụng dấu huyền ` cho chuỗi nhiều dòng
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
// --------------------------------------------------------

app.get('/api/admin/claims', async (req, res) => {
  try {
    // Sửa lại logic query cho đúng với bảng store_claims
    const query = `
      SELECT c.*, p.email AS claimant_email
      FROM store_claims c
      LEFT JOIN profiles p ON c.user_id = p.id
      WHERE c.status = 'pending'
      ORDER BY c.created_at DESC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Lỗi lấy claims" });
  }
});

app.post('/api/admin/claims/approve', async (req, res) => {
  const client = await pool.connect();
  try {
    const { claimId, storeId, userId } = req.body;
    await client.query("BEGIN");

    // 1. Chuyển quyền sở hữu store
    await client.query(`UPDATE user_stores SET user_id=$1, is_verified=true WHERE id=$2`, [userId, storeId]);

    // 2. Approve claim
    await client.query(`UPDATE store_claims SET status='approved' WHERE id=$1`, [claimId]);

    // 3. Reject các yêu cầu khác cho cùng store
    await client.query(`UPDATE store_claims SET status='rejected' WHERE store_id=$1 AND id != $2 AND status='pending'`, [storeId, claimId]);

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Lỗi xử lý claim" });
  } finally {
    client.release();
  }
});

app.post('/api/admin/claims/reject', async (req, res) => {
  try {
    await pool.query(`UPDATE store_claims SET status='rejected' WHERE id = $1`, [req.body.claimId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi reject claim" });
  }
});

/* ============================================================
   ADMIN – ADS & USERS & JOBS
===============================================================*/

app.get('/api/admin/ads', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM sponsored_listings ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.put('/api/admin/ads/cancel/:id', async (req, res) => {
  try {
    await pool.query(`UPDATE user_stores SET is_ad=false, ad_expiry=NULL WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi hủy quảng cáo" });
  }
});

app.get('/api/admin/jobs', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM jobs ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Lỗi jobs" });
  }
});

app.put('/api/admin/jobs/:id/status', async (req, res) => {
  try {
    await pool.query(`UPDATE jobs SET status=$1 WHERE id=$2`, [req.body.status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi cập nhật job" });
  }
});

app.delete('/api/admin/jobs/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM jobs WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi xóa job" });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM profiles ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM profiles WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi xóa user" });
  }
});

/* ============================================================
   PAYOS PAYMENT
===============================================================*/

app.post('/api/payment/create-checkout', async (req, res) => {
  try {
    const CLIENT_ID = process.env.PAYOS_CLIENT_ID;
    const API_KEY = process.env.PAYOS_API_KEY;
    const CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY;

    const { storeId, type, packageType, returnUrl, cancelUrl } = req.body;
    const orderCode = Number(String(Date.now()).slice(-9));
    let amount = 2000;
    let description = "";
    let pendingType = "";

    if (type === "vip") {
      amount = 100000;
      pendingType = "vip_lifetime";
      description = `VIP-${orderCode}`;
    }

    if (type === "ad") {
      if (packageType === "month") {
        amount = 150000;
        pendingType = "ad_month";
      } else {
        amount = 50000;
        pendingType = "ad_week";
      }
      description = `AD-${orderCode}`;
    }

    await pool.query(`
      UPDATE user_stores
      SET last_order_code=$1, pending_package_type=$2
      WHERE id=$3
    `, [orderCode, pendingType, storeId]);

    const raw = `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
    const hmac = crypto.createHmac("sha256", CHECKSUM_KEY);
    hmac.update(raw);
    const signature = hmac.digest("hex");

    const payload = {
      orderCode,
      amount,
      description,
      cancelUrl,
      returnUrl,
      signature,
      items: [
        { name: description, quantity: 1, price: amount }
      ]
    };

    const response = await fetch(
      "https://api-merchant.payos.vn/v2/payment-requests",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-id": CLIENT_ID,
          "x-api-key": API_KEY
        },
        body: JSON.stringify(payload)
      }
    );

    const result = await response.json();

    if (!response.ok || result.code !== "00") {
      throw new Error(result.desc || "Lỗi PayOS");
    }

    res.json({ checkoutUrl: result.data.checkoutUrl });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   START SERVER
===============================================================*/

const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại port ${PORT}`);
});