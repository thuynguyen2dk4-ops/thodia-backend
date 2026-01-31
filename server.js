const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
require('dotenv').config();

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
  user: 'postgres',
  host: '34.177.90.63',
  database: 'postgres',
  password: 'Thodiauni123@',
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

/*
  ❌ Lỗi trước đây:
  Bạn query user_saved_vouchers WHERE store_id -> bảng không có store_id
  → ĐÃ sửa phù hợp schema: JOIN voucher theo store_id
*/
app.get('/api/user_saved_vouchers/:storeId', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT v.*
      FROM user_saved_vouchers s
      JOIN store_vouchers v ON v.id = s.voucher_id
      WHERE v.store_id = $1
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

// 1. Lấy danh sách đánh giá (Sửa từ /list/:storeId thành /:storeId)
app.get('/api/reviews/:storeId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM location_reviews WHERE store_id = $1 ORDER BY created_at DESC',
      [req.params.storeId]
    );
    res.json(result.rows || []); 
  } catch (err) {
    console.error(err);
    res.status(500).json([]); // Trả về mảng rỗng để tránh lỗi "is not valid JSON"
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

// 3. Lấy điểm trung bình (Sửa đường dẫn cho gọn)
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

/*
  CREATE / UPDATE Store
  ❌ Sửa lỗi:
  - user_stores có nhiều cột không bắt buộc
  - Không tồn tại open_hours_en, description_en nếu bạn không dùng
  - mapbox_id chỉ dùng cho claim, bỏ qua khi user tạo store thủ công
*/
app.post('/api/stores/save',
  upload.fields([{ name: "avatar", maxCount: 1 }, { name: "gallery", maxCount: 10 }]),
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const {
        id,
        userId,
        name_vi,
        address_vi,
        phone,
        description_vi,
        category,
        lat,
        lng,
        is_premium,
        image_url
      } = req.body;

      const files = req.files;

      let storeId = id || null;
      let finalImage = image_url;

      // fake upload (Bạn có thể thay supabase hoặc cloudinary)
      if (files && files.avatar && files.avatar[0]) {
        finalImage = `https://fake-storage.com/${Date.now()}_${files.avatar[0].originalname}`;
      }

      // UPDATE
      if (storeId) {
        await client.query(`
          UPDATE user_stores SET
            name_vi=$1, address_vi=$2, phone=$3,
            description_vi=$4, category=$5, image_url=$6,
            lat=$7, lng=$8
          WHERE id=$9
        `, [
          name_vi, address_vi, phone,
          description_vi, category, finalImage,
          lat, lng, storeId
        ]);
      } else {
        // INSERT
        const insert = await client.query(`
          INSERT INTO user_stores (
            user_id, name_vi, address_vi, phone,
            description_vi, category, image_url,
            lat, lng, is_premium, status
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending'
          ) RETURNING id
        `, [
          userId, name_vi, address_vi, phone,
          description_vi, category, finalImage,
          lat, lng, is_premium || false
        ]);

        storeId = insert.rows[0].id;
      }

      // Insert gallery
      if (files && files.gallery) {
        for (const file of files.gallery) {
          const url = `https://fake-storage.com/gallery/${Date.now()}_${file.originalname}`;
          await client.query(`
            INSERT INTO store_gallery (store_id, image_url)
            VALUES ($1, $2)
          `, [storeId, url]);
        }
      }

      await client.query("COMMIT");
      res.json({ success: true, storeId });

    } catch (err) {
      await client.query("ROLLBACK");
      res.status(500).json({ error: "Lỗi lưu cửa hàng" });
    } finally {
      client.release();
    }
});

