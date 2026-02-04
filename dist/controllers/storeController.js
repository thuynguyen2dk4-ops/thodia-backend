"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteGalleryImage = exports.getStoreGallery = exports.deleteMenuItem = exports.saveMenuItem = exports.getStoreMenu = exports.searchStores = exports.getApprovedStores = exports.getStorePublic = exports.deleteStore = exports.getUserStores = exports.saveStore = void 0;
const db_1 = require("../config/db");
const gcpStorage_1 = require("../services/gcpStorage");
// ==================================================================
// PHẦN 1: QUẢN LÝ THÔNG TIN CỬA HÀNG (CRUD)
// ==================================================================
// 1. Lưu Cửa hàng (Tạo mới hoặc Cập nhật)
const saveStore = async (req, res) => {
    try {
        const body = req.body;
        const { id, userId, name_vi, address_vi, phone, category, lat, lng, description_vi, is_premium } = body;
        if (!userId)
            return res.status(400).json({ error: "Thiếu User ID" });
        let image_url = body.image_url || '';
        const files = req.files;
        // Xử lý Avatar
        if (files && files['avatar'] && files['avatar'][0]) {
            try {
                console.log("🖼️ Đang upload avatar...");
                image_url = await (0, gcpStorage_1.uploadToGCP)(files['avatar'][0]);
            }
            catch (e) {
                console.error(e);
            }
        }
        const isPremiumBool = String(is_premium) === 'true';
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        let storeId = id;
        // 1. Lưu thông tin Store trước
        if (id) {
            await db_1.pool.query(`UPDATE user_stores 
                 SET name_vi=$1, address_vi=$2, phone=$3, category=$4, lat=$5, lng=$6, description_vi=$7, is_premium=$8, image_url=$9 
                 WHERE id=$10`, [name_vi, address_vi, phone, category, latNum, lngNum, description_vi, isPremiumBool, image_url, id]);
        }
        else {
            const newStore = await db_1.pool.query(`INSERT INTO user_stores 
                 (user_id, name_vi, address_vi, phone, category, lat, lng, description_vi, is_premium, image_url, status) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending') 
                 RETURNING id`, [userId, name_vi, address_vi, phone, category, latNum, lngNum, description_vi, isPremiumBool, image_url]);
            storeId = newStore.rows[0].id;
        }
        // 2. Xử lý Gallery (Nếu có) - Chỉ dành cho Store đã có ID
        if (storeId && files && files['gallery']) {
            console.log(`🖼️ Đang xử lý Gallery cho Store ID: ${storeId}`);
            // [AUTO-FIX DB] Đảm bảo bảng store_gallery tồn tại
            try {
                await db_1.pool.query(`
                    CREATE TABLE IF NOT EXISTS store_gallery (
                        id SERIAL PRIMARY KEY,
                        store_id INT REFERENCES user_stores(id) ON DELETE CASCADE,
                        image_url TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT NOW()
                    )
                `);
            }
            catch (e) { }
            const galleryFiles = files['gallery'];
            // Duyệt qua từng file trong mảng gallery và upload
            for (const file of galleryFiles) {
                try {
                    const galleryUrl = await (0, gcpStorage_1.uploadToGCP)(file);
                    console.log(`✅ Upload gallery thành công: ${galleryUrl}`);
                    // Lưu vào DB
                    await db_1.pool.query(`INSERT INTO store_gallery (store_id, image_url, created_at) VALUES ($1, $2, NOW())`, [storeId, galleryUrl]);
                }
                catch (e) {
                    console.error("❌ Lỗi upload gallery:", e);
                }
            }
        }
        res.json({ success: true, id: storeId });
    }
    catch (err) {
        console.error("Save Store Error:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.saveStore = saveStore;
// 2. Lấy danh sách cửa hàng của User
const getUserStores = async (req, res) => {
    try {
        const { userId } = req.query;
        const result = await db_1.pool.query('SELECT * FROM user_stores WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
        const formattedRows = result.rows.map(row => ({
            ...row,
            lat: parseFloat(row.lat),
            lng: parseFloat(row.lng)
        }));
        res.json(formattedRows);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.getUserStores = getUserStores;
// 3. Xóa cửa hàng
const deleteStore = async (req, res) => {
    try {
        const { id } = req.params;
        await db_1.pool.query('DELETE FROM user_stores WHERE id = $1', [id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.deleteStore = deleteStore;
// ==================================================================
// PHẦN 2: DỮ LIỆU PUBLIC
// ==================================================================
const getStorePublic = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db_1.pool.query('SELECT * FROM user_stores WHERE id = $1', [id]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: "Not found" });
        const store = result.rows[0];
        store.lat = parseFloat(store.lat);
        store.lng = parseFloat(store.lng);
        res.json(store);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.getStorePublic = getStorePublic;
const getApprovedStores = async (req, res) => {
    try {
        const result = await db_1.pool.query("SELECT * FROM user_stores WHERE status = 'approved' ORDER BY is_premium DESC");
        const formattedRows = result.rows.map(row => ({
            ...row,
            lat: parseFloat(row.lat),
            lng: parseFloat(row.lng)
        }));
        res.json(formattedRows);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.getApprovedStores = getApprovedStores;
const searchStores = async (req, res) => {
    try {
        const q = `%${req.query.q}%`;
        const result = await db_1.pool.query("SELECT * FROM user_stores WHERE (name_vi ILIKE $1 OR address_vi ILIKE $1) AND status='approved' LIMIT 20", [q]);
        const formattedRows = result.rows.map(row => ({
            ...row,
            lat: parseFloat(row.lat),
            lng: parseFloat(row.lng)
        }));
        res.json(formattedRows);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.searchStores = searchStores;
// ==================================================================
// PHẦN 3: QUẢN LÝ MENU
// ==================================================================
const getStoreMenu = async (req, res) => {
    try {
        const { id } = req.params;
        // [AUTO-FIX DB]
        try {
            await db_1.pool.query("ALTER TABLE store_menu_items ADD COLUMN IF NOT EXISTS name_vi VARCHAR(255)");
            await db_1.pool.query("ALTER TABLE store_menu_items ADD COLUMN IF NOT EXISTS name VARCHAR(255)");
            await db_1.pool.query("ALTER TABLE store_menu_items ADD COLUMN IF NOT EXISTS description_vi TEXT");
            await db_1.pool.query("ALTER TABLE store_menu_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()");
        }
        catch (e) { }
        const result = await db_1.pool.query('SELECT * FROM store_menu_items WHERE store_id = $1 ORDER BY created_at DESC', [id]);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.getStoreMenu = getStoreMenu;
const saveMenuItem = async (req, res) => {
    try {
        // [AUTO-FIX DB]
        try {
            await db_1.pool.query("ALTER TABLE store_menu_items ADD COLUMN IF NOT EXISTS name_vi VARCHAR(255)");
            await db_1.pool.query("ALTER TABLE store_menu_items ADD COLUMN IF NOT EXISTS name VARCHAR(255)");
            await db_1.pool.query("ALTER TABLE store_menu_items ADD COLUMN IF NOT EXISTS description_vi TEXT");
            await db_1.pool.query("ALTER TABLE store_menu_items ADD COLUMN IF NOT EXISTS image_url TEXT");
            await db_1.pool.query("ALTER TABLE store_menu_items ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE");
            await db_1.pool.query("ALTER TABLE store_menu_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()");
        }
        catch (e) {
            console.warn("⚠️ Auto-fix DB warning:", e);
        }
        const { id } = req.params;
        const { store_id, storeId, name_vi, name, price, description_vi, description, is_available } = req.body;
        const finalStoreId = store_id || storeId;
        const finalName = name_vi || name || 'Món mới';
        const finalDesc = description_vi || description || '';
        const finalPrice = price || 0;
        let image_url = req.body.image_url || '';
        const files = req.files;
        if (files && files['image'] && files['image'][0]) {
            image_url = await (0, gcpStorage_1.uploadToGCP)(files['image'][0]);
        }
        if (id) {
            await db_1.pool.query(`UPDATE store_menu_items 
                 SET name=$1, name_vi=$2, price=$3, description_vi=$4, image_url=$5, is_available=$6 
                 WHERE id=$7`, [finalName, finalName, finalPrice, finalDesc, image_url, is_available, id]);
        }
        else {
            if (!finalStoreId)
                return res.status(400).json({ error: "Thiếu Store ID" });
            await db_1.pool.query(`INSERT INTO store_menu_items (store_id, name, name_vi, price, description_vi, image_url, is_available, created_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`, [finalStoreId, finalName, finalName, finalPrice, finalDesc, image_url, is_available || true]);
        }
        res.json({ success: true });
    }
    catch (err) {
        console.error("❌ Save Menu Error:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.saveMenuItem = saveMenuItem;
const deleteMenuItem = async (req, res) => {
    try {
        const { itemId } = req.params;
        await db_1.pool.query('DELETE FROM store_menu_items WHERE id = $1', [itemId]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.deleteMenuItem = deleteMenuItem;
// ==================================================================
// PHẦN 4: QUẢN LÝ GALLERY (ĐÃ SỬA LỖI KHÔNG HIỆN VÀ KHÔNG XÓA ĐƯỢC)
// ==================================================================
const getStoreGallery = async (req, res) => {
    console.log("👉 [DEBUG] Đang lấy Gallery cho Store:", req.params.id);
    try {
        const { id } = req.params;
        // [AUTO-FIX DB] Đảm bảo bảng tồn tại và có đủ cột
        try {
            await db_1.pool.query(`
                CREATE TABLE IF NOT EXISTS store_gallery (
                    id SERIAL PRIMARY KEY,
                    store_id INT REFERENCES user_stores(id) ON DELETE CASCADE,
                    image_url TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            `);
        }
        catch (e) { }
        const result = await db_1.pool.query('SELECT * FROM store_gallery WHERE store_id = $1 ORDER BY created_at DESC', [id]);
        console.log(`✅ [DEBUG] Tìm thấy ${result.rows.length} ảnh.`);
        res.json(result.rows);
    }
    catch (err) {
        console.error("❌ Get Gallery Error:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.getStoreGallery = getStoreGallery;
const deleteGalleryImage = async (req, res) => {
    console.log("👉 [DEBUG] Đang xóa ảnh Gallery ID:", req.params.imageId);
    try {
        const { imageId } = req.params;
        // Xóa ảnh dựa trên ID của ảnh (cột id trong store_gallery)
        const result = await db_1.pool.query('DELETE FROM store_gallery WHERE id = $1', [imageId]);
        if (result.rowCount === 0) {
            console.warn("⚠️ Không tìm thấy ảnh để xóa (ID có thể sai)");
            return res.status(404).json({ error: "Ảnh không tồn tại" });
        }
        console.log("✅ Xóa ảnh thành công!");
        res.json({ success: true });
    }
    catch (err) {
        console.error("❌ Delete Gallery Error:", err);
        res.status(500).json({ error: err.message });
    }
};
exports.deleteGalleryImage = deleteGalleryImage;