// Xóa store
app.delete('/api/stores/:id', async (req, res) => {
  try {
    await pool.query(`
      DELETE FROM user_stores WHERE id = $1
    `, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi xóa store" });
  }
});

/* ============================================================
   MENU CRUD
===============================================================*/

// Create menu item
app.post('/api/menu-items', async (req, res) => {
  try {
    const { store_id, name_vi, price, image_url, is_available } = req.body;

    await pool.query(`
      INSERT INTO store_menu_items
      (store_id, name_vi, price, image_url, is_available)
      VALUES ($1,$2,$3,$4,$5)
    `, [store_id, name_vi, price, image_url, is_available]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi tạo menu item" });
  }
});

// Update menu item
app.put('/api/menu-items/:id', async (req, res) => {
  try {
    const { name_vi, price, image_url, is_available } = req.body;

    await pool.query(`
      UPDATE store_menu_items
      SET name_vi=$1, price=$2, image_url=$3, is_available=$4
      WHERE id=$5
    `, [name_vi, price, image_url, is_available, req.params.id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi cập nhật menu item" });
  }
});

// Delete menu item
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
    const result = await pool.query(`
      SELECT * FROM store_vouchers WHERE store_id = $1
      ORDER BY created_at DESC
    `, [req.params.id]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

app.post('/api/vouchers', async (req, res) => {
  try {
    const {
      store_id, code, title_vi,
      discount_value, discount_type,
      min_order, end_date, is_active
    } = req.body;

    await pool.query(`
      INSERT INTO store_vouchers
      (store_id, code, title_vi, discount_value, discount_type, min_order, end_date, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [
      store_id, code, title_vi, discount_value,
      discount_type, min_order, end_date, is_active
    ]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi tạo voucher" });
  }
});

app.put('/api/vouchers/:id', async (req, res) => {
  try {
    const { code, title_vi, discount_value, is_active } = req.body;

    await pool.query(`
      UPDATE store_vouchers
      SET code=$1, title_vi=$2, discount_value=$3, is_active=$4
      WHERE id=$5
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
      INSERT INTO user_saved_vouchers (user_id, voucher_id)
      VALUES ($1,$2)
      ON CONFLICT DO NOTHING
    `, [userId, voucherId]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi lưu voucher vào ví" });
  }
});

// Get saved vouchers for user
app.get('/api/user-vouchers', async (req, res) => {
  try {
    const { userId } = req.query;

    const result = await pool.query(`
      SELECT v.*
      FROM user_saved_vouchers s
      JOIN store_vouchers v ON v.id = s.voucher_id
      WHERE s.user_id = $1
    `, [userId]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Lỗi lấy ví voucher" });
  }
});

/* ============================================================
   FAVORITES
===============================================================*/

// Get favorites
app.get('/api/favorites', async (req, res) => {
  try {
    const { userId } = req.query;

    const result = await pool.query(`
      SELECT * FROM favorites WHERE user_id = $1
    `, [userId]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Lỗi lấy favorites" });
  }
});

// Add favorite
app.post('/api/favorites', async (req, res) => {
  try {
    const { userId, locationId, name, lat, lng, type } = req.body;

    await pool.query(`
      INSERT INTO favorites
      (user_id, location_id, location_name, location_lat, location_lng, location_type)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT DO NOTHING
    `, [userId, locationId, name, lat, lng, type]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi thêm favorite" });
  }
});

// Delete favorite
app.delete('/api/favorites/:id', async (req, res) => {
  try {
    const { userId } = req.query;

    await pool.query(`
      DELETE FROM favorites 
      WHERE location_id = $1 AND user_id = $2
    `, [req.params.id, userId]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi xóa favorite" });
  }
});
/* ============================================================
   ADMIN ZONE
===============================================================*/

// Check admin role
app.get('/api/admin/check', async (req, res) => {
  try {
    const { userId } = req.query;

    const result = await pool.query(`
      SELECT role FROM user_roles WHERE user_id = $1
    `, [userId]);

    const isAdmin = result.rows.length > 0 && result.rows[0].role === 'admin';
    res.json({ isAdmin });
  } catch (err) {
    res.status(500).json({ error: "Lỗi kiểm tra admin" });
  }
});

/* ============================================================
   ADMIN – STORE MANAGEMENT
===============================================================*/

// Get all stores
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

// Update store status (Approve / Reject)
app.put('/api/admin/stores/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    await pool.query(`
      UPDATE user_stores SET status = $1 WHERE id = $2
    `, [status, req.params.id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi cập nhật trạng thái" });
  }
});

/* ============================================================
   ADMIN – CLAIMS (Sửa đúng theo schema thật)
===============================================================*/

/*
❌ Sai trước đây:
JOIN claims với store_stores bằng store_id
Nhưng bảng store_claims KHÔNG hề có store_id.

✔️ Đúng theo dump:
JOIN bằng mapbox_id
*/

app.get('/api/admin/claims', async (req, res) => {
  try {
    const query = `
      SELECT 
        c.*,
        p.email AS claimant_email,
        s.id AS store_id,
        s.name_vi AS store_name,
        owner.email AS owner_email
      FROM store_claims c
      LEFT JOIN profiles p ON c.user_id = p.id
      LEFT JOIN user_stores s ON c.mapbox_id = s.mapbox_id
      LEFT JOIN profiles owner ON s.user_id = owner.id
      WHERE c.status = 'pending'
      ORDER BY c.created_at DESC
    `;

    const result = await pool.query(query);

    const formatted = result.rows.map(r => ({
      ...r,
      claimant: { email: r.claimant_email },
      existingStore: r.store_id
        ? { id: r.store_id, name_vi: r.store_name, owner_email: r.owner_email }
        : null
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: "Lỗi lấy claims" });
  }
});

// Approve claim (FIXED 100%)
app.post('/api/admin/claims/approve', async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      claimId, mapboxId, userId,
      mapboxName, mapboxAddress,
      lat, lng, role, phone, proofImageUrl
    } = req.body;

    await client.query("BEGIN");

    // Check store exists
    const exists = await client.query(`
      SELECT id FROM user_stores WHERE mapbox_id = $1
    `, [mapboxId]);

    if (exists.rows.length > 0) {
      // Update owner
      await client.query(`
        UPDATE user_stores
        SET user_id=$1, name_vi=$2, address_vi=$3, lat=$4, lng=$5,
            is_verified=true, status='approved'
        WHERE mapbox_id=$6
      `, [userId, mapboxName, mapboxAddress, lat, lng, mapboxId]);

    } else {
      // Create new verified store
      await client.query(`
        INSERT INTO user_stores (
          user_id, mapbox_id, name_vi, address_vi,
          lat, lng, category,
          is_verified, status, description_vi, image_url
        ) VALUES (
          $1,$2,$3,$4,$5,$6,'checkin',
          true,'approved',$7,$8
        )
      `, [
        userId, mapboxId, mapboxName, mapboxAddress,
        lat, lng,
        `Đã xác minh: ${role}. LH: ${phone}`,
        proofImageUrl
      ]);
    }

    // Mark claim approved
    await client.query(`
      UPDATE store_claims SET status='approved'
      WHERE id=$1
    `, [claimId]);

    // Reject other claims same location
    await client.query(`
      UPDATE store_claims
      SET status='rejected'
      WHERE mapbox_id=$1 AND id != $2 AND status='pending'
    `, [mapboxId, claimId]);

    await client.query("COMMIT");
    res.json({ success: true });

  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Lỗi xử lý claim" });
  } finally {
    client.release();
  }
});

// Reject claim
app.post('/api/admin/claims/reject', async (req, res) => {
  try {
    await pool.query(`
      UPDATE store_claims SET status='rejected'
      WHERE id = $1
    `, [req.body.claimId]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi reject claim" });
  }
});

/* ============================================================
   ADMIN – ADS
===============================================================*/

app.get('/api/admin/ads', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM sponsored_listings
      ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

// Cancel Ads
app.put('/api/admin/ads/cancel/:id', async (req, res) => {
  try {
    await pool.query(`
      UPDATE user_stores
      SET is_ad=false, ad_expiry=NULL
      WHERE id=$1
    `, [req.params.id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi hủy quảng cáo" });
  }
});

/* ============================================================
   ADMIN – JOBS
===============================================================*/

app.get('/api/admin/jobs', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM jobs ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Lỗi jobs" });
  }
});

app.put('/api/admin/jobs/:id/status', async (req, res) => {
  try {
    await pool.query(`
      UPDATE jobs SET status=$1 WHERE id=$2
    `, [req.body.status, req.params.id]);

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

/* ============================================================
   ADMIN – USERS
===============================================================*/

app.get('/api/admin/users', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM profiles ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    await pool.query(`
      DELETE FROM profiles WHERE id = $1
    `, [req.params.id]);

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

    // Save pending state
    await pool.query(`
      UPDATE user_stores
      SET last_order_code=$1, pending_package_type=$2
      WHERE id=$3
    `, [orderCode, pendingType, storeId]);

    // Create signature
    const raw = `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
    const hmac = crypto.createHmac("sha256", CHECKSUM_KEY);
    hmac.update(raw);
    const signature = hmac.digest("hex");

    // Call PayOS API
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
